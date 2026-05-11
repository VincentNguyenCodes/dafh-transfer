from datetime import timedelta

from django.utils import timezone

from assist.client import get_agreements, get_articulation
from assist.constants import DEANZA_ID, FOOTHILL_ID, LATEST_YEAR_ID
from assist.models import AssistCache
from transcripts.parser import normalize_course_code


def fetch_or_cache_articulation(key: str) -> dict:
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=0,
            sending_institution_id=0,
            academic_year_id=0,
            major_code=key,
        )
        if cached.cached_at >= timezone.now() - timedelta(days=7):
            return cached.raw_json
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    data = get_articulation(key)
    AssistCache.objects.create(
        receiving_institution_id=0,
        sending_institution_id=0,
        academic_year_id=0,
        major_code=key,
        raw_json=data,
    )
    return data


def get_keys_for_target(receiving_id: int, sending_id: int, academic_year_id: int, major_label: str) -> list[str]:
    try:
        reports_data = get_agreements(receiving_id, sending_id, academic_year_id)
        reports = reports_data.get('reports', []) if isinstance(reports_data, dict) else reports_data
        return [r['key'] for r in reports if r.get('label', '').lower() == major_label.lower()]
    except Exception:
        return []


def parse_ccc_courses(articulation_json: dict) -> list[dict]:
    import json as _json
    courses = []
    seen = set()
    try:
        result = articulation_json.get('result', {})
        raw = result.get('articulations', '[]')
        articulations = _json.loads(raw) if isinstance(raw, str) else raw

        for art_row in articulations:
            sending = art_row.get('articulation', {}).get('sendingArticulation', {})
            if sending.get('noArticulationReason'):
                continue
            for item_group in sending.get('items', []):
                for course_item in item_group.get('items', []):
                    if course_item.get('type') != 'Course':
                        continue
                    code = f"{course_item.get('prefix', '')} {course_item.get('courseNumber', '')}".strip()
                    if not code or code in seen:
                        continue
                    seen.add(code)
                    courses.append({
                        'course_code': code,
                        'course_name': course_item.get('courseTitle', ''),
                        'units': course_item.get('maxUnits') or course_item.get('minUnits'),
                    })
    except (AttributeError, KeyError, TypeError, ValueError):
        pass
    return courses


def compute_remaining(user) -> list[dict]:
    from transcripts.models import TranscriptEntry
    from .models import TransferTarget

    def normalized_set(codes):
        return codes | {normalize_course_code(c) for c in codes}

    completed_raw = set(
        TranscriptEntry.objects.filter(user=user, status='completed').values_list('course_code', flat=True)
    )
    in_progress_raw = set(
        TranscriptEntry.objects.filter(user=user, status='in_progress').values_list('course_code', flat=True)
    )
    completed_codes = normalized_set(completed_raw)
    in_progress_codes = normalized_set(in_progress_raw)

    targets = TransferTarget.objects.filter(user=user)
    required_map = {}

    for target in targets:
        target_label = f'{target.receiving_institution_name} - {target.major_name}'
        year_id = target.academic_year_id or LATEST_YEAR_ID

        for sending_id in [DEANZA_ID, FOOTHILL_ID]:
            school_label = 'deanza' if sending_id == DEANZA_ID else 'foothill'
            keys = get_keys_for_target(
                target.receiving_institution_id, sending_id, year_id, target.major_name
            )

            for key in keys:
                try:
                    articulation = fetch_or_cache_articulation(key)
                except Exception:
                    continue

                for course in parse_ccc_courses(articulation):
                    code = course['course_code'].strip()
                    if not code:
                        continue
                    if code not in required_map:
                        required_map[code] = {**course, 'school': school_label, 'satisfies': []}
                    if target_label not in required_map[code]['satisfies']:
                        required_map[code]['satisfies'].append(target_label)

    remaining = [
        {**info, 'in_progress': info['course_code'] in in_progress_codes}
        for code, info in required_map.items()
        if code not in completed_codes
    ]
    remaining.sort(key=lambda c: (c['school'], c['course_code']))
    return remaining
