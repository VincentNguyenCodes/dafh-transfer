import re


def parse_transcript(text: str, school: str) -> list[dict]:
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # Match "Course(s) in Progress" only when it appears alone on its line
    # (not "Course(s) in progress table Subject..." which is a compact table header).
    # Use the LAST such match — the transcript nav bar at the top also contains this
    # phrase as a link, so the first match is a false positive.
    matches = list(re.finditer(r'Course\(s\)\s+in\s+[Pp]rogress\s*\n', text))
    if matches:
        last = matches[-1]
        completed_text = text[:last.start()]
        in_progress_text = text[last.end():]
    else:
        completed_text = text
        in_progress_text = ''

    seen: set[str] = set()
    courses: list[dict] = []

    courses.extend(_parse_completed(completed_text, school, seen))
    courses.extend(_parse_in_progress(in_progress_text, school, seen))

    return courses


_TERM_RE = re.compile(r'Term\s*:\s*(\d{4})\s+(Fall|Winter|Spring|Summer)', re.I)


def _parse_completed(text: str, school: str, seen: set) -> list[dict]:
    by_key: dict[str, dict] = {}
    lines = text.split('\n')

    EXCLUDED_GRADES = {'W', 'EW', 'NC', 'NP', 'RD', 'UW'}
    IN_PROGRESS_GRADES = {'IP', 'I'}

    current_term = ''

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        term_m = _TERM_RE.search(line)
        if term_m:
            current_term = f"{term_m.group(2).capitalize()} {term_m.group(1)}"
            i += 1
            continue

        header_m = re.match(
            r'^([A-Z][A-Z /]*?)\s+([DF][0-9A-Z]*\.?[A-Z0-9]*)\s+(DU|FU)\s*$',
            line,
        )
        if header_m and i + 1 < len(lines):
            subject = header_m.group(1).strip()
            code = header_m.group(2).strip()
            title_line = lines[i + 1].strip()

            if title_line and not re.match(r'^(Subject|Term|Institution|Transcript|Course)', title_line):
                j = i + 2
                while j < min(i + 6, len(lines)) and not lines[j].strip():
                    j += 1
                if j < len(lines):
                    grade_line = lines[j].strip()
                    gm = re.match(r'^([A-Z]{1,2}[+-]?|IP)\s+([\d.]+)', grade_line)
                    if gm:
                        grade = gm.group(1)
                        units = float(gm.group(2))
                        key = f'{subject}_{code}'
                        seen.add(key)
                        if grade not in EXCLUDED_GRADES:
                            status = 'in_progress' if grade in IN_PROGRESS_GRADES else 'completed'
                            by_key[key] = {
                                'school': school,
                                'course_code': f'{subject} {code}',
                                'course_name': title_line,
                                'units': str(units),
                                'grade': grade,
                                'status': status,
                                'term': current_term,
                            }
                        i = j + 1
                        continue

        sl2 = re.match(
            r'^([A-Z][A-Z /]*?)\s+([DF][0-9A-Z]*\.?[A-Z0-9]*)\s+(DU|FU)\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s+([A-Z]{1,2}[+-]?)(?=\s|$)',
            line,
        )
        if sl2:
            subject = sl2.group(1).strip()
            code = sl2.group(2).strip()
            title_line = sl2.group(4).strip()
            units = float(sl2.group(5))
            grade = sl2.group(7)
            key = f'{subject}_{code}'
            seen.add(key)
            if grade not in EXCLUDED_GRADES:
                status = 'in_progress' if grade in IN_PROGRESS_GRADES else 'completed'
                by_key[key] = {
                    'school': school,
                    'course_code': f'{subject} {code}',
                    'course_name': title_line,
                    'units': str(units),
                    'grade': grade,
                    'status': status,
                    'term': current_term,
                }
            i += 1
            continue

        sl1 = re.match(
            r'^([A-Z][A-Z /]*?)\s+([DF][0-9A-Z]*\.?[A-Z0-9]*)\s+(DU|FU)\s+(.+?)\s+([\d.]+)\s+([A-Z]{1,2}[+-]?)(?=\s|$)',
            line,
        )
        if sl1:
            subject = sl1.group(1).strip()
            code = sl1.group(2).strip()
            title_line = sl1.group(4).strip()
            units = float(sl1.group(5))
            grade = sl1.group(6)
            key = f'{subject}_{code}'
            seen.add(key)
            if grade not in EXCLUDED_GRADES:
                status = 'in_progress' if grade in IN_PROGRESS_GRADES else 'completed'
                by_key[key] = {
                    'school': school,
                    'course_code': f'{subject} {code}',
                    'course_name': title_line,
                    'units': str(units),
                    'grade': grade,
                    'status': status,
                    'term': current_term,
                }
            i += 1
            continue

        i += 1

    return list(by_key.values())


def _parse_in_progress(text: str, school: str, seen: set) -> list[dict]:
    if not text:
        return []

    courses = []
    current_term = ''

    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue

        term_m = _TERM_RE.search(line)
        if term_m:
            current_term = f"{term_m.group(2).capitalize()} {term_m.group(1)}"
            continue

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
                'term': current_term,
            })

    return courses


def normalize_course_code(course_code: str) -> str:
    parts = course_code.split()
    if len(parts) >= 2:
        last = parts[-1]
        stripped = re.sub(r'^[DF]0*', '', last).rstrip('.')
        return ' '.join(parts[:-1] + [stripped])
    return course_code
