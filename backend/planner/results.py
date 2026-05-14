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


def _parse_advisory(template: list, valid_ucsd_codes: set, agreement_key: str = '', receiving_id: int = None, major_name: str = ''):
    if receiving_id == 11 and major_name:
        try:
            from .calpoly_scraper import fetch_calpoly_requirements
            result = fetch_calpoly_requirements(major_name, valid_ucsd_codes)
            if result and (result['required'] or result['recommended'] or result['choose_one_groups'] or result['series_groups']):
                return result
        except Exception:
            pass

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
                return {
                    'required': required,
                    'recommended': advisory_rec,
                    'choose_one_groups': choose_one,
                    'series_groups': [],
                    'flags': [],
                }
            continue

        items = _re.findall(r'<li[^>]*>(.*?)</li>', content, _re.DOTALL | _re.I)
        if len(items) < 3:
            continue
        required, choose_one = _extract_codes_from_items(items, valid_ucsd_codes)
        if required or choose_one:
            return {
                'required': required,
                'recommended': set(),
                'choose_one_groups': choose_one,
                'series_groups': [],
                'flags': [],
            }

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


def _parse_requirements(articulation_json: dict, completed_codes: set, in_progress_codes: set, school: str, agreement_key: str = '', receiving_id: int = None, major_name: str = '') -> tuple:
    requirements = []
    recommended = []
    claude_series_groups = []
    flags = []
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
        advisory = _parse_advisory(template, valid_ucsd_codes, agreement_key, receiving_id=receiving_id, major_name=major_name)

        cell_to_art = {a['templateCellId']: a for a in articulations}

        if advisory:
            required_codes = advisory['required']
            advisory_rec_codes = advisory['recommended']
            choose_one_groups = advisory['choose_one_groups']
            claude_series_groups = advisory.get('series_groups', [])
            flags = list(advisory.get('flags', []))
            all_choose_one = set().union(*choose_one_groups) if choose_one_groups else set()
            series_codes_set = {c for g in claude_series_groups for opt in g.get('options', []) for c in opt.get('codes', [])}

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

            if not advisory.get('comprehensive'):
                advisory_codes = required_codes | all_choose_one | advisory_rec_codes | series_codes_set
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

        claude_elective_series = _build_elective_series_from_claude(
            claude_series_groups, template_cells, cell_to_art, completed_codes, in_progress_codes, school
        )
    except (AttributeError, KeyError, TypeError, ValueError):
        claude_elective_series = []

    return requirements, recommended, claude_elective_series, flags


def _build_elective_series_from_claude(claude_series_groups, template_cells, cell_to_art, completed_codes, in_progress_codes, school):
    out = []
    for sg in claude_series_groups:
        built_options = []
        for opt in sg.get('options', []):
            ucsd_codes = opt.get('codes', [])
            if not ucsd_codes:
                continue
            de_anza_courses = []
            seen = set()
            all_satisfied = True
            any_courses = False
            for ucsd_code in ucsd_codes:
                art_row = next((cell_to_art[cid] for cid, info in template_cells.items()
                                if info['code'] == ucsd_code and cid in cell_to_art), None)
                if not art_row:
                    all_satisfied = False
                    continue
                sending = art_row.get('articulation', {}).get('sendingArticulation', {})
                if sending.get('noArticulationReason'):
                    all_satisfied = False
                    continue
                options_for_code = _build_options(sending, completed_codes, in_progress_codes, school)
                if not options_for_code:
                    all_satisfied = False
                    continue
                if not any(o['satisfied'] for o in options_for_code):
                    all_satisfied = False
                first = options_for_code[0]
                for c in first['courses']:
                    if c['code'] not in seen:
                        seen.add(c['code'])
                        de_anza_courses.append({
                            'code': c['code'],
                            'completed': c['completed'],
                            'in_progress': c['in_progress'],
                        })
                        any_courses = True
            if not any_courses:
                continue
            completed_count = sum(1 for c in de_anza_courses if c['completed'])
            built_options.append({
                'name': opt.get('name', '') or f"Option {len(built_options) + 1}",
                'courses': de_anza_courses,
                'completed_count': completed_count,
                'total': len(de_anza_courses),
                'satisfied': all_satisfied and completed_count == len(de_anza_courses),
            })
        if built_options:
            out.append({
                'label': sg.get('label', 'Pick one complete series'),
                'series': built_options,
            })
    return out


