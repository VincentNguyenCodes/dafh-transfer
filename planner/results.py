import json as _json
import re as _re
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


def _extract_codes_from_html(html: str, valid_ucsd_codes: set) -> tuple:
    required = set()
    choose_one_groups = []
    # Only process top-level list items, skip deeply indented notes (ql-indent-2+)
    items = _re.findall(r'<li(?![^>]*ql-indent-[2-9])[^>]*>(.*?)</li>', html, _re.DOTALL | _re.I)
    for item in items:
        text = _re.sub(r'<[^>]+>', '', item).strip().upper()
        text = _re.sub(r'\bMATH\.\s*', 'MATH ', text)
        found = set()
        for match in _re.finditer(r'\b([A-Z]{2,})\s*\.?\s*(\d+[A-Z]*)\b', text):
            code = match.group(1) + match.group(2)
            if code in valid_ucsd_codes:
                found.add(code)
        if not found:
            continue
        if _re.search(r'ONE\s+COURSE\s+CHOSEN|CHOOSE\s+ONE|ONE\s+OF\s+THE\s+FOLLOWING', text):
            choose_one_groups.append(found)
        elif ' OR ' in text and len(found) > 1:
            choose_one_groups.append(found)
        else:
            required.update(found)
    return required, choose_one_groups


def _extract_codes_from_items(items: list, valid_ucsd_codes: set) -> tuple:
    return _extract_codes_from_html(''.join(f'<li>{i}</li>' for i in items), valid_ucsd_codes)


def _parse_advisory(template: list, valid_ucsd_codes: set, agreement_key: str = ''):
    """
    Parse the GeneralText advisory.
    Returns (required: set, advisory_recommended: set, choose_one_groups: list[set])
    or None if no advisory found.
    Tries Claude API first (cached 365 days), falls back to regex.
    """
    if agreement_key:
        advisory_html = '\n'.join(
            g.get('content', '') for g in template
            if g.get('type') == 'GeneralText' and g.get('content', '').strip()
        )
        if advisory_html:
            try:
                from assist.advisory_parser import get_cached_advisory_parse
                result = get_cached_advisory_parse(agreement_key, advisory_html, valid_ucsd_codes)
                if result:
                    return result
            except Exception:
                pass

    for group in template:
        if group.get('type') != 'GeneralText':
            continue
        content = group.get('content', '')
        if '<li>' not in content:
            continue
        if not any(k in content.lower() for k in ['required', 'recommended', 'admission', 'calculus', 'advised']):
            continue

        req_match = _re.search(r'required\s+courses?\s+for\s+admission', content, _re.I)
        rec_match = _re.search(r'(highly\s+)?recommended\s+courses?[\s\S]{0,10}for\s+admission', content, _re.I)

        if req_match:
            if rec_match:
                tag_start = content.rfind('<p>', 0, rec_match.start())
                if tag_start < 0:
                    tag_start = content.rfind('<', 0, rec_match.start())
                req_section = content[:tag_start] if tag_start > 0 else content[:rec_match.start()]
                rec_section = content[tag_start:]
            else:
                req_section = content
                rec_section = ''

            required, choose_one = _extract_codes_from_html(req_section, valid_ucsd_codes)
            advisory_rec = set()
            if rec_section:
                advisory_rec, _ = _extract_codes_from_html(rec_section, valid_ucsd_codes)

            if required or choose_one or advisory_rec:
                return required, advisory_rec, choose_one
            continue

        items = _re.findall(r'<li[^>]*>(.*?)</li>', content, _re.DOTALL | _re.I)
        if len(items) < 3:
            continue
        required, choose_one = _extract_codes_from_items(items, valid_ucsd_codes)
        if required or choose_one:
            return required, set(), choose_one

    return None


def _ccc_course(ci: dict, completed_codes: set, in_progress_codes: set, school: str) -> dict:
    code = f"{ci.get('prefix', '')} {ci.get('courseNumber', '')}".strip()
    completed = code in completed_codes or normalize_course_code(code) in completed_codes
    in_prog = (not completed) and (code in in_progress_codes or normalize_course_code(code) in in_progress_codes)
    return {
        'code': code,
        'name': ci.get('courseTitle', ''),
        'units': ci.get('maxUnits') or ci.get('minUnits'),
        'completed': completed,
        'in_progress': in_prog,
        'school': school,
    }


