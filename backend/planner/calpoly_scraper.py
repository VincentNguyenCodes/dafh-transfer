import json
import re
from datetime import timedelta

import anthropic
import requests
from django.conf import settings
from django.utils import timezone

from assist.models import AssistCache

CALPOLY_BASE = 'https://www.calpoly.edu/admissions'
CACHE_TTL_DAYS = 7
CALPOLY_INSTITUTION_ID = 11

SYSTEM_PROMPT = (
    "You extract transfer admission requirements from Cal Poly San Luis Obispo HTML. "
    "Return ONLY valid JSON with no explanation, markdown, or code fences. "
    "Course codes should be without spaces (e.g. CSC101, MATH141, PHYS141)."
)

USER_TEMPLATE = """\
This text is from Cal Poly San Luis Obispo's transfer admissions page for one major.

Page text:
{html}

Valid Cal Poly course codes ASSIST tracks for this major: {codes}

Carefully read the page and categorize each required/recommended course into ONE of:

1. **required**: a single course code unconditionally required (no "or" alternative)
2. **choose_one_groups**: when the page says "A or B" / "either A or B" for a single requirement, output [["A", "B"]]. Look hard for these — they typically appear in the Math section (e.g. "MATH 244 or MATH 206") or under a single bullet that lists two course codes joined by "or"
3. **series_groups**: when the page offers two or more parallel multi-course sequences (e.g. "Physics: PHYS 141, 142, 143 OR Chemistry: CHEM 124, 125, 126"), output as a series_group with each sequence as an option. Look for headings like "Physics OR Chemistry" or "Lab Science (choose one)"
4. **recommended**: under a "Recommended" / "Desired" heading

Examples of patterns to detect:
- "MATH 244/Linear Analysis I OR MATH 206/Linear Algebra I" → choose_one_groups: [["MATH244", "MATH206"]]
- "PHYS 141, PHYS 142, PHYS 143 OR CHEM 124, CHEM 125, CHEM 126" → series_groups with two options

Rules:
- Only use codes from the valid list above
- Normalize to no-space format (CSC101, not "CSC 101")
- Skip generic graduation requirements (Oral Comm, English Composition, Critical Thinking, GE) — only major-specific science/math/CS/engineering courses
- If a code appears in choose_one_groups or series_groups, do NOT also put it in required/recommended
- Flag if you couldn't find any required section or if the page is ambiguous

Return ONLY this JSON (no markdown):
{{
  "required": [],
  "recommended": [],
  "choose_one_groups": [],
  "series_groups": [{{"label": "...", "options": [{{"name": "Physics", "codes": ["..."]}}]}}],
  "flags": []
}}"""


def major_to_slug(major_name: str) -> str:
    s = major_name.lower()
    s = re.sub(r',?\s*b\.?[as]\.?\s*$', '', s)
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'\s+', '-', s.strip())
    return s


def fetch_calpoly_requirements(major_name: str, valid_codes: set):
    slug = major_to_slug(major_name)
    cache_key = f'calpoly:{slug}'

    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-2,
            sending_institution_id=-2,
            academic_year_id=-2,
            major_code=cache_key,
        )
        if cached.cached_at >= timezone.now() - timedelta(days=CACHE_TTL_DAYS):
            return _filter_to_valid(cached.raw_json, valid_codes)
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    try:
        resp = requests.get(f'{CALPOLY_BASE}/{slug}', timeout=15)
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
            messages=[{'role': 'user', 'content': USER_TEMPLATE.format(
                html=text[:15000],
                codes=', '.join(sorted(valid_codes)),
            )}],
        )
        text = msg.content[0].text.strip()
        text = re.sub(r'^```[a-z]*\n?', '', text)
        text = re.sub(r'\n?```$', '', text)
        data = json.loads(text)
    except Exception:
        return None

    AssistCache.objects.create(
        receiving_institution_id=-2,
        sending_institution_id=-2,
        academic_year_id=-2,
        major_code=cache_key,
        raw_json=data,
    )
    return _filter_to_valid(data, valid_codes)


def _filter_to_valid(data: dict, valid_codes: set) -> dict:
    flags = list(data.get('flags', []))
    flags.append('override: Cal Poly admissions page used as source of truth')

    series_groups = []
    for sg in data.get('series_groups', []):
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
                'label': (sg.get('label') or 'Pick one complete series'),
                'options': valid_options,
            })

    required = {c for c in data.get('required', []) if c in valid_codes}
    recommended = {c for c in data.get('recommended', []) if c in valid_codes}
    choose_one = [
        {c for c in g if c in valid_codes}
        for g in data.get('choose_one_groups', [])
        if any(c in valid_codes for c in g)
    ]
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
    }
