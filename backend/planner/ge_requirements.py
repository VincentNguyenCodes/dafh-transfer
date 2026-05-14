from transcripts.parser import normalize_course_code

CSU_INSTITUTION_IDS = {11}

IGETC_APPLIES_TO = {7, 79, 11, 117, 120, 128}

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


def build_csu_ge_requirements(receiving_id, completed_codes, in_progress_codes, committed_codes):
    if receiving_id not in CSU_INSTITUTION_IDS:
        return []

    reqs = []
    for area_code, area in CSU_GE_AREAS.items():
        approved = _approved_set(area)

        if approved & (completed_codes | committed_codes):
            continue

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
        reqs.append({
            'receiving_code': f'CSU_GE_{area_code}',
            'receiving_name': f"{area['name']} (CSU GE Area {area_code})",
            'no_articulation': False,
            'satisfied': False,
            'options': options,
            'school': 'deanza',
            'is_choose_one': True,
        })
    return reqs
