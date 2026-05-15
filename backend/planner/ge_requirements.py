from transcripts.parser import normalize_course_code

CSU_INSTITUTION_IDS = {1, 11, 12, 21, 23, 24, 26, 29, 39, 42, 50, 60, 75, 76, 81, 85, 88, 98, 115, 116, 129, 141, 143}

UC_INSTITUTION_IDS = {7, 46, 79, 89, 117, 120, 128, 132, 144}

IGETC_APPLIES_TO = CSU_INSTITUTION_IDS | UC_INSTITUTION_IDS

IGETC_CSU_ONLY_AREAS = {'1C'}

IGETC_UC_ONLY_AREAS = {'6'}

IGETC_MULTI_PICK = {
    '3': {
        'name': 'Arts and Humanities',
        'pick_count': 3,
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

IGETC_AREAS = {
    '1A': {
        'name': 'English Composition',
        'deanza': ['EWRT 1A', 'EWRT 1AH'],
        'foothill': ['ENGL 1A', 'ENGL 1AH'],
    },
    '1B': {
        'name': 'Critical Thinking and English Composition',
        'deanza': ['EWRT 2', 'EWRT 2H'],
        'foothill': ['ENGL 1B', 'ENGL 1C'],
    },
    '1C': {
        'name': 'Oral Communication (CSU only)',
        'deanza': ['COMM 1', 'COMM 1H', 'COMM 10', 'COMM 10H'],
        'foothill': ['COMM 1', 'COMM 1H'],
    },
    '2A': {
        'name': 'Mathematical Concepts and Quantitative Reasoning',
        'deanza': [
            'MATH 1A', 'MATH 1AH', 'MATH 1B', 'MATH 1BH', 'MATH 1C', 'MATH 1CH',
            'MATH 1D', 'MATH 1DH', 'MATH 2A', 'MATH 2AH', 'MATH 2B', 'MATH 2BH',
            'MATH 10', 'MATH 10H', 'MATH 11', 'MATH 11H', 'MATH 17', 'MATH 22',
            'MATH 23', 'MATH 31', 'MATH 32', 'MATH 41', 'MATH 42', 'MATH 43',
            'MATH 44', 'MATH 46',
        ],
        'foothill': [
            'MATH 1A', 'MATH 1AH', 'MATH 1B', 'MATH 1BH', 'MATH 1C', 'MATH 1CH',
            'MATH 1D', 'MATH 1DH', 'MATH 10', 'MATH 11', 'MATH 22', 'MATH 31',
        ],
    },
    '3A': {
        'name': 'Arts',
        'deanza': [
            'ARTS 1', 'ARTS 2A', 'ARTS 2B', 'ARTS 3', 'ARTS 4', 'DANC 1', 'F/TV 1',
            'F/TV 2A', 'F/TV 2B', 'F/TV 2C', 'MUSI 1A', 'MUSI 1B', 'MUSI 1C',
            'PHTG 1', 'THEA 1', 'THEA 30',
        ],
        'foothill': [
            'ART 2A', 'ART 2B', 'ART 2C', 'ART 2D', 'MUS 8', 'MUS 9A', 'MUS 9B',
            'PHOT 7', 'PHOT 8', 'THTR 1',
        ],
    },
    '3B': {
        'name': 'Humanities',
        'deanza': [
            'EWRT 30', 'EWRT 31', 'EWRT 46', 'EWRT 66', 'HIST 4A', 'HIST 4B',
            'HIST 5A', 'HIST 5B', 'HUMI 1', 'HUMI 10', 'HUMI 16', 'PHIL 1',
            'PHIL 2', 'PHIL 4', 'PHIL 5', 'PHIL 8', 'PHIL 9', 'PHIL 10',
            'PHIL 20A', 'PHIL 20B',
        ],
        'foothill': [
            'ENGL 1B', 'ENGL 1C', 'HIST 4A', 'HIST 4B', 'HIST 17A', 'HIST 17B',
            'PHIL 1', 'PHIL 2', 'PHIL 8', 'PHIL 10', 'PHIL 23',
        ],
    },
    '4': {
        'name': 'Social and Behavioral Sciences',
        'deanza': [
            'ANTH 1', 'ANTH 2', 'ANTH 3', 'ECON 1', 'ECON 2', 'GEO 10', 'HIST 1',
            'HIST 2', 'HIST 10', 'HIST 17A', 'HIST 17B', 'POLI 1', 'POLI 2',
            'POLI 3', 'POLI 15', 'PSYC 1', 'PSYC 14', 'PSYC 16', 'PSYC 22',
            'SOC 1', 'SOC 5', 'SOC 20',
        ],
        'foothill': [
            'ANTH 1', 'ANTH 2', 'ANTH 3', 'ECON 1A', 'ECON 1B', 'GEOG 1', 'HIST 1',
            'HIST 2', 'POLI 1', 'PSYC 1', 'PSYC 10', 'SOC 1', 'SOC 5',
        ],
    },
    '5A': {
        'name': 'Physical Science',
        'deanza': [
            'ASTR 4', 'ASTR 10', 'ASTR 25', 'CHEM 1A', 'CHEM 1AH', 'CHEM 1B',
            'CHEM 1BH', 'CHEM 1C', 'CHEM 1CH', 'CHEM 10', 'CHEM 12A', 'CHEM 12B',
            'CHEM 12C', 'CHEM 25', 'CHEM 30A', 'CHEM 30B', 'GEO 1', 'GEO 2',
            'GEO 4', 'METR 10', 'PHYS 2A', 'PHYS 2B', 'PHYS 4A', 'PHYS 4B',
            'PHYS 4C', 'PHYS 4D', 'PHYS 10',
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
            'ANTH 1', 'BIOL 6A', 'BIOL 6B', 'BIOL 6C', 'BIOL 10', 'BIOL 11',
            'BIOL 14', 'BIOL 30', 'BIOL 40A', 'BIOL 40B', 'BIOL 40C',
            'ENVS 1', 'PSYC 30',
        ],
        'foothill': [
            'BIOL 10', 'BIOL 11', 'BIOL 12', 'BIOL 13', 'BIOL 24A', 'BIOL 24B',
            'BIOL 24C', 'BIOL 30', 'BIOL 31', 'PSYC 10',
        ],
    },
    '6': {
        'name': 'Language Other Than English (UC only)',
        'deanza': [
            'ASL 2', 'ASL 3', 'ASL 4', 'CHIN 2', 'CHIN 3', 'CHIN 4',
            'FREN 2', 'FREN 3', 'FREN 4', 'GERM 2', 'GERM 3', 'GERM 4',
            'JAPN 2', 'JAPN 3', 'JAPN 4', 'KORE 2', 'KORE 3', 'KORE 4',
            'SPAN 2', 'SPAN 3', 'SPAN 4', 'VIET 2', 'VIET 3',
        ],
        'foothill': [
            'CHIN 2', 'CHIN 3', 'FREN 2', 'FREN 3', 'GERM 2', 'GERM 3',
            'ITAL 2', 'ITAL 3', 'JAPN 2', 'JAPN 3', 'SPAN 2', 'SPAN 3',
        ],
    },
}

CSU_GE_AREAS = {
    'A1': {
        'name': 'Oral Communication',
        'deanza': ['COMM 1', 'COMM 1H', 'COMM 10', 'COMM 10H'],
        'foothill': ['COMM 1', 'COMM 1H'],
    },
    'A2': {
        'name': 'Written Communication',
        'deanza': ['EWRT 1A', 'EWRT 1AH'],
        'foothill': ['ENGL 1A', 'ENGL 1AH'],
    },
    'A3': {
        'name': 'Critical Thinking',
        'deanza': ['EWRT 2', 'EWRT 2H', 'PHIL 3', 'PHIL 3H'],
        'foothill': ['ENGL 1B', 'ENGL 1C', 'PHIL 7'],
    },
    'B4': {
        'name': 'College-Level Math',
        'deanza': [
            'MATH 1A', 'MATH 1AH', 'MATH 1B', 'MATH 1BH', 'MATH 1C', 'MATH 1CH',
            'MATH 1D', 'MATH 1DH', 'MATH 2A', 'MATH 2AH', 'MATH 2B', 'MATH 2BH',
            'MATH 10', 'MATH 10H', 'MATH 11', 'MATH 11H', 'MATH 12', 'MATH 17',
            'MATH 22', 'MATH 23', 'MATH 31', 'MATH 32', 'MATH 41', 'MATH 42',
            'MATH 43', 'MATH 44', 'MATH 46', 'BUS 54', 'EDUC 46',
        ],
        'foothill': [
            'MATH 1A', 'MATH 1AH', 'MATH 1B', 'MATH 1BH', 'MATH 1C', 'MATH 1CH',
            'MATH 1D', 'MATH 1DH', 'MATH 10', 'MATH 11', 'MATH 22', 'MATH 31',
        ],
    },
}


def _approved_set(area):
    s = set()
    for school in ('deanza', 'foothill'):
        for code in area.get(school, []):
            s.add(code)
            s.add(normalize_course_code(code))
    return s


def _build_area_requirement(area_code, area, code_prefix, label_prefix, completed_codes, in_progress_codes):
    options = []
    for school in ('deanza', 'foothill'):
        for code in area.get(school, []):
            norm = normalize_course_code(code)
            completed = code in completed_codes or norm in completed_codes
            in_prog = (not completed) and (code in in_progress_codes or norm in in_progress_codes)
            options.append({
                'courses': [{
                    'code': code,
                    'name': '',
                    'units': None,
                    'school': school,
                    'completed': completed,
                    'in_progress': in_prog,
                }],
                'satisfied': completed,
            })
    return {
        'receiving_code': f'{code_prefix}_{area_code}',
        'receiving_name': f"{area['name']} ({label_prefix} {area_code})",
        'no_articulation': False,
        'satisfied': False,
        'options': options,
        'school': 'deanza',
        'is_choose_one': True,
    }


def build_igetc_requirements(receiving_id, completed_codes, in_progress_codes, committed_codes):
    is_uc = receiving_id in UC_INSTITUTION_IDS
    is_csu = receiving_id in CSU_INSTITUTION_IDS

    reqs = []
    for area_code, area in IGETC_AREAS.items():
        if area_code in IGETC_UC_ONLY_AREAS and not is_uc:
            continue
        if area_code in IGETC_CSU_ONLY_AREAS and not is_csu:
            continue
        if _approved_set(area) & (completed_codes | committed_codes):
            continue
        reqs.append(_build_area_requirement(
            area_code, area, 'IGETC', 'IGETC Area',
            completed_codes, in_progress_codes,
        ))
    return reqs


def get_ge_approved_codes(ge_path):
    if ge_path == 'igetc':
        areas = IGETC_AREAS
    elif ge_path == 'csu':
        areas = CSU_GE_AREAS
    else:
        return []
    s = set()
    for area in areas.values():
        s |= _approved_set(area)
    return sorted(s)


def build_csu_ge_requirements(receiving_id, completed_codes, in_progress_codes, committed_codes):
    if receiving_id not in CSU_INSTITUTION_IDS:
        return []

    reqs = []
    for area_code, area in CSU_GE_AREAS.items():
        if _approved_set(area) & (completed_codes | committed_codes):
            continue
        reqs.append(_build_area_requirement(
            area_code, area, 'CSU_GE', 'CSU GE Area',
            completed_codes, in_progress_codes,
        ))
    return reqs