def _build_option_groups(sending: dict, completed_codes: set, in_progress_codes: set, school: str) -> list:
    items = sending.get('items', [])
    if not items:
        return []

    conjunctions = sending.get('courseGroupConjunctions', [])
    has_and_between_groups = any(cg.get('groupConjunction') == 'And' for cg in conjunctions)

    per_group = []
    for item_group in items:
        courses_in_group = [ci for ci in item_group.get('items', []) if ci.get('type') == 'Course']
        if not courses_in_group:
            continue
        within_conjunction = item_group.get('courseConjunction', 'And')
        group_courses = [_ccc_course(ci, completed_codes, in_progress_codes, school) for ci in courses_in_group]

        if within_conjunction == 'Or':
            group_options = [{'courses': [c], 'satisfied': c['completed']} for c in group_courses]
        else:
            group_options = [{'courses': group_courses, 'satisfied': all(c['completed'] for c in group_courses)}]

        per_group.append(group_options)

    if not per_group:
        return []

    if has_and_between_groups:
        return per_group
    else:
        merged = []
        for g in per_group:
            merged.extend(g)
        return [merged]


def _build_options(sending: dict, completed_codes: set, in_progress_codes: set, school: str) -> list:
    groups = _build_option_groups(sending, completed_codes, in_progress_codes, school)
    if not groups:
        return []
    if len(groups) == 1:
        return groups[0]
    combined = groups[0]
    for next_group in groups[1:]:
        new_combined = []
        for opt_a in combined:
            for opt_b in next_group:
                merged = opt_a['courses'] + opt_b['courses']
                new_combined.append({
                    'courses': merged,
                    'satisfied': all(c['completed'] for c in merged),
                })
        combined = new_combined
    return combined


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

    option_groups = _build_option_groups(sending, completed_codes, in_progress_codes, school)

    if not option_groups:
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

    for idx, options in enumerate(option_groups):
        satisfied = any(opt['satisfied'] for opt in options)
        code = recv_code if len(option_groups) == 1 else f'{recv_code}_{idx}'
        requirements.append({
            'receiving_code': code,
            'receiving_name': recv_name,
            'no_articulation': False,
            'satisfied': satisfied,
            'options': options,
            'school': school,
            'is_choose_one': False,
        })


def _build_series(series_config: list, completed_codes: set, in_progress_codes: set) -> list:
    result = []
    for group in series_config:
        built_series = []
        for s in group['series']:
            courses = []
            for code in s['courses']:
                norm = normalize_course_code(code)
                completed = code in completed_codes or norm in completed_codes
                in_prog = (not completed) and (code in in_progress_codes or norm in in_progress_codes)
                courses.append({'code': code, 'completed': completed, 'in_progress': in_prog})
            completed_count = sum(1 for c in courses if c['completed'])
            built_series.append({
                'name': s['name'],
                'courses': courses,
                'completed_count': completed_count,
                'total': len(courses),
                'satisfied': completed_count == len(courses),
            })
        result.append({'label': group['label'], 'series': built_series})
    return result


def _requirement_key(req):
    codes = []
    for o in req.get('options', []):
        for c in o.get('courses', []):
            codes.append(c.get('code', ''))
    return '|'.join(sorted(codes))


def _option_remaining_count(opt):
    return sum(1 for c in opt.get('courses', []) if not c.get('completed'))


def _pick_best_option(options, saved_pref_idx=None):
    if not options:
        return None, []
    if len(options) == 1:
        return options[0], []
    scored = [(_option_remaining_count(o), i, o) for i, o in enumerate(options)]
    min_remaining = min(s[0] for s in scored)
    tied_indices = [s[1] for s in scored if s[0] == min_remaining]
    tied = [s[2] for s in scored if s[0] == min_remaining]
    if len(tied) == 1:
        return tied[0], []
    if saved_pref_idx is not None and saved_pref_idx in tied_indices:
        return options[saved_pref_idx], []
    return None, tied


