import json
import re
from datetime import timedelta

import anthropic
import requests
from django.conf import settings
from django.utils import timezone

from assist.models import AssistCache

SDSU_CATOID = 11
SDSU_BASE = 'https://catalog.sdsu.edu'
SDSU_PROGRAMS_INDEX = f'{SDSU_BASE}/content.php?catoid={SDSU_CATOID}&navoid=991'
CACHE_TTL_DAYS = 7
INDEX_TTL_DAYS = 30
SDSU_INSTITUTION_ID = 26

SYSTEM_PROMPT = (
    "You extract the transfer Preparation for the Major coursework from SDSU catalog program pages. "
    "Return ONLY valid JSON with no explanation, markdown, or code fences. "
    "Course codes should be without spaces and uppercase (e.g. CS150, MATH150)."
)

USER_TEMPLATE = """\
This text is from an SDSU undergraduate catalog page for one major. SDSU is impacted in every major. Look for the "Preparation for the Major" section which lists lower-division courses required before transfer or before declaring the major. These ARE admission-blocking required courses.

Page text:
{html}

Extract ONLY courses listed under the "Preparation for the Major" section. Output JSON:

- required: course codes in that section that are unconditionally required
- recommended: usually empty for SDSU; only fill if the catalog explicitly says "recommended"
- choose_one_groups: when a row says "X or Y" or "one of: X, Y, Z", output [["X","Y","Z"]]
- series_groups: parallel multi-course sequences if present (rare)

Rules:
- Normalize codes: strip spaces, uppercase. "CS 150" -> "CS150". "MATH 150" -> "MATH150". "PHYS 195L" -> "PHYS195L".
- Ignore the "Major" or "Major Requirements" upper-division sections. Only "Preparation for the Major" matters.
- Ignore GE references (e.g. "General Education", "Writing Assessment").
- If the page has no "Preparation for the Major" section or no specific codes there, return empty arrays.

Return ONLY this JSON shape (no markdown):
{{
  "required": [],
  "recommended": [],
  "choose_one_groups": [],
  "series_groups": []
}}"""


def _normalize_for_match(s: str) -> str:
    s = s.lower()
    s = re.sub(r',?\s*\(?b\.?[as]\.?\)?\s*$', '', s)
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _get_program_index() -> dict:
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-2, sending_institution_id=-2,
            academic_year_id=-2, major_code='sdsu:program-index',
        )
        if cached.cached_at >= timezone.now() - timedelta(days=INDEX_TTL_DAYS):
            return cached.raw_json
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    try:
        resp = requests.get(SDSU_PROGRAMS_INDEX, timeout=20)
        if resp.status_code != 200:
            return {}
        matches = re.findall(
            rf'preview_program\.php\?catoid={SDSU_CATOID}&(?:amp;)?poid=(\d+)[^>]*>\s*([^<]+?)\s*<',
            resp.text,
        )
    except Exception:
        return {}

    index = {}
    skip_terms = ('General Education', 'Curriculum', 'Minors', 'Certificate', 'Graduate', 'Credential', 'Bulletin')
    for poid, name in matches:
        name = name.strip()
        if not name or not poid:
            continue
        if any(t in name for t in skip_terms):
            continue
        if name in index:
            continue
        index[name] = int(poid)

    if not index:
        return {}

    AssistCache.objects.create(
        receiving_institution_id=-2, sending_institution_id=-2,
        academic_year_id=-2, major_code='sdsu:program-index',
        raw_json=index,
    )
    return index


def _resolve_poid(major_name: str) -> int:
    index = _get_program_index()
    if not index:
        return 0

    target = _normalize_for_match(major_name)
    for name, poid in index.items():
        if _normalize_for_match(name) == target:
            return poid
    for name, poid in index.items():
        nn = _normalize_for_match(name)
        if target in nn or nn in target:
            return poid
    return 0


def _fetch_and_parse_program(poid: int) -> dict:
    try:
        resp = requests.get(
            f'{SDSU_BASE}/preview_program.php?catoid={SDSU_CATOID}&poid={poid}',
            timeout=15,
        )
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
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            messages=[{'role': 'user', 'content': USER_TEMPLATE.format(html=text[:15000])}],
        )
        resp_text = msg.content[0].text.strip()
        resp_text = re.sub(r'^```[a-z]*\n?', '', resp_text)
        resp_text = re.sub(r'\n?```$', '', resp_text)
        return json.loads(resp_text)
    except Exception:
        return None


def fetch_sdsu_requirements(major_name: str, valid_codes: set):
    poid = _resolve_poid(major_name)
    if not poid:
        return None

    cache_key = f'sdsu:poid-{poid}'
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-2, sending_institution_id=-2,
            academic_year_id=-2, major_code=cache_key,
        )
        if cached.cached_at >= timezone.now() - timedelta(days=CACHE_TTL_DAYS):
            return _filter_to_valid(cached.raw_json, valid_codes)
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    data = _fetch_and_parse_program(poid)
    if not data:
        return None

    AssistCache.objects.create(
        receiving_institution_id=-2, sending_institution_id=-2,
        academic_year_id=-2, major_code=cache_key,
        raw_json=data,
    )
    return _filter_to_valid(data, valid_codes)


def _filter_to_valid(data: dict, valid_codes: set) -> dict:
    flags = list(data.get('flags', []))
    flags.append('override: SDSU catalog Preparation for the Major used as source of truth')

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
