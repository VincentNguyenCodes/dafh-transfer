# DAFH Transfer — Documentation

## How It Works

1. Student pastes their unofficial De Anza and/or Foothill transcript
2. Student selects which schools and majors they want to transfer to
3. The app fetches articulation agreements from ASSIST.org
4. Claude AI parses each school's advisory text to identify required vs recommended courses
5. The app shows which De Anza/Foothill classes the student still needs

## Key Concepts

### ASSIST.org Integration

The app uses ASSIST.org's reverse-engineered browser API endpoints (the same calls the website makes). No API key required. Results are cached in the database:
- Articulation agreements: 7-day cache
- Advisory text parsing (Claude): 365-day cache (one call per school/major/year)

### Advisory Parsing

Each university department writes transfer requirements in free-form HTML. Claude Haiku reads the advisory and returns structured JSON:
- `required`: courses explicitly required for admission
- `recommended`: highly recommended but not required
- `choose_one_groups`: groups where student needs only ONE (e.g. "MATH54 or EECS16A")

### Transcript Parsing

Students paste their unofficial transcript (Cmd+A, Cmd+C from the transcript page). The parser handles both De Anza and Foothill formats, deduplicates entries, and excludes withdrawn (W grade) courses.

### Course Code Normalization

De Anza internal codes (e.g. `CIS D022A`) are normalized to match ASSIST format (`CIS 22A`) for matching. Foothill codes follow the same pattern with `F` prefix.

## Institution IDs

- De Anza College: `113`
- Foothill College: `51`
- Current academic year: `76` (2025-2026)

## Data Model

| Model | Purpose |
|---|---|
| `User` | Django built-in auth |
| `StudentProgress` | Resume flow at correct step |
| `TranscriptEntry` | Completed/in-progress courses |
| `TransferTarget` | Selected school + major combos |
| `AssistCache` | Cached ASSIST API + Claude responses |
