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
    by_key: dict[str, dict] = {}
    lines = text.split('\n')

    EXCLUDED_GRADES = {'W', 'EW', 'NC', 'NP', 'RD', 'UW'}
    IN_PROGRESS_GRADES = {'IP', 'I'}

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # 3-line format: line ends exactly at DU/FU, title on next line, grade line after
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
                while j < min(i + 5, len(lines)) and not lines[j].strip():
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
                            }
                        i = j + 1
                        continue

        # Single-line format with two numeric columns (attempted + earned) then grade:
        # SUBJECT CODE DU/FU Title 5.00 5.00 A [Grade Mode] [Quality Points]
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
                }
            i += 1
            continue

        # Single-line format with one numeric column then grade:
        # SUBJECT CODE DU/FU Title 5.00 A [Grade Mode]
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
                }
            i += 1
            continue

        i += 1

    return list(by_key.values())


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
