import json
import re
from datetime import timedelta

import anthropic
import requests
from django.conf import settings
from django.utils import timezone

from assist.models import AssistCache

CSULA_YEAR = '2026-2027'
CSULA_URL = f'https://www.calstatela.edu/admissions/major-specific-criteria-{CSULA_YEAR}'
CACHE_TTL_DAYS = 7
CSULA_INSTITUTION_ID = 76

SYSTEM_PROMPT = (
    "You extract transfer admission requirements from Cal State LA HTML. "
    "Return ONLY valid JSON with no explanation, markdown, or code fences. "
    "Course codes should be without spaces (e.g. CS2011, MATH2110)."
)

USER_TEMPLATE = """\
This text is from Cal State LA's "Major-Specific Criteria (MSC)" page for {year}. It lists each major with admission requirements, often with two paths: ADT (Associate Degree for Transfer) applicants vs non-ADT applicants. There is typically a section "Major Specific Criteria (MSC) by Program" containing 6-10 majors, followed by "ALL OTHER MAJORS NOT LISTED ABOVE" which means standard CSU minimums.

Page text:
{html}

Walk through EVERY major listed under "Major Specific Criteria (MSC) by Program". For each, extract a dict entry describing the NON-ADT path (the stricter path for students without an ADT):

- required: course codes listed under "Required major preparation courses"
- recommended: course codes listed under "Additional recommended major preparation courses"
- choose_one_groups: when a section says "One of the following X courses" with multiple alternatives, output [["CODE1", "CODE2", "CODE3"]]
- series_groups: if any parallel multi-course sequences are required, list them

CRITICAL RULES:
- ONLY use real Cal State LA course codes that appear LITERALLY in the page text (e.g. "CS 2011", "MATH 2110", "CRIM 1010"). NEVER invent codes.
- If a major's requirements only say things like "Fire Protection Systems; or equivalent" or "Principles of Emergency Services; or equivalent" without a real CSULA course code (prefix + number), include the major in the output BUT leave required/recommended/choose_one_groups EMPTY. Add a placeholder note to the major's required list ONLY if a real CSULA code is given.
- Normalize codes to no-space format: "CS 2011" -> "CS2011".
- Skip GE references like "English Composition", "Oral Communication", "Critical Thinking", "Mathematical Concepts" — these are CSU GE, not specific course codes.
- Use the major name exactly as the page prints it.
- Include EVERY major that has a section, even if it only has empty arrays. This lets us flag "this major exists but requires only GE / supplemental application".

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


def _fetch_and_parse_page() -> dict:
    try:
        resp = requests.get(CSULA_URL, timeout=15)
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
            messages=[{'role': 'user', 'content': USER_TEMPLATE.format(year=CSULA_YEAR, html=text[:18000])}],
        )
        resp_text = msg.content[0].text.strip()
        resp_text = re.sub(r'^```[a-z]*\n?', '', resp_text)
        resp_text = re.sub(r'\n?```$', '', resp_text)
        return json.loads(resp_text)
    except Exception:
        return None


def _load_all_majors() -> dict:
    cache_key = f'csula:all-majors-{CSULA_YEAR}'
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-2, sending_institution_id=-2,
            academic_year_id=-2, major_code=cache_key,
        )
        if cached.cached_at >= timezone.now() - timedelta(days=CACHE_TTL_DAYS):
            return cached.raw_json
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    data = _fetch_and_parse_page()
    if not data:
        return None

    AssistCache.objects.create(
        receiving_institution_id=-2, sending_institution_id=-2,
        academic_year_id=-2, major_code=cache_key,
        raw_json=data,
    )
    return data


def fetch_csula_requirements(major_name: str, valid_codes: set):
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
            'flags': ['override: Cal State LA major has no specific transfer requirements; using CSU minimums'],
            'comprehensive': True,
        }

    return _filter_to_valid(matched, valid_codes)


def _filter_to_valid(data: dict, valid_codes: set) -> dict:
    flags = list(data.get('flags', []))
    flags.append('override: Cal State LA admissions page used as source of truth')

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