def compute_best_schedule(targets_results: list, user_prefs=None) -> dict:
    user_prefs = user_prefs or {}
    classes = {}
    needs_choice = []
    needs_choice_keys = set()

    def add_course(c, target_label, req_name, kind):
        code = c['code']
        if c.get('completed'):
            return
        entry = classes.get(code)
        if not entry:
            entry = {
                'code': code,
                'name': c.get('name', ''),
                'units': c.get('units'),
                'school': c.get('school', ''),
                'in_progress': c.get('in_progress', False),
                'needed_for': [],
                'kinds': set(),
            }
            classes[code] = entry
        entry['needed_for'].append({'target': target_label, 'requirement': req_name})
        entry['kinds'].add(kind)

    def handle_req(req, target_label, kind):
        if req.get('no_articulation') or req.get('satisfied'):
            return
        options = req.get('options', [])
        key = _requirement_key(req)
        saved = user_prefs.get(key)
        best, tied = _pick_best_option(options, saved_pref_idx=saved)
        if tied:
            if key not in needs_choice_keys:
                needs_choice_keys.add(key)
                needs_choice.append({
                    'requirement_key': key,
                    'receiving_code': req.get('receiving_code', ''),
                    'receiving_name': req.get('receiving_name', '') or req.get('receiving_code', ''),
                    'target': target_label,
                    'options': tied,
                })
            return
        if not best:
            return
        for c in best.get('courses', []):
            add_course(c, target_label, req.get('receiving_name') or req.get('receiving_code', ''), kind)

    for r in targets_results:
        target_label = r.get('school_name') or r.get('target', '')

        for req in r.get('requirements', []):
            handle_req(req, target_label, 'required')

        for rec in r.get('recommended', []):
            handle_req(rec, target_label, 'recommended')

        for group in r.get('elective_series', []):
            series_list = group.get('series', [])
            if not series_list:
                continue

            satisfied = next((s for s in series_list if s.get('satisfied')), None)
            if satisfied:
                for c in satisfied.get('courses', []):
                    add_course(c, target_label, group.get('label', 'Elective series'), 'elective')
                continue

            label = group.get('label', 'Elective series')
            key = 'elective:' + label + '|' + '|'.join(
                sorted(c.get('code', '') for s in series_list for c in s.get('courses', []))
            )

            saved = user_prefs.get(key)
            if saved is not None and 0 <= saved < len(series_list):
                for c in series_list[saved].get('courses', []):
                    add_course(c, target_label, label, 'elective')
                continue

            if key not in needs_choice_keys:
                needs_choice_keys.add(key)
                needs_choice.append({
                    'requirement_key': key,
                    'receiving_code': 'elective',
                    'receiving_name': label,
                    'target': target_label,
                    'options': [
                        {
                            'name': s.get('name', ''),
                            'courses': s.get('courses', []),
                            'satisfied': s.get('satisfied', False),
                        }
                        for s in series_list
                    ],
                })

    from .prerequisites import chain
    completed_codes = set()
    for r in targets_results:
        for req in list(r.get('requirements', [])) + list(r.get('recommended', [])):
            for opt in req.get('options', []):
                for c in opt.get('courses', []):
                    if c.get('completed'):
                        completed_codes.add(c['code'])

    picked_codes = set(classes.keys())
    for code in list(classes.keys()):
        for p in chain(code, completed_codes | picked_codes):
            if p in classes:
                classes[p]['needed_for'].append({'target': '', 'requirement': f'prereq for {code}'})
                classes[p]['kinds'].add('prereq')
                continue
            classes[p] = {
                'code': p,
                'name': p,
                'units': None,
                'school': '',
                'in_progress': False,
                'needed_for': [{'target': '', 'requirement': f'prereq for {code}'}],
                'kinds': {'prereq'},
            }
            picked_codes.add(p)

    out = []
    for c in classes.values():
        c['kinds'] = sorted(c['kinds'])
        out.append(c)
    out.sort(key=lambda c: (
        0 if c['in_progress'] else 1,
        'required' not in c['kinds'],
        c['code'],
    ))

    return {
        'classes': out,
        'needs_choice': needs_choice,
        'total': len(out),
        'in_progress': sum(1 for c in out if c['in_progress']),
    }


