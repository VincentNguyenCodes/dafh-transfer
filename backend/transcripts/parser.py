import re


def parse_transcript(text: str, school: str) -> list[dict]:
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    ip_split = re.split(r'Course\(s\)\s+in\s+[Pp]rogress', text, maxsplit=1)
    completed_text = ip_split[0]
    in_progress_text = ip_split[1] if len(ip_split) > 1 else ''

    seen: set[str] = set()
    courses: list[dict] = []

    courses.extend(_parse_completed(completed_text, school, seen))
    courses.extend(_parse_in_progress(in_progress_text, school, seen))

    return courses


def _parse_completed(text: str, school: str, seen: set) -> list[dict]:
    courses = []
    lines = text.split('\n')
    i = 0

    while i < len(lines) - 2:
        line = lines[i].strip()

        m = re.match(
            r'^([A-Z][A-Z /]*?)\s+([DF][0-9A-Z]*\.?[A-Z0-9]*)\s+(DU|FU)\s*$',
            line,
        )
        if not m:
            i += 1
            continue

        subject = m.group(1).strip()
        code = m.group(2).strip()

        title_line = lines[i + 1].strip() if i + 1 < len(lines) else ''

        if not title_line or re.match(r'^(Subject|Term|Institution|Transcript|Course)', title_line):
            i += 1
            continue

        # Skip blank lines between title and grade (some transcript formats insert one)
        j = i + 2
        while j < min(i + 5, len(lines)) and not lines[j].strip():
            j += 1

        if j >= len(lines):
            i += 1
            continue

        grade_line = lines[j].strip()
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

        i = j + 1

    return courses


def _parse_in_progress(text: str, school: str, seen: set) -> list[dict]:
    if not text:
        return []

    courses = []

    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue

        # Format: SUBJECT CODE LEVEL TITLE... UNITS  (no grade column)
        m = re.match(
            r'^([A-Z][A-Z /]*?)\s+([DF][0-9A-Z]*\.?[A-Z0-9]*)\s+(DU|FU)\s+(.+?)\s+([\d.]+)\s*$',
            line,
        )
        if not m:
            continue

        subject = m.group(1).strip()
        code = m.group(2).strip()
        title = m.group(4).strip()
        units = float(m.group(5))

        key = f'{subject}_{code}'
        if key not in seen:
            seen.add(key)
            courses.append({
                'school': school,
                'course_code': f'{subject} {code}',
                'course_name': title,
                'units': str(units),
                'grade': '',
                'status': 'in_progress',
            })

    return courses


def normalize_course_code(course_code: str) -> str:
    parts = course_code.split()
    if len(parts) >= 2:
        last = parts[-1]
        stripped = re.sub(r'^[DF]0*', '', last).rstrip('.')
        return ' '.join(parts[:-1] + [stripped])
    return course_code
