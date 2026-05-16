from transcripts.parser import normalize_course_code

CSU_INSTITUTION_IDS = {1, 11, 12, 21, 23, 24, 26, 29, 39, 42, 50, 60, 75, 76, 81, 85, 88, 98, 115, 116, 129, 141, 143}

UC_INSTITUTION_IDS = {7, 46, 79, 89, 117, 120, 128, 132, 144}

AICCU_INSTITUTION_IDS = {201, 206, 209, 213, 214, 215, 216, 217, 220, 222, 227, 228, 230, 235}

CALGETC_APPLIES_TO = CSU_INSTITUTION_IDS | UC_INSTITUTION_IDS | AICCU_INSTITUTION_IDS

CALGETC_MULTI_PICK = {
    '3': {
        'name': 'Arts and Humanities',
        'pick_count': 2,
        'subareas': ['3A', '3B'],
        'rule': 'at_least_one_per_subarea',
    },
    '4': {
        'name': 'Social and Behavioral Sciences',
        'pick_count': 2,
        'subareas': ['4'],
        'rule': 'different_disciplines',
    },
}

CALGETC_AREAS = {
    '1A': {
        'name': 'English Composition',
        'deanza': ['ENGL C1000', 'ENGL C1000H', 'ESL 5', 'EWRT 1A', 'EWRT 1AH'],
        'foothill': ['ENGL 1A', 'ENGL 1AH'],
    },
    '1B': {
        'name': 'Critical Thinking and English Composition',
        'deanza': ['COMM 9', 'COMM 9H', 'ENGL C1001', 'ENGL C1001H', 'PHIL 3', 'EWRT 2', 'EWRT 2H'],
        'foothill': ['ENGL 1B', 'ENGL 1C', 'PHIL 7'],
    },
    '1C': {
        'name': 'Oral Communication',
        'deanza': ['COMM C1000', 'COMM C1000H', 'COMM 10', 'COMM 10H', 'COMM 1', 'COMM 1H'],
        'foothill': ['COMM 1', 'COMM 1H'],
    },
    '2': {
        'name': 'Mathematical Concepts and Quantitative Reasoning',
        'deanza': [
            'MATH 1A', 'MATH 1AH', 'MATH 1B', 'MATH 1BH', 'MATH 1C', 'MATH 1CH',
            'MATH 1D', 'MATH 1DH', 'MATH 2A', 'MATH 2AH', 'MATH 2B', 'MATH 2BH',
            'MATH 11', 'MATH 11H', 'MATH 12', 'MATH 17', 'MATH 22', 'MATH 22H',
            'MATH 23', 'MATH 31', 'MATH 31H', 'MATH 32', 'MATH 32H', 'MATH 44',
            'POLI 20', 'PSYC 15', 'SOC 15', 'STAT C1000', 'STAT C1000H',
            'MATH 10', 'MATH 10H',
        ],
        'foothill': [
            'MATH 1A', 'MATH 1AH', 'MATH 1B', 'MATH 1BH', 'MATH 1C', 'MATH 1CH',
            'MATH 1D', 'MATH 1DH', 'MATH 10', 'MATH 11', 'MATH 22', 'MATH 31',
        ],
    },
    '3A': {
        'name': 'Arts',
        'deanza': [
            'ARTS 1A', 'ARTS 1B', 'ARTS 2A', 'ARTS 2B', 'ARTS 2C', 'ARTS 2D',
            'ARTS 2F', 'ARTS 2G', 'ARTS 2H', 'ARTS 2J', 'ARTS 3TC', 'ARTS 3TE',
            'ASAM 40', 'CETH 13', 'CHLX 13', 'DANC 38A', 'E S 3',
            'F/TV 1', 'F/TV 1H', 'F/TV 2A', 'F/TV 2AH', 'F/TV 2AW', 'F/TV 2AWH',
            'F/TV 2B', 'F/TV 2BH', 'F/TV 2BW', 'F/TV 2BWH',
            'F/TV 2C', 'F/TV 2CH', 'F/TV 2CW', 'F/TV 2CWH', 'F/TV 3A',
            'HUMI 1', 'HUMI 1H', 'HUMI 15', 'INTL 21', 'INTL 22',
            'MUSI 1A', 'MUSI 1B', 'MUSI 1C', 'MUSI 1D',
            'NAIS 13', 'NAIS 32', 'PHTG 7', 'PHTG 21', 'THEA 1', 'WMST 3C',
        ],
        'foothill': [
            'ART 2A', 'ART 2B', 'ART 2C', 'ART 2D', 'MUS 8', 'MUS 9A', 'MUS 9B',
            'PHOT 7', 'PHOT 8', 'THTR 1',
        ],
    },
    '3B': {
        'name': 'Humanities',
        'deanza': [
            'AFAM 11', 'AFAM 25', 'ASAM 20', 'ASAM 21', 'ASAM 22', 'ASAM 32', 'ASAM 41',
            'CHLX 26', 'CHLX 35',
            'ELIT 8', 'ELIT 10', 'ELIT 10H', 'ELIT 11', 'ELIT 12', 'ELIT 17', 'ELIT 17H',
            'ELIT 19', 'ELIT 21', 'ELIT 22', 'ELIT 24', 'ELIT 28', 'ELIT 38', 'ELIT 39',
            'ELIT 40', 'ELIT 41', 'ELIT 41H', 'ELIT 46A', 'ELIT 46AH', 'ELIT 46B',
            'ELIT 46BH', 'ELIT 46C', 'ELIT 46CH', 'ELIT 47A', 'ELIT 47B', 'ELIT 48A',
            'ELIT 48AH', 'ELIT 48B', 'ELIT 48BH', 'ELIT 48C', 'ELIT 48CH',
            'ESL 6', 'EWRT 1C',
            'F/TV 2A', 'F/TV 2AH', 'F/TV 2AW', 'F/TV 2AWH', 'F/TV 2B', 'F/TV 2BH',
            'F/TV 2BW', 'F/TV 2BWH', 'F/TV 2C', 'F/TV 2CH', 'F/TV 2CW', 'F/TV 2CWH',
            'F/TV 3A',
            'FREN 3', 'GERM 3', 'GERM 4', 'HNDI 3',
            'HIST 3A', 'HIST 3AH', 'HIST 3B', 'HIST 3BH', 'HIST 3C', 'HIST 3CH',
            'HIST 6A', 'HIST 6AH', 'HIST 6B', 'HIST 6BH', 'HIST 6C', 'HIST 6CH',
            'HIST 17A', 'HIST 17AH', 'HIST 17B', 'HIST 17BH', 'HIST 17C', 'HIST 17CH',
            'HUMI 1', 'HUMI 1H', 'HUMI 2', 'HUMI 5', 'HUMI 6', 'HUMI 7', 'HUMI 9',
            'HUMI 9H', 'HUMI 10', 'HUMI 13', 'HUMI 16', 'HUMI 18', 'HUMI 18H', 'HUMI 20',
            'INTL 16', 'ITAL 3', 'JAPN 3', 'JAPN 4', 'JAPN 5', 'JAPN 6',
            'KORE 3', 'LING 1', 'MAND 3', 'MAND 4', 'MAND 5', 'MAND 6',
            'NAIS 14', 'NAIS 15', 'PERS 3',
            'PHIL 1', 'PHIL 2', 'PHIL 8', 'PHIL 8H', 'PHIL 11', 'PHIL 20A', 'PHIL 20B',
            'PHIL 20C', 'PHIL 24', 'PHIL 30', 'PHIL 49',
            'READ 10', 'RUSS 3', 'SIGN 3', 'SPAN 3', 'SPAN 4', 'SPAN 5', 'SPAN 6',
            'VIET 3', 'VIET 4', 'VIET 5', 'VIET 6',
            'WMST 21', 'WMST 22', 'WMST 25', 'WMST 26', 'WMST 27', 'WMST 31', 'WMST 49',
        ],
        'foothill': [
            'ENGL 1B', 'ENGL 1C', 'HIST 4A', 'HIST 4B', 'HIST 17A', 'HIST 17B',
            'PHIL 1', 'PHIL 2', 'PHIL 8', 'PHIL 10', 'PHIL 23',
        ],
    },
    '4': {
        'name': 'Social and Behavioral Sciences',
        'deanza': [
            'ADMJ 29', 'AFAM 10', 'AFAM 11', 'AFAM 12A', 'AFAM 12B', 'AFAM 25',
            'ANTH 2', 'ANTH 2H', 'ANTH 3', 'ANTH 4', 'ANTH 5', 'ANTH 6', 'ANTH 8',
            'ANTH 12', 'ANTH 14', 'ANTH 16',
            'ARTS 2F', 'ARTS 3TC',
            'ASAM 1', 'ASAM 10', 'ASAM 11', 'ASAM 12', 'ASAM 13', 'ASAM 22', 'ASAM 30',
            'C D 10G', 'C D 10H', 'C D 12',
            'CETH 8', 'CETH 10', 'CETH 11', 'CETH 13', 'CETH 19', 'CETH 29',
            'CHLX 10', 'CHLX 11', 'CHLX 12', 'CHLX 26',
            'COMM 7', 'COMM 7H',
            'ECON 1', 'ECON 1H', 'ECON 2', 'ECON 2H', 'ECON 3', 'ECON 3H', 'ECON 4', 'ECON 5',
            'E S 1', 'E S 3', 'E S 4',
            'F/TV 10', 'F/TV 10H',
            'GEO 4', 'GEO 5', 'GEO 10',
            'HIST 3A', 'HIST 3AH', 'HIST 3B', 'HIST 3BH', 'HIST 3C', 'HIST 3CH',
            'HIST 6A', 'HIST 6AH', 'HIST 6B', 'HIST 6BH', 'HIST 6C', 'HIST 6CH',
            'HIST 7A', 'HIST 7B', 'HIST 9', 'HIST 9H', 'HIST 10', 'HIST 10H',
            'HIST 16A', 'HIST 16B',
            'HIST 17A', 'HIST 17AH', 'HIST 17B', 'HIST 17BH', 'HIST 17C', 'HIST 17CH',
            'HIST 18A', 'HIST 18B', 'HIST 19A', 'HIST 19B',
            'HUMA 10', 'HUMA 10H',
            'ICS 17', 'ICS 17H', 'ICS 19', 'ICS 25', 'ICS 26', 'ICS 27', 'ICS 27H',
            'ICS 36', 'ICS 37',
            'INTL 1', 'INTL 5', 'INTL 8', 'INTL 33',
            'JOUR 2', 'KNES 47',
            'NAIS 11', 'NAIS 12', 'NAIS 16', 'NAIS 31',
            'POLI 2', 'POLI 3', 'POLI 5', 'POLI 15', 'POLI 16', 'POLI 17', 'POLI 17H',
            'POLS C1000', 'POLS C1000H',
            'PSYC C1000', 'PSYC 2', 'PSYC 3', 'PSYC 4', 'PSYC 5', 'PSYC 8', 'PSYC 9',
            'PSYC 10G', 'PSYC 10H', 'PSYC 12', 'PSYC 14', 'PSYC 24',
            'SOC 1', 'SOC 5', 'SOC 14', 'SOC 20', 'SOC 28', 'SOC 29', 'SOC 35',
            'WMST 1', 'WMST 3C', 'WMST 8', 'WMST 9', 'WMST 9H', 'WMST 12',
            'WMST 22', 'WMST 24', 'WMST 25', 'WMST 26', 'WMST 27', 'WMST 28', 'WMST 29', 'WMST 31',
            'POLI 1', 'PSYC 1',
        ],
        'foothill': [
            'ANTH 1', 'ANTH 2', 'ANTH 3', 'ECON 1A', 'ECON 1B', 'GEOG 1', 'HIST 1',
            'HIST 2', 'POLI 1', 'PSYC 1', 'PSYC 10', 'SOC 1', 'SOC 5',
        ],
    },
    '5A': {
        'name': 'Physical Science',
        'deanza': [
            'ASTR 4', 'ASTR 4/15L', 'ASTR 10', 'ASTR 10/15L',
            'CHEM 1A', 'CHEM 1AH', 'CHEM 1B', 'CHEM 1BH', 'CHEM 1C', 'CHEM 1CH',
            'CHEM 10', 'CHEM 25', 'CHEM 30A', 'CHEM 30B',
            'GEO 1', 'GEOL 10', 'GEOL 20',
            'MET 10', 'MET 10/10L', 'MET 10/20L', 'MET 12', 'MET 12/20L',
            'PHYS 2A', 'PHYS 4A', 'PHYS 10',
        ],
        'foothill': [
            'ASTR 10', 'CHEM 1A', 'CHEM 1B', 'CHEM 1C', 'CHEM 25', 'CHEM 30A',
            'CHEM 30B', 'GEOL 10', 'PHYS 2A', 'PHYS 2B', 'PHYS 4A', 'PHYS 4B',
            'PHYS 4C',
        ],
    },
    '5B': {
        'name': 'Biological Science',
        'deanza': [
            'ANTH 1', 'ANTH 1H', 'ANTH 1/1L', 'ANTH 1H/1L', 'ANTH 7',
            'BIOL 6A', 'BIOL 6AH', 'BIOL 6B', 'BIOL 6C', 'BIOL 6CH',
            'BIOL 10', 'BIOL 10H', 'BIOL 11', 'BIOL 13', 'BIOL 15', 'BIOL 26', 'BIOL 40C',
            'ESCI 1', 'ESCI 1/1L', 'ESCI 19',
        ],
        'foothill': [
            'BIOL 10', 'BIOL 11', 'BIOL 12', 'BIOL 13', 'BIOL 24A', 'BIOL 24B',
            'BIOL 24C', 'BIOL 30', 'BIOL 31', 'PSYC 10',
        ],
    },
    '6': {
        'name': 'Ethnic Studies',
        'deanza': [
            'ADMJ 29', 'AFAM 10', 'AFAM 11', 'ASAM 11', 'CETH 10', 'CETH 29',
            'CHLX 10', 'NAIS 12',
        ],
        'foothill': [],
    },
}