def compute_remaining(user, ge_path: str = '') -> list:
    from transcripts.models import TranscriptEntry
    from .models import TransferTarget
    from .series_config import get_series_config

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

        claude_series_combined = []
        seen_series_labels = set()
        all_flags = []

        for sending_id in [DEANZA_ID, FOOTHILL_ID]:
            school = _school_label(sending_id)
            keys = get_keys_for_target(target.receiving_institution_id, sending_id, year_id, target.major_name)
            for key in keys:
                try:
                    art = fetch_or_cache_articulation(key)
                except Exception:
                    continue
                reqs, recs, claude_series, flags = _parse_requirements(
                    art, completed_codes, in_progress_codes, school,
                    agreement_key=key,
                    receiving_id=target.receiving_institution_id,
                    major_name=target.major_name,
                )
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
                for cs in claude_series:
                    if cs['label'] not in seen_series_labels:
                        seen_series_labels.add(cs['label'])
                        claude_series_combined.append(cs)
                for f in flags:
                    if f not in all_flags:
                        all_flags.append(f)

        series_config = get_series_config(target.receiving_institution_id, target.major_name)
        manual_groups = series_config.get('groups', []) if series_config else []
        if manual_groups:
            elective_series = _build_series(manual_groups, completed_codes, in_progress_codes)
            suppress_subjects = series_config.get('suppress_subjects', set())
            if suppress_subjects:
                all_recommended = [
                    rec for rec in all_recommended
                    if not all(
                        c['code'].split()[0] in suppress_subjects
                        for opt in rec['options'] for c in opt['courses']
                    )
                ]
        else:
            elective_series = claude_series_combined
            series_de_anza_codes = set()
            for group in elective_series:
                for s in group['series']:
                    for c in s['courses']:
                        series_de_anza_codes.add(c['code'])
                        series_de_anza_codes.add(normalize_course_code(c['code']))
            if series_de_anza_codes:
                all_recommended = [
                    rec for rec in all_recommended
                    if not all(
                        (c['code'] in series_de_anza_codes or normalize_course_code(c['code']) in series_de_anza_codes)
                        for opt in rec['options'] for c in opt['courses']
                    )
                ]

        from .ge_requirements import (
            build_csu_ge_requirements, build_igetc_requirements,
            CSU_INSTITUTION_IDS, IGETC_APPLIES_TO,
        )
        committed = set()
        for req in all_requirements:
            if req.get('no_articulation') or not req.get('options'):
                continue
            for c in req['options'][0]['courses']:
                committed.add(c['code'])
                committed.add(normalize_course_code(c['code']))
        for group in elective_series:
            series_list = group.get('series', [])
            if not series_list:
                continue
            best = next((s for s in series_list if s.get('satisfied')), None) or series_list[0]
            for c in best.get('courses', []):
                committed.add(c['code'])
                committed.add(normalize_course_code(c['code']))

        if ge_path == 'igetc':
            if target.receiving_institution_id in IGETC_APPLIES_TO:
                all_requirements.extend(build_igetc_requirements(
                    target.receiving_institution_id,
                    completed_codes, in_progress_codes, committed,
                ))
        else:
            if target.receiving_institution_id in CSU_INSTITUTION_IDS:
                all_requirements.extend(build_csu_ge_requirements(
                    target.receiving_institution_id,
                    completed_codes, in_progress_codes, committed,
                ))

        from .ge_requirements import get_ge_approved_codes
        from .prerequisites import PREREQS
        results.append({
            'target': f"{target.receiving_institution_name} — {target.major_name}",
            'school_name': target.receiving_institution_name,
            'major_name': target.major_name,
            'ge_path': ge_path,
            'ge_approved_codes': get_ge_approved_codes(ge_path),
            'prereq_map': PREREQS,
            'requirements': all_requirements,
            'recommended': all_recommended,
            'elective_series': elective_series,
            'flags': all_flags,
            'total': len(all_requirements),
            'satisfied': sum(1 for r in all_requirements if r['satisfied']),
        })

    return results
