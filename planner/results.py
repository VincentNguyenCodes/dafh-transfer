import json as _json
from datetime import timedelta

from django.utils import timezone

from assist.client import get_agreements, get_articulation
from assist.constants import DEANZA_ID, FOOTHILL_ID, LATEST_YEAR_ID
from assist.models import AssistCache
from transcripts.parser import normalize_course_code


def _normalized_set(codes: set) -> set:
    return codes | {normalize_course_code(c) for c in codes}


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


def get_keys_for_target(receiving_id: int, sending_id: int, academic_year_id: int, major_label: str) -> list:
    try:
        data = get_agreements(receiving_id, sending_id, academic_year_id)
        reports = data.get('reports', []) if isinstance(data, dict) else []
        return [r['key'] for r in reports if r.get('label', '').lower() == major_label.lower()]
    except Exception:
        return []


def _school_label(sending_id: int) -> str:
    return 'deanza' if sending_id == DEANZA_ID else 'foothill'


def _parse_requirements(articulation_json: dict, completed_codes: set, school: str) -> list:
    requirements = []
    try:
        result = articulation_json.get('result', {})
        raw_arts = result.get('articulations', '[]')
        articulations = _json.loads(raw_arts) if isinstance(raw_arts, str) else raw_arts
        raw_tpl = result.get('templateAssets', '[]')
        template = _json.loads(raw_tpl) if isinstance(raw_tpl, str) else raw_tpl

        template_cells = {}
        for group in template:
            for section in group.get('sections', []):
                for row in section.get('rows', []):
                    for cell in row.get('cells', []):
                        cell_id = cell.get('id')
                        course = cell.get('course', {})
                        if cell_id and course:
                            template_cells[cell_id] = {
                                'code': f"{course.get('prefix', '')}{course.get('courseNumber', '')}",
                                'name': course.get('courseTitle', ''),
                            }

        for art_row in articulations:
            cell_id = art_row.get('templateCellId')
            recv_info = template_cells.get(cell_id, {})
            recv_course = art_row.get('articulation', {}).get('course', {})
            recv_code = recv_info.get('code') or f"{recv_course.get('prefix', '')}{recv_course.get('courseNumber', '')}"
            recv_name = recv_info.get('name') or recv_course.get('courseTitle', '')

            sending = art_row.get('articulation', {}).get('sendingArticulation', {})
            no_art = sending.get('noArticulationReason')

            if no_art:
                requirements.append({
                    'receiving_code': recv_code,
                    'receiving_name': recv_name,
                    'no_articulation': True,
                    'satisfied': False,
                    'options': [],
                    'school': school,
                })
                continue

            options = []
            for item_group in sending.get('items', []):
                courses_in_group = [
                    ci for ci in item_group.get('items', [])
                    if ci.get('type') == 'Course'
                ]
                if not courses_in_group:
                    continue

                group_courses = []
                for ci in courses_in_group:
                    code = f"{ci.get('prefix', '')} {ci.get('courseNumber', '')}".strip()
                    group_courses.append({
                        'code': code,
                        'name': ci.get('courseTitle', ''),
                        'units': ci.get('maxUnits') or ci.get('minUnits'),
                        'completed': code in completed_codes or normalize_course_code(code) in completed_codes,
                        'school': school,
                    })

                option_satisfied = all(c['completed'] for c in group_courses)
                options.append({
                    'courses': group_courses,
                    'satisfied': option_satisfied,
                })

            satisfied = any(opt['satisfied'] for opt in options)
            requirements.append({
                'receiving_code': recv_code,
                'receiving_name': recv_name,
                'no_articulation': False,
                'satisfied': satisfied,
                'options': options,
                'school': school,
            })

    except (AttributeError, KeyError, TypeError, ValueError):
        pass

    return requirements


def compute_remaining(user) -> list:
    from transcripts.models import TranscriptEntry
    from .models import TransferTarget

    completed_raw = set(
        TranscriptEntry.objects.filter(user=user, status='completed').values_list('course_code', flat=True)
    )
    in_progress_raw = set(
        TranscriptEntry.objects.filter(user=user, status='in_progress').values_list('course_code', flat=True)
    )
    completed_codes = _normalized_set(completed_raw)
    in_progress_codes = _normalized_set(in_progress_raw)

    for code in list(completed_codes):
        if code in in_progress_codes:
            in_progress_codes.discard(code)

    targets = TransferTarget.objects.filter(user=user)
    results = []

    for target in targets:
        year_id = target.academic_year_id or LATEST_YEAR_ID
        all_requirements = []
        seen_recv = set()

        for sending_id in [DEANZA_ID, FOOTHILL_ID]:
            school = _school_label(sending_id)
            keys = get_keys_for_target(target.receiving_institution_id, sending_id, year_id, target.major_name)
            for key in keys:
                try:
                    art = fetch_or_cache_articulation(key)
                except Exception:
                    continue
                reqs = _parse_requirements(art, completed_codes, school)
                for req in reqs:
                    rkey = req['receiving_code']
                    if rkey not in seen_recv:
                        seen_recv.add(rkey)
                        for opt in req.get('options', []):
                            for c in opt.get('courses', []):
                                if not c['completed'] and normalize_course_code(c['code']) in in_progress_codes:
                                    c['in_progress'] = True
                                else:
                                    c['in_progress'] = False
                        all_requirements.append(req)

        results.append({
            'target': f"{target.receiving_institution_name} — {target.major_name}",
            'school_name': target.receiving_institution_name,
            'major_name': target.major_name,
            'requirements': all_requirements,
            'total': len(all_requirements),
            'satisfied': sum(1 for r in all_requirements if r['satisfied']),
        })

    return results