def _approved_set(area):
    s = set()
    for school in ('deanza', 'foothill'):
        for code in area.get(school, []):
            s.add(code)
            s.add(normalize_course_code(code))
    return s


def _build_area_requirement(area_code, area, code_prefix, label_prefix, completed_codes, in_progress_codes, subarea=None):
    options = []
    for school in ('deanza', 'foothill'):
        for code in area.get(school, []):
            norm = normalize_course_code(code)
            completed = code in completed_codes or norm in completed_codes
            in_prog = (not completed) and (code in in_progress_codes or norm in in_progress_codes)
            course = {
                'code': code,
                'name': '',
                'units': None,
                'school': school,
                'completed': completed,
                'in_progress': in_prog,
            }
            if subarea:
                course['subarea'] = subarea
            options.append({'courses': [course], 'satisfied': completed})
    return {
        'receiving_code': f'{code_prefix}_{area_code}',
        'receiving_name': f"{area['name']} ({label_prefix} {area_code})",
        'no_articulation': False,
        'satisfied': False,
        'options': options,
        'school': 'deanza',
        'is_choose_one': True,
    }


def _build_multi_pick_requirement(group_code, group_meta, completed_codes, in_progress_codes, committed_codes):
    options = []
    approved = set()
    for sub_code in group_meta['subareas']:
        sub_area = CALGETC_AREAS.get(sub_code)
        if not sub_area:
            continue
        for school in ('deanza', 'foothill'):
            for code in sub_area.get(school, []):
                norm = normalize_course_code(code)
                completed = code in completed_codes or norm in completed_codes
                in_prog = (not completed) and (code in in_progress_codes or norm in in_progress_codes)
                approved.add(code)
                approved.add(norm)
                options.append({
                    'courses': [{
                        'code': code,
                        'name': '',
                        'units': None,
                        'school': school,
                        'completed': completed,
                        'in_progress': in_prog,
                        'subarea': sub_code,
                        'subarea_name': sub_area['name'],
                    }],
                    'satisfied': completed,
                })

    pre_satisfied = sorted(approved & (completed_codes | committed_codes))

    return {
        'receiving_code': f'CALGETC_{group_code}',
        'receiving_name': f"{group_meta['name']} (Cal-GETC Area {group_code})",
        'no_articulation': False,
        'satisfied': False,
        'options': options,
        'school': 'deanza',
        'is_choose_one': False,
        'pick_count': group_meta['pick_count'],
        'rule': group_meta['rule'],
        'pre_satisfied_codes': pre_satisfied,
    }