def _parse_requirements(articulation_json: dict, completed_codes: set, in_progress_codes: set, school: str, agreement_key: str = '') -> tuple:
    requirements = []
    recommended = []
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
                        cid = cell.get('id')
                        course = cell.get('course', {})
                        if cid and course:
                            ucsd_code = f"{course.get('prefix', '')}{course.get('courseNumber', '')}"
                            template_cells[cid] = {
                                'code': ucsd_code,
                                'name': course.get('courseTitle', ''),
                            }

        valid_ucsd_codes = {v['code'] for v in template_cells.values()}
        advisory = _parse_advisory(template, valid_ucsd_codes, agreement_key)

        cell_to_art = {a['templateCellId']: a for a in articulations}

        if advisory:
            required_codes, advisory_rec_codes, choose_one_groups = advisory
            all_choose_one = set().union(*choose_one_groups) if choose_one_groups else set()

            for rec_code in sorted(advisory_rec_codes):
                art_row = next((cell_to_art[cid] for cid, info in template_cells.items()
                                if info['code'] == rec_code and cid in cell_to_art), None)
                if not art_row:
                    continue
                sending = art_row.get('articulation', {}).get('sendingArticulation', {})
                if sending.get('noArticulationReason'):
                    continue
                recv_name = next((info['name'] for info in template_cells.values() if info['code'] == rec_code), '')
                options = _build_options(sending, completed_codes, in_progress_codes, school)
                if not options:
                    continue
                satisfied = any(opt['satisfied'] for opt in options)
                recommended.append({
                    'receiving_code': rec_code,
                    'receiving_name': recv_name,
                    'no_articulation': False,
                    'satisfied': satisfied,
                    'options': options,
                    'school': school,
                    'is_choose_one': False,
                })

            for req_code in sorted(required_codes):
                art_row = next((cell_to_art[cid] for cid, info in template_cells.items()
                                if info['code'] == req_code and cid in cell_to_art), None)
                recv_name = next((info['name'] for info in template_cells.values() if info['code'] == req_code), '')
                _append_requirement(requirements, req_code, recv_name, art_row, completed_codes, in_progress_codes, school)

            for group_codes in choose_one_groups:
                sub_reqs = []
                for ucsd_code in sorted(group_codes):
                    art_row = next((cell_to_art[cid] for cid, info in template_cells.items()
                                    if info['code'] == ucsd_code and cid in cell_to_art), None)
                    if not art_row:
                        continue
                    sending = art_row.get('articulation', {}).get('sendingArticulation', {})
                    if sending.get('noArticulationReason'):
                        continue
                    recv_name = next((info['name'] for info in template_cells.values() if info['code'] == ucsd_code), '')
                    options = _build_options(sending, completed_codes, in_progress_codes, school)
                    sub_reqs.append({'ucsd_code': ucsd_code, 'ucsd_name': recv_name, 'options': options})

                if not sub_reqs:
                    continue

                advisory_key = '/'.join(sorted(group_codes))

                if len(sub_reqs) == 1:
                    sr = sub_reqs[0]
                    satisfied = any(opt['satisfied'] for opt in sr['options'])
                    requirements.append({
                        'receiving_code': sr['ucsd_code'],
                        'receiving_name': sr['ucsd_name'],
                        'no_articulation': False,
                        'satisfied': satisfied,
                        'options': sr['options'],
                        'school': school,
                        'is_choose_one': False,
                        'dedup_key': advisory_key,
                    })
                    continue

                all_options = [opt for sr in sub_reqs for opt in sr['options']]
                satisfied = any(opt['satisfied'] for opt in all_options)
                ucsd_codes = sorted(sr['ucsd_code'] for sr in sub_reqs)
                group_code = '/'.join(ucsd_codes[:3]) + ('+' if len(ucsd_codes) > 3 else '')
                ucsd_names = ', '.join(sr['ucsd_code'] for sr in sub_reqs)
                requirements.append({
                    'receiving_code': group_code,
                    'receiving_name': f"One of: {ucsd_names}",
                    'no_articulation': False,
                    'satisfied': satisfied,
                    'options': all_options,
                    'school': school,
                    'is_choose_one': True,
                    'dedup_key': advisory_key,
                })

            # Collect recommended: has articulation but not in the advisory required list
            advisory_codes = required_codes | all_choose_one | advisory_rec_codes
            for art_row in articulations:
                cell_id = art_row.get('templateCellId')
                recv_info = template_cells.get(cell_id, {})
                recv_code = recv_info.get('code', '')
                if not recv_code or recv_code in advisory_codes:
                    continue
                sending = art_row.get('articulation', {}).get('sendingArticulation', {})
                if sending.get('noArticulationReason'):
                    continue
                recv_name = recv_info.get('name', '')
                options = _build_options(sending, completed_codes, in_progress_codes, school)
                if not options:
                    continue
                satisfied = any(opt['satisfied'] for opt in options)
                recommended.append({
                    'receiving_code': recv_code,
                    'receiving_name': recv_name,
                    'no_articulation': False,
                    'satisfied': satisfied,
                    'options': options,
                    'school': school,
                    'is_choose_one': False,
                })

        else:
            for art_row in articulations:
                cell_id = art_row.get('templateCellId')
                recv_info = template_cells.get(cell_id, {})
                recv_code = recv_info.get('code', '')
                recv_name = recv_info.get('name', '')
                _append_requirement(requirements, recv_code, recv_name, art_row, completed_codes, in_progress_codes, school)

    except (AttributeError, KeyError, TypeError, ValueError):
        pass

    return requirements, recommended


