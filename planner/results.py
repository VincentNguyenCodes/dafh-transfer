from datetime import timedelta

from django.utils import timezone

from assist.client import get_agreements
from assist.models import AssistCache

DEANZA_ID = 113
FOOTHILL_ID = 112


def fetch_or_cache(receiving_id, sending_id, academic_year_id, major_code):
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=receiving_id,
            sending_institution_id=sending_id,
            academic_year_id=academic_year_id,
            major_code=major_code,
        )
        if cached.cached_at >= timezone.now() - timedelta(days=7):
            return cached.raw_json
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    data = get_agreements(receiving_id, sending_id, academic_year_id, major_code)
    AssistCache.objects.create(
        receiving_institution_id=receiving_id,
        sending_institution_id=sending_id,
        academic_year_id=academic_year_id,
        major_code=major_code,
        raw_json=data,
    )
    return data


def parse_ccc_courses(agreement_json):
    courses = []
    try:
        sections = agreement_json.get('result', {}).get('groups', [])
        for section in sections:
            for row in section.get('rows', []):
                for cell in row.get('cells', []):
                    if cell.get('position') == 'Sending':
                        for course in cell.get('courses', []):
                            courses.append({
                                'course_code': course.get('courseIdentifierParenthetical') or course.get('prefix', '') + ' ' + course.get('courseNumber', ''),
                                'course_name': course.get('courseName', ''),
                                'units': course.get('maxUnits') or course.get('minUnits'),
                            })
    except (AttributeError, KeyError, TypeError):
        pass
    return courses


def compute_remaining(user):
    from transcripts.models import TranscriptEntry
    from .models import TransferTarget

    completed_codes = set(
        TranscriptEntry.objects.filter(user=user, status='completed').values_list('course_code', flat=True)
    )
    in_progress_codes = set(
        TranscriptEntry.objects.filter(user=user, status='in_progress').values_list('course_code', flat=True)
    )
    targets = TransferTarget.objects.filter(user=user)

    required_map = {}

    for target in targets:
        target_label = f'{target.receiving_institution_name} - {target.major_name}'
        for sending_id in [DEANZA_ID, FOOTHILL_ID]:
            school_label = 'deanza' if sending_id == DEANZA_ID else 'foothill'
            try:
                data = fetch_or_cache(
                    target.receiving_institution_id,
                    sending_id,
                    target.academic_year_id,
                    target.major_code,
                )
            except Exception:
                continue

            for course in parse_ccc_courses(data):
                code = course['course_code'].strip()
                if not code:
                    continue
                if code not in required_map:
                    required_map[code] = {**course, 'school': school_label, 'satisfies': []}
                if target_label not in required_map[code]['satisfies']:
                    required_map[code]['satisfies'].append(target_label)

    remaining = []
    for code, info in required_map.items():
        if code not in completed_codes:
            remaining.append({
                **info,
                'in_progress': code in in_progress_codes,
            })

    remaining.sort(key=lambda c: (c['school'], c['course_code']))
    return remaining
