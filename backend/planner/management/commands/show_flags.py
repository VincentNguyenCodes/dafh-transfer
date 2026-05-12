from django.core.management.base import BaseCommand

from assist.models import AssistCache


class Command(BaseCommand):
    help = 'Print all advisory parses that Claude flagged as having edge cases'

    def handle(self, *args, **options):
        rows = AssistCache.objects.filter(major_code__startswith='advisory_v2:')
        if not rows.exists():
            self.stdout.write('No v2 advisory cache entries found yet. Trigger /api/results/ to populate.')
            return

        any_flags = False
        for r in rows:
            data = r.raw_json or {}
            flags = data.get('flags', [])
            agreement_key = data.get('agreement_key') or r.major_code.replace('advisory_v2:', '')
            series_groups = data.get('series_groups', [])

            if not flags and not series_groups:
                continue

            any_flags = True
            self.stdout.write(self.style.WARNING(f'=== {agreement_key} ==='))
            for f in flags:
                self.stdout.write(f'  [flag] {f}')
            for sg in series_groups:
                label = sg.get('label', 'series')
                option_names = [opt.get('name', '?') for opt in sg.get('options', [])]
                self.stdout.write(f'  [series] {label}: {", ".join(option_names)}')
            self.stdout.write('')

        if not any_flags:
            self.stdout.write(self.style.SUCCESS('No flagged or series advisories. All parses look clean.'))
