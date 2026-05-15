import json
import re
from datetime import timedelta

import anthropic
import requests
from django.conf import settings
from django.utils import timezone

from assist.models import AssistCache

SJSU_URL = 'https://www.sjsu.edu/admissions/impaction/program-supplemental-criteria/program-impaction-transfer-coursework.php'
CACHE_TTL_DAYS = 7
SJSU_INSTITUTION_ID = 39

SYSTEM_PROMPT = (
    "You extract transfer admission requirements from SJSU HTML. "
    "Return ONLY valid JSON with no explanation, markdown, or code fences. "
    "Course codes should be without spaces and uppercase (e.g. MATH30, PHYS50)."
)

USER_TEMPLATE = """\
This text is from SJSU's program impaction transfer coursework page. SJSU is impacted in all majors. Each major lists supplemental preparatory coursework. Courses marked with the symbol ♦ MUST be completed prior to admission (treat these as REQUIRED). Other listed courses are strongly recommended for ranking (treat as RECOMMENDED).

Page text:
{html}

Extract a dict where each key is a major name as printed (e.g. "Aerospace Engineering (BS)", "Computer Science (BS)") and each value has these buckets:

- required: courses with the ♦ marker
- recommended: courses listed without the ♦ marker
- choose_one_groups: when a line says "X or Y" (e.g. "Math 71 or Math 30"), output [["MATH71", "MATH30"]]. Some lines say "Physics 2A and Physics 2B, or Physics 50 and Physics 51" — this is two parallel sequences; encode that as a series_group.
- series_groups: for parallel multi-course sequences

Rules:
- Normalize course codes: strip spaces, uppercase. "Math 30" -> "MATH30". "Chem 1A" -> "CHEM1A". "CMPE 30" -> "CMPE30". "CS 46A" -> "CS46A". Note: "Bus2 90" stays "BUS290".
- Ignore notes like "AS-T in X" alternative pathways. They're an admission shortcut, not coursework.
- Skip lines that mention deprecated courses or "no longer be considered after X".
- Use major names exactly as printed.

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
    s = re.sub(r',?\s*\(?b\.?[as]\.?\)?\s*$', '', s)
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _fetch_and_parse_page() -> dict:
    try:
        resp = requests.get(SJSU_URL, timeout=15)
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
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{'role': 'user', 'content': USER_TEMPLATE.format(html=text[:22000])}],
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
            academic_year_id=-2, major_code='sjsu:all-majors',
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
        academic_year_id=-2, major_code='sjsu:all-majors',
        raw_json=data,
    )
    return data


def fetch_sjsu_requirements(major_name: str, valid_codes: set):
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
    flags.append('override: SJSU impaction page used as source of truth')

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