def _build_options(sending: dict, completed_codes: set, in_progress_codes: set, school: str) -> list:
    options = []
    for item_group in sending.get('items', []):
        courses_in_group = [ci for ci in item_group.get('items', []) if ci.get('type') == 'Course']
        if not courses_in_group:
            continue
        group_courses = [_ccc_course(ci, completed_codes, in_progress_codes, school) for ci in courses_in_group]
        options.append({
            'courses': group_courses,
            'satisfied': all(c['completed'] for c in group_courses),
        })
    return options


def _append_requirement(requirements, recv_code, recv_name, art_row, completed_codes, in_progress_codes, school):
    if not art_row:
        requirements.append({
            'receiving_code': recv_code,
            'receiving_name': recv_name,
            'no_articulation': True,
            'satisfied': False,
            'options': [],
            'school': school,
            'is_choose_one': False,
        })
        return

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
            'is_choose_one': False,
        })
        return

    options = _build_options(sending, completed_codes, in_progress_codes, school)
    satisfied = any(opt['satisfied'] for opt in options)

    requirements.append({
        'receiving_code': recv_code,
        'receiving_name': recv_name,
        'no_articulation': False,
        'satisfied': satisfied,
        'options': options,
        'school': school,
        'is_choose_one': False,
    })


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
    in_progress_codes = _normalized_set(in_progress_raw) - completed_codes

    targets = TransferTarget.objects.filter(user=user)
    results = []

    for target in targets:
        year_id = target.academic_year_id or LATEST_YEAR_ID
        all_requirements = []
        seen_recv = set()

        all_recommended = []
        seen_rec = set()

        for sending_id in [DEANZA_ID, FOOTHILL_ID]:
            school = _school_label(sending_id)
            keys = get_keys_for_target(target.receiving_institution_id, sending_id, year_id, target.major_name)
            for key in keys:
                try:
                    art = fetch_or_cache_articulation(key)
                except Exception:
                    continue
                reqs, recs = _parse_requirements(art, completed_codes, in_progress_codes, school, agreement_key=key)
                for req in reqs:
                    rkey = req.get('dedup_key', req['receiving_code'])
                    if rkey not in seen_recv:
                        seen_recv.add(rkey)
                        all_requirements.append(req)
                for rec in recs:
                    rkey = rec['receiving_code']
                    if rkey not in seen_rec:
                        seen_rec.add(rkey)
                        all_recommended.append(rec)

        results.append({
            'target': f"{target.receiving_institution_name} — {target.major_name}",
            'school_name': target.receiving_institution_name,
            'major_name': target.major_name,
            'requirements': all_requirements,
            'recommended': all_recommended,
            'total': len(all_requirements),
            'satisfied': sum(1 for r in all_requirements if r['satisfied']),
        })

    return results
