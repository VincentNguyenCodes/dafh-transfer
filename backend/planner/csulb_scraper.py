import json
import re
import time
from datetime import timedelta

import anthropic
import requests
from django.conf import settings
from django.utils import timezone

from assist.models import AssistCache

CSULB_INDEX_URL = 'https://www.csulb.edu/admissions/major-specific-degree-requirements-for-transfer-students'
CSULB_BASE = 'https://www.csulb.edu'
CSULB_TERM_PREFIX = 'fall-2026'
CACHE_TTL_DAYS = 7
COLLEGE_INDEX_TTL_DAYS = 30
CSULB_INSTITUTION_ID = 81

SYSTEM_PROMPT = (
    "You extract transfer admission requirements from CSULB HTML. "
    "Return ONLY valid JSON with no explanation, markdown, or code fences. "
    "Course codes should be without spaces and uppercase (e.g. CHEM111A, MATH122)."
)

USER_TEMPLATE = """\
This text is from one of CSULB's college-specific transfer major-requirements pages. Each major typically has a "Major Preparation Courses" table (required) and an "Additional Recommended Preparation Courses for Transfer Applicants Only" table (recommended).

Page text:
{html}

Extract a dict where each key is a major name as printed (e.g. "Biological Sciences B.S.", "Computer Science B.S.") and each value has these buckets:

- required: course codes listed under "Major Preparation Courses" for that major
- recommended: course codes listed under "Additional Recommended Preparation Courses for Transfer Applicants Only"
- choose_one_groups: when a Course Number cell has comma-separated alternatives like "MATH 119A, 122" with title "Survey of Calculus I or Calculus I", output [["MATH119A", "MATH122"]]
- series_groups: parallel multi-course sequences if any

Rules:
- Normalize course codes: strip spaces, uppercase. "CHEM 111A" -> "CHEM111A", "MATH 122" -> "MATH122".
- Skip GE references like "English Composition", "Critical Thinking", "Oral Communication", "Mathematics".
- Use the major name exactly as printed including degree suffix (e.g. "Computer Science B.S.").
- Each major's data is followed by an "Explore: The X Department" line; do not include that as a course.
- If a single row has multiple codes, treat as a choose_one_group.

Return ONLY this JSON shape (no markdown):
{{
  "MajorName": {{
    "required": ["..."],
    "recommended": ["..."],
    "choose_one_groups": [["..."]],
    "series_groups": []
  }},
  ...
}}"""


def _normalize_for_match(s: str) -> str:
    s = s.lower()
    s = re.sub(r',?\s*b\.?[as]\.?\s*$', '', s)
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _get_college_urls() -> list:
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-2, sending_institution_id=-2,
            academic_year_id=-2, major_code='csulb:colleges',
        )
        if cached.cached_at >= timezone.now() - timedelta(days=COLLEGE_INDEX_TTL_DAYS):
            return cached.raw_json
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    try:
        resp = requests.get(CSULB_INDEX_URL, timeout=15)
        if resp.status_code != 200:
            return []
        pattern = rf'href="((?:{CSULB_BASE})?/admissions/{CSULB_TERM_PREFIX}-transfer-major-specific-degree-requirements-[a-z0-9-]+)"'
        matches = re.findall(pattern, resp.text)
    except Exception:
        return []

    urls = []
    seen = set()
    for href in matches:
        full = href if href.startswith('http') else CSULB_BASE + href
        if full not in seen:
            seen.add(full)
            urls.append(full)

    if not urls:
        return []

    AssistCache.objects.create(
        receiving_institution_id=-2, sending_institution_id=-2,
        academic_year_id=-2, major_code='csulb:colleges',
        raw_json=urls,
    )
    return urls


def _fetch_and_parse_college(url: str) -> dict:
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            return None
        html = resp.text
    except Exception:
        return None

    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()

    if not settings.ANTHROPIC_API_KEY:
        return None

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{'role': 'user', 'content': USER_TEMPLATE.format(html=text[:18000])}],
        )
        resp_text = msg.content[0].text.strip()
        resp_text = re.sub(r'^```[a-z]*\n?', '', resp_text)
        resp_text = re.sub(r'\n?```$', '', resp_text)
        return json.loads(resp_text)
    except Exception:
        return None


def _load_all_majors() -> dict:
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-2, sending_institution_id=-2,
            academic_year_id=-2, major_code='csulb:all-majors',
        )
        if cached.cached_at >= timezone.now() - timedelta(days=CACHE_TTL_DAYS):
            return cached.raw_json
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    urls = _get_college_urls()
    if not urls:
        return None

    combined = {}
    for i, url in enumerate(urls):
        data = _fetch_and_parse_college(url)
        if not data:
            continue
        for name, body in data.items():
            combined[name] = body
        if i < len(urls) - 1:
            time.sleep(1.0)

    if not combined:
        return None

    AssistCache.objects.create(
        receiving_institution_id=-2, sending_institution_id=-2,
        academic_year_id=-2, major_code='csulb:all-majors',
        raw_json=combined,
    )
    return combined


def fetch_csulb_requirements(major_name: str, valid_codes: set):
    all_majors = _load_all_majors()
    if not all_majors:
        return None

    target = _normalize_for_match(major_name)
    matched = None
    for name, body in all_majors.items():
        if _normalize_for_match(name) == target:
            matched = body
            break
    if not matched:
        for name, body in all_majors.items():
            if target in _normalize_for_match(name) or _normalize_for_match(name) in target:
                matched = body
                break

    if not matched:
        return {
            'required': set(),
            'recommended': set(),
            'choose_one_groups': [],
            'series_groups': [],
            'flags': ['override: CSULB major not found on college pages; using CSU minimums'],
            'comprehensive': True,
        }

    return _filter_to_valid(matched, valid_codes)


def _filter_to_valid(data: dict, valid_codes: set) -> dict:
    flags = list(data.get('flags', []))
    flags.append('override: CSULB admissions page used as source of truth')

    required = {c for c in data.get('required', []) if c in valid_codes}
    recommended = {c for c in data.get('recommended', []) if c in valid_codes}
    choose_one = [
        {c for c in g if c in valid_codes}
        for g in data.get('choose_one_groups', [])
        if any(c in valid_codes for c in g)
    ]
    series_groups = []
    for sg in data.get('series_groups', []) or []:
        if not isinstance(sg, dict):
            continue
        valid_options = []
        for opt in sg.get('options', []) or []:
            if isinstance(opt, dict):
                raw_codes = opt.get('codes') or []
                name = (opt.get('name') or '').strip()
            elif isinstance(opt, list):
                raw_codes = opt
                name = ''
            else:
                continue
            codes = [c for c in raw_codes if c in valid_codes]
            if codes:
                valid_options.append({'name': name, 'codes': codes})
        if valid_options:
            series_groups.append({
                'label': sg.get('label') or 'Pick one series',
                'options': valid_options,
            })

    series_codes = {c for g in series_groups for opt in g['options'] for c in opt['codes']}
    co_codes = {c for g in choose_one for c in g}
    required -= co_codes | series_codes
    recommended -= co_codes | series_codes

    return {
        'required': required,
        'recommended': recommended,
        'choose_one_groups': choose_one,
        'series_groups': series_groups,
        'flags': flags,
        'comprehensive': True,
    }