def _is_multi_pick_satisfied(group_meta, completed_codes, committed_codes):
    covered = set()
    by_subarea = {}
    for sub_code in group_meta['subareas']:
        sub_area = CALGETC_AREAS.get(sub_code)
        if not sub_area:
            continue
        approved = set()
        for school in ('deanza', 'foothill'):
            for code in sub_area.get(school, []):
                approved.add(code)
                approved.add(normalize_course_code(code))
        sat = approved & (completed_codes | committed_codes)
        if sat:
            by_subarea[sub_code] = sat
            covered |= sat

    if len(covered) < group_meta['pick_count']:
        return False
    if group_meta['rule'] == 'at_least_one_per_subarea':
        return all(by_subarea.get(s) for s in group_meta['subareas'])
    if group_meta['rule'] == 'different_disciplines':
        prefixes = {c.rsplit(' ', 1)[0] for c in covered if ' ' in c}
        return len(prefixes) >= 2
    return True


def build_calgetc_requirements(receiving_id, completed_codes, in_progress_codes, committed_codes):
    if receiving_id not in CALGETC_APPLIES_TO:
        return []

    multi_pick_subareas = {s for meta in CALGETC_MULTI_PICK.values() for s in meta['subareas']}

    reqs = []
    for area_code, area in CALGETC_AREAS.items():
        if area_code in multi_pick_subareas:
            continue
        if _approved_set(area) & (completed_codes | committed_codes):
            continue
        reqs.append(_build_area_requirement(
            area_code, area, 'CALGETC', 'Cal-GETC Area',
            completed_codes, in_progress_codes,
        ))

    for group_code, group_meta in CALGETC_MULTI_PICK.items():
        if _is_multi_pick_satisfied(group_meta, completed_codes, committed_codes):
            continue
        reqs.append(_build_multi_pick_requirement(
            group_code, group_meta, completed_codes, in_progress_codes, committed_codes,
        ))

    return reqs


def get_ge_approved_codes(ge_path):
    if not ge_path:
        return []
    s = set()
    for area in CALGETC_AREAS.values():
        s |= _approved_set(area)
    return sorted(s)
