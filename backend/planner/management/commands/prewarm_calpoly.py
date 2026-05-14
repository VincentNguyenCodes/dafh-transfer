import time

from django.core.management.base import BaseCommand

from planner.calpoly_scraper import _get_slug_map, prewarm_major


class Command(BaseCommand):
    help = 'Pre-warm the Cal Poly SLO admissions parse cache for every major in their transfer directory'

    def add_arguments(self, parser):
        parser.add_argument('--sleep', type=float, default=1.5)
        parser.add_argument('--max', type=int, default=0)

    def handle(self, *args, **options):
        slug_map = _get_slug_map()
        if not slug_map:
            self.stdout.write(self.style.ERROR('No Cal Poly slug map available'))
            return

        majors = list(slug_map.items())
        if options['max']:
            majors = majors[:options['max']]

        self.stdout.write(self.style.SUCCESS(f'Pre-warming {len(majors)} Cal Poly majors...'))
        ok = cached = failed = 0
        for i, (name, _slug) in enumerate(majors, 1):
            status = prewarm_major(name)
            if status == 'ok':
                ok += 1
                style = self.style.SUCCESS
            elif status == 'cached':
                cached += 1
                style = self.style.NOTICE
            else:
                failed += 1
                style = self.style.WARNING
            self.stdout.write(style(f'  [{i}/{len(majors)}] {status:7} {name}'))
            if status == 'ok':
                time.sleep(options['sleep'])

        self.stdout.write(self.style.SUCCESS(f'\nDone. ok={ok} cached={cached} failed={failed}'))
