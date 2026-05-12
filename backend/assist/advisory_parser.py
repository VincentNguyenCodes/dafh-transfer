import json
import re
from datetime import timedelta

import anthropic
from django.conf import settings
from django.utils import timezone

from .models import AssistCache

SYSTEM_PROMPT = (
    "You extract transfer course requirements from university advisory HTML. "
    "Return ONLY valid JSON with no explanation, markdown, or code fences."
)

USER_TEMPLATE = """\
This is the General Information advisory from an ASSIST.org articulation agreement.
It describes what a transfer student should complete before enrolling at the university.

Advisory HTML:
{html}

Valid receiving-institution course codes found in this agreement: {codes}

Extract and return JSON with these fields:
- required: course codes explicitly REQUIRED for admission
- recommended: course codes highly recommended but not strictly required
- choose_one_groups: arrays of codes where the student picks ONE (e.g. "MATH54 or EECS16A")
- series_groups: pick-one-complete-sequence requirements. Each group has a label and
  multiple options, where each option is a full sequence the student commits to.
  Example: science electives where the student picks the Physics series
  (PHYS7A + PHYS7B + PHYS7C) OR the Chemistry series (CHEM1A + CHEM1B + CHEM1C)
  OR the Biology series. Only include in series_groups when the advisory clearly
  presents alternative complete sequences.
- flags: array of strings noting anything unusual or ambiguous Claude detected.
  Use one of these category prefixes: "unit_based:", "external_ref:", "ambiguous:",
  "series_uncertain:", "no_clear_structure:", "other:".

Rules:
- Only use codes from the provided list
- If a course appears in choose_one_groups or series_groups, do NOT also put it in required or recommended
- If a series_group option references a sequence (3+ related courses), prefer series_groups over recommended
- Leave any field as [] if not applicable
- Flag anything where you had to guess or where the advisory references external pages,
  unit-based requirements ("X units from list"), or ambiguous phrasing

Return exactly this JSON structure (no extra fields):
{{
  "required": [],
  "recommended": [],
  "choose_one_groups": [],
  "series_groups": [],
  "flags": []
}}"""


def parse_advisory_with_claude(advisory_html: str, valid_codes: set):
    if not settings.ANTHROPIC_API_KEY or not advisory_html.strip():
        return None

    prompt = USER_TEMPLATE.format(
        html=advisory_html[:8000],
        codes=', '.join(sorted(valid_codes)),
    )

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': prompt}],
    )

    text = message.content[0].text.strip()
    text = re.sub(r'^```[a-z]*\n?', '', text)
    text = re.sub(r'\n?```$', '', text)

    data = json.loads(text)

    required = {c for c in data.get('required', []) if c in valid_codes}
    recommended = {c for c in data.get('recommended', []) if c in valid_codes}
    choose_one = [
        {c for c in group if c in valid_codes}
        for group in data.get('choose_one_groups', [])
        if any(c in valid_codes for c in group)
    ]

    real_choose_one = [g for g in choose_one if len(g) > 1]
    singleton_codes = {c for g in choose_one if len(g) == 1 for c in g}
    required |= singleton_codes

    series_groups = []
    for sg in data.get('series_groups', []):
        if not isinstance(sg, dict):
            continue
        valid_options = []
        for opt in sg.get('options', []):
            if isinstance(opt, dict):
                raw_codes = opt.get('codes', [])
                opt_name = (opt.get('name') or '').strip()
            elif isinstance(opt, list):
                raw_codes = opt
                opt_name = ''
            else:
                continue
            codes = [c for c in raw_codes if c in valid_codes]
            if codes:
                valid_options.append({'name': opt_name, 'codes': codes})
        if valid_options:
            series_groups.append({
                'label': (sg.get('label') or '').strip() or 'Pick one complete series',
                'options': valid_options,
            })

    series_codes = {c for g in series_groups for opt in g['options'] for c in opt['codes']}

    required -= {c for g in real_choose_one for c in g} | series_codes
    recommended -= {c for g in real_choose_one for c in g} | series_codes

    flags = [str(f).strip() for f in data.get('flags', []) if str(f).strip()]

    return {
        'required': required,
        'recommended': recommended,
        'choose_one_groups': real_choose_one,
        'series_groups': series_groups,
        'flags': flags,
    }


def get_cached_advisory_parse(agreement_key: str, advisory_html: str, valid_codes: set):
    cache_key = f'advisory_v2:{agreement_key}'
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-1,
            sending_institution_id=-1,
            academic_year_id=-1,
            major_code=cache_key,
        )
        if cached.cached_at >= timezone.now() - timedelta(days=365):
            d = cached.raw_json
            return {
                'required': set(d.get('required', [])),
                'recommended': set(d.get('recommended', [])),
                'choose_one_groups': [set(g) for g in d.get('choose_one_groups', [])],
                'series_groups': d.get('series_groups', []),
                'flags': d.get('flags', []),
            }
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    result = parse_advisory_with_claude(advisory_html, valid_codes)
    if result is None:
        return None

    AssistCache.objects.create(
        receiving_institution_id=-1,
        sending_institution_id=-1,
        academic_year_id=-1,
        major_code=cache_key,
        raw_json={
            'required': list(result['required']),
            'recommended': list(result['recommended']),
            'choose_one_groups': [list(g) for g in result['choose_one_groups']],
            'series_groups': result['series_groups'],
            'flags': result['flags'],
            'agreement_key': agreement_key,
        },
    )
    return result
