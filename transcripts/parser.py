import re


def parse_transcript(text: str, school: str) -> list[dict]:
    courses = []
    seen: set[str] = set()

    text = text.replace('\r\n', '\n').replace('\r', '\n')
    lines = text.split('\n')

    i = 0
    while i < len(lines) - 2:
        line = lines[i].strip()

        m = re.match(
            r'^([A-Z][A-Z ]*?)\s+([DF][0-9A-Z]+\.?[A-Z0-9]*)\s+(DU|FU)\s*$',
            line,
        )
        if not m:
            i += 1
            continue

        subject = m.group(1).strip()
        code = m.group(2).strip()

        title_line = lines[i + 1].strip() if i + 1 < len(lines) else ''
        grade_line = lines[i + 2].strip() if i + 2 < len(lines) else ''

        if not title_line or re.match(r'^(Subject|Term|Institution|Transcript)', title_line):
            i += 1
            continue

        gm = re.match(r'^([A-Z][+-]?|P|NP|W|IP)\s+([\d.]+)', grade_line)
        if not gm:
            i += 1
            continue

        grade = gm.group(1)
        units = float(gm.group(2))

        key = f'{subject}_{code}'
        if key not in seen:
            seen.add(key)
            if grade != 'W':
                status = 'in_progress' if grade == 'IP' else 'completed'
                courses.append({
                    'school': school,
                    'course_code': f'{subject} {code}',
                    'course_name': title_line,
                    'units': str(units),
                    'grade': grade,
                    'status': status,
                })

        i += 3

    return courses


def normalize_course_code(course_code: str) -> str:
    parts = course_code.split()
    if len(parts) >= 2:
        last = parts[-1]
        stripped = re.sub(r'^[DF]0*', '', last)
        return ' '.join(parts[:-1] + [stripped])
    return course_code
