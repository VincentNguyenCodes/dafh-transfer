import json
import re
from datetime import timedelta

import anthropic
import requests
from django.conf import settings
from django.utils import timezone

from assist.models import AssistCache

CPP_URL = 'https://www.cpp.edu/admissions/transfer/impacted-majors.shtml'
CACHE_TTL_DAYS = 7
CPP_INSTITUTION_ID = 75

SYSTEM_PROMPT = (
    "You extract transfer admission requirements from Cal Poly Pomona HTML. "
    "Return ONLY valid JSON with no explanation, markdown, or code fences. "
    "Course codes should be without spaces (e.g. MAT1140, PHY1510L)."
)

USER_TEMPLATE = """\
This text is from Cal Poly Pomona's transfer-impacted-majors page. It contains tables per college with columns "Major", "Required Course(s)" or "Recommended Course(s)", and "CPP Course(s)".

Page text:
{html}

Extract a dict where each key is a major name (e.g. "Computer Science", "Aerospace Engineering") and each value is an object with these buckets, using only the CPP course codes (the right column):

- required: courses listed under a Required heading for that major
- recommended: courses listed under a Recommended heading for that major
- choose_one_groups: when a course cell says "X or Y" (e.g. "MAT 1250 or MAT 1140"), output [["MAT1250", "MAT1140"]]
- series_groups: when there are parallel multi-course sequences (rare here)

Rules:
- Normalize all CPP codes to no-space format. Keep `/L` suffix for lab variants but no space (CHM1210/L).
- Strip any "*" marker from major names.
- A major can appear in BOTH a "Required Courses" table and a "Recommended Courses" table; merge them into one entry.
- Skip generic GE / Golden Four boilerplate. Only capture rows that name CPP course codes.
- Use the major name exactly as printed (e.g. "Animal Science (Pre Vet)", "Kinesiology (General option only)").

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
        resp = requests.get(CPP_URL, timeout=15)
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
            academic_year_id=-2, major_code='cpp:impacted-majors',
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
        academic_year_id=-2, major_code='cpp:impacted-majors',
        raw_json=data,
    )
    return data


def fetch_cpp_requirements(major_name: str, valid_codes: set):
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
        return None

    return _filter_to_valid(matched, valid_codes)


def _filter_to_valid(data: dict, valid_codes: set) -> dict:
    flags = list(data.get('flags', []))
    flags.append('override: Cal Poly Pomona admissions page used as source of truth')

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
