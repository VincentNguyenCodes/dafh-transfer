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
This is the General Information advisory from an ASSIST.org articulation agreement page.
It describes what a transfer student should complete before enrolling at the university.

Advisory HTML:
{html}

Valid receiving-institution course codes found in this agreement: {codes}

Extract and return JSON with these fields:
- required: course codes that are explicitly REQUIRED for admission
- recommended: course codes that are highly recommended but not strictly required
- choose_one_groups: arrays of course codes where the student needs only ONE (e.g. "MATH54 or EECS16A or MATH56")

Rules:
- Only use codes from the provided list above
- If a course appears in a choose_one_group, do NOT also put it in required or recommended
- If there is no clear required vs recommended distinction, put everything in required
- If there are no course codes at all, return empty lists

Return exactly this JSON structure:
{{"required": [], "recommended": [], "choose_one_groups": [[]]}}"""


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
        max_tokens=1024,
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

    # Singleton choose_one groups are just required courses, not real choices
    real_choose_one = [g for g in choose_one if len(g) > 1]
    singleton_codes = {c for g in choose_one if len(g) == 1 for c in g}
    required |= singleton_codes

    required -= {c for g in real_choose_one for c in g}
    recommended -= {c for g in real_choose_one for c in g}

    return required, recommended, real_choose_one


def get_cached_advisory_parse(agreement_key: str, advisory_html: str, valid_codes: set):
    cache_key = f'advisory:{agreement_key}'
    try:
        cached = AssistCache.objects.get(
            receiving_institution_id=-1,
            sending_institution_id=-1,
            academic_year_id=-1,
            major_code=cache_key,
        )
        if cached.cached_at >= timezone.now() - timedelta(days=365):
            d = cached.raw_json
            return (
                set(d.get('required', [])),
                set(d.get('recommended', [])),
                [set(g) for g in d.get('choose_one_groups', [])],
            )
        cached.delete()
    except AssistCache.DoesNotExist:
        pass

    result = parse_advisory_with_claude(advisory_html, valid_codes)
    if result is None:
        return None

    required, recommended, choose_one = result
    AssistCache.objects.create(
        receiving_institution_id=-1,
        sending_institution_id=-1,
        academic_year_id=-1,
        major_code=cache_key,
        raw_json={
            'required': list(required),
            'recommended': list(recommended),
            'choose_one_groups': [list(g) for g in choose_one],
        },
    )
    return result
