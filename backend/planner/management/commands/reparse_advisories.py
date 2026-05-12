import json

from django.core.management.base import BaseCommand

from assist.advisory_parser import get_cached_advisory_parse
from assist.models import AssistCache


class Command(BaseCommand):
    help = 'Re-parse every old advisory: cache entry with the new v2 schema (series_groups + flags)'

    def handle(self, *args, **options):
        old = AssistCache.objects.filter(major_code__startswith='advisory:')
        if not old.exists():
            self.stdout.write('No old advisory entries to re-parse.')
            return

        for row in old:
            agreement_key = row.major_code.replace('advisory:', '', 1)
            try:
                art_cache = AssistCache.objects.get(
                    receiving_institution_id=0,
                    sending_institution_id=0,
                    academic_year_id=0,
                    major_code=agreement_key,
                )
            except AssistCache.DoesNotExist:
                self.stdout.write(self.style.WARNING(f'SKIP {agreement_key}: no articulation cache'))
                continue

            data = art_cache.raw_json or {}
            result = data.get('result', {})
            raw_tpl = result.get('templateAssets', '[]')
            template = json.loads(raw_tpl) if isinstance(raw_tpl, str) else raw_tpl

            template_iter = template if isinstance(template, list) else []
            advisory_html = '\n'.join(
                g.get('content', '') for g in template_iter
                if isinstance(g, dict) and g.get('type') == 'GeneralText' and g.get('content', '').strip()
            )

            template_cells = {}
            for group in template_iter:
                if not isinstance(group, dict):
                    continue
                for section in group.get('sections', []) or []:
                    if not isinstance(section, dict):
                        continue
                    for tr in section.get('rows', []) or []:
                        if not isinstance(tr, dict):
                            continue
                        for cell in tr.get('cells', []) or []:
                            if not isinstance(cell, dict):
                                continue
                            cid = cell.get('id')
                            course = cell.get('course', {}) or {}
                            if cid and course:
                                code = f"{course.get('prefix', '')}{course.get('courseNumber', '')}"
                                template_cells[cid] = code
            valid_codes = set(template_cells.values())

            if not advisory_html or not valid_codes:
                self.stdout.write(self.style.WARNING(f'SKIP {agreement_key}: no advisory html or codes'))
                continue

            v2 = AssistCache.objects.filter(
                receiving_institution_id=-1, sending_institution_id=-1,
                academic_year_id=-1, major_code=f'advisory_v2:{agreement_key}'
            )
            if v2.exists():
                self.stdout.write(f'SKIP {agreement_key}: v2 already cached')
                continue

            self.stdout.write(f'Re-parsing {agreement_key}...')
            try:
                get_cached_advisory_parse(agreement_key, advisory_html, valid_codes)
                self.stdout.write(self.style.SUCCESS(f'OK {agreement_key}'))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'FAIL {agreement_key}: {e}'))

        self.stdout.write(self.style.SUCCESS('Done.'))
