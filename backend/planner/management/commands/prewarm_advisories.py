import json
import time
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand

from assist.advisory_parser import get_cached_advisory_parse
from assist.client import get_agreements, get_receiving_institutions
from assist.constants import DEANZA_ID, FOOTHILL_ID, LATEST_YEAR_ID
from assist.models import AssistCache


ENUM_PATH = Path(settings.BASE_DIR) / 'prewarm_enumeration.json'


class Command(BaseCommand):
    help = 'Pre-warm the advisory parse cache. Resumable: save enumeration to disk, save each parse to DB, auto-stop on rate limit.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Re-enumerate schools/majors (deletes prewarm_enumeration.json)')
        parser.add_argument('--sleep', type=float, default=2.0, help='Seconds between articulation requests (default 2.0)')
        parser.add_argument('--max', type=int, default=0, help='Cap on advisories parsed this run (0 = no cap)')
        parser.add_argument('--max-fails', type=int, default=3, help='Stop after this many consecutive 429s (default 3)')

    def handle(self, *args, **options):
        if options['reset'] and ENUM_PATH.exists():
            ENUM_PATH.unlink()
            self.stdout.write('Deleted cached enumeration.')

        agreements = self._load_or_enumerate(options['sleep'])
        if not agreements:
            self.stdout.write(self.style.ERROR('No agreements available. Aborting.'))
            return

        cached = set(
            AssistCache.objects.filter(major_code__startswith='advisory_v2:')
            .values_list('major_code', flat=True)
        )
        todo = [a for a in agreements if f'advisory_v2:{a["key"]}' not in cached]

        total = len(agreements)
        done = total - len(todo)
        self.stdout.write(self.style.SUCCESS(
            f'\nTotal agreements: {total}\n'
            f'Already parsed: {done}  ({done * 100 // max(total, 1)}%)\n'
            f'Remaining: {len(todo)}'
        ))

        max_count = options['max']
        if max_count > 0:
            todo = todo[:max_count]
            self.stdout.write(f'Capped this run to {max_count} per --max')

        if not todo:
            self.stdout.write(self.style.SUCCESS('Nothing to do.'))
            return

        self.stdout.write(self.style.NOTICE(f'\nProcessing {len(todo)} agreements (sleep {options["sleep"]}s)...\n'))

        ok = fail = 0
        consecutive_429 = 0
        max_fails = options['max_fails']

        for i, a in enumerate(todo, 1):
            label = f'{a["sending_label"]} -> {a["receiving_name"]} / {a["major"]}'
            try:
                from planner.results import fetch_or_cache_articulation
                art = fetch_or_cache_articulation(a['key'])
                if not art:
                    self.stdout.write(f'[{i}/{len(todo)}] SKIP {label}: no articulation')
                    continue

                result = art.get('result', {})
                raw_tpl = result.get('templateAssets', '[]')
                tpl = json.loads(raw_tpl) if isinstance(raw_tpl, str) else raw_tpl
                tpl = tpl if isinstance(tpl, list) else []

                advisory_html = '\n'.join(
                    g.get('content', '') for g in tpl
                    if isinstance(g, dict) and g.get('type') == 'GeneralText' and g.get('content', '').strip()
                )

                valid_codes = set()
                for g in tpl:
                    if not isinstance(g, dict):
                        continue
                    for section in g.get('sections', []) or []:
                        if not isinstance(section, dict):
                            continue
                        for row in section.get('rows', []) or []:
                            if not isinstance(row, dict):
                                continue
                            for cell in row.get('cells', []) or []:
                                if not isinstance(cell, dict):
                                    continue
                                course = cell.get('course') or {}
                                if course:
                                    valid_codes.add(f"{course.get('prefix', '')}{course.get('courseNumber', '')}")

                if not advisory_html or not valid_codes:
                    self.stdout.write(f'[{i}/{len(todo)}] SKIP {label}: empty advisory')
                    continue

                get_cached_advisory_parse(a['key'], advisory_html, valid_codes)
                ok += 1
                consecutive_429 = 0
                self.stdout.write(f'[{i}/{len(todo)}] OK {label}')
            except requests.HTTPError as e:
                status = getattr(e.response, 'status_code', None)
                if status == 429:
                    consecutive_429 += 1
                    fail += 1
                    self.stdout.write(self.style.WARNING(f'[{i}/{len(todo)}] 429 {label}'))
                    if consecutive_429 >= max_fails:
                        self.stdout.write(self.style.ERROR(
                            f'\nHit {max_fails} consecutive 429s. ASSIST is rate-limiting us.\n'
                            f'Stopping. Wait ~30-60 min and run the command again to resume.\n'
                        ))
                        break
                else:
                    fail += 1
                    self.stdout.write(self.style.ERROR(f'[{i}/{len(todo)}] HTTP {status} {label}: {e}'))
            except Exception as e:
                fail += 1
                self.stdout.write(self.style.ERROR(f'[{i}/{len(todo)}] FAIL {label}: {e}'))
                consecutive_429 = 0

            time.sleep(options['sleep'])

        self.stdout.write(self.style.SUCCESS(f'\nThis run: OK={ok}  FAIL={fail}'))

        remaining = AssistCache.objects.filter(major_code__startswith='advisory_v2:').count()
        self.stdout.write(f'Total cached now: {remaining} / {total} ({remaining * 100 // max(total, 1)}%)')

    def _load_or_enumerate(self, sleep_secs):
        if ENUM_PATH.exists():
            try:
                data = json.loads(ENUM_PATH.read_text())
                self.stdout.write(f'Loaded {len(data)} agreements from {ENUM_PATH.name}')
                return data
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'Failed to load enumeration: {e}, will re-enumerate'))

        self.stdout.write(self.style.NOTICE('Enumerating all schools and majors (one-time, saved to disk)...'))
        year_id = LATEST_YEAR_ID
        all_agreements = []

        for sending_id, sending_label in [(DEANZA_ID, 'De Anza'), (FOOTHILL_ID, 'Foothill')]:
            self.stdout.write(f'  Fetching receivers for {sending_label}...')
            try:
                receivers = get_receiving_institutions(sending_id) or []
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  Failed: {e}'))
                continue
            time.sleep(sleep_secs)

            for inst in receivers:
                recv_id = inst.get('institutionParentId') or inst.get('id')
                recv_name = inst.get('institutionName') or inst.get('name', '?')
                if not recv_id:
                    continue
                try:
                    agreements_data = get_agreements(recv_id, sending_id, year_id)
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'    skip {recv_name}: {e}'))
                    continue
                time.sleep(sleep_secs)

                reports = agreements_data.get('reports', []) if isinstance(agreements_data, dict) else []
                for r in reports:
                    key = r.get('key')
                    label = r.get('label', '')
                    if not key:
                        continue
                    all_agreements.append({
                        'key': key,
                        'sending_id': sending_id,
                        'sending_label': sending_label,
                        'receiving_id': recv_id,
                        'receiving_name': recv_name,
                        'major': label,
                    })

        ENUM_PATH.write_text(json.dumps(all_agreements, indent=2))
        self.stdout.write(self.style.SUCCESS(f'Saved {len(all_agreements)} agreements to {ENUM_PATH.name}'))
        return all_agreements
