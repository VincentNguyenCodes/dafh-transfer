# DAFH Transfer — Project Documentation

A transfer planning web app for De Anza and Foothill Community College students. Given a student's transcript and which UC/CSU schools and majors they want to transfer into, it computes which CCC courses they still need to take, lets them build quarter-by-quarter schedules, and supports both IGETC and CSU GE Breadth general education paths.

This single document is intended to be pasted into a chat (e.g. claude.ai) to give an LLM full project context.

---

## What it does (user flow)

1. Student creates an account (JWT auth)
2. Student pastes their unofficial De Anza and/or Foothill transcript text. The parser extracts course rows (code, name, units, term, grade, status: completed/in_progress)
3. Student picks transfer targets via a school + major search powered by the ASSIST.org institution and agreement APIs
4. Student visits the Requirements tab to see, per target, which Cal Poly/UC courses are required, which are recommended, what's a choose-one group (e.g. MATH 244 or MATH 206), what's an elective series (e.g. Physics OR Chemistry), and which CCC course satisfies each
5. Student creates a Schedule via a wizard:
   - Picks a GE path (IGETC or CSU GE Breadth, or no GE if neither applies)
   - Picks one option for every choose-one requirement that has alternatives (custom mode), or lets the optimizer pre-select the option requiring the fewest classes (optimal mode), with prereqs auto-added
   - Drags classes into quarters via a quarter-based schedule builder
   - Saves the schedule (name, quarters, full bank metadata)
6. Saved schedules appear on the Schedules tab; clicking one re-opens the builder for editing

---

## Stack

**Backend**
- Django 4.2 + Django REST Framework
- PostgreSQL (or SQLite for dev) with JSONField storage for schedules and cached payloads
- SimpleJWT for auth (access + refresh tokens)
- Anthropic Claude Haiku (`anthropic` Python SDK) for parsing unstructured Cal Poly admissions HTML

**Frontend**
- React 19 + TypeScript + Vite
- Tailwind CSS for styling
- @dnd-kit for drag-and-drop in the schedule builder
- Axios for HTTP, with a global response interceptor that auto-refreshes JWT tokens

**Data sources**
- ASSIST.org reverse-engineered browser API endpoints (no API key needed)
- Cal Poly admissions website (live HTML scraping)

---

## Repo layout

```
dafh-transfer/
├── backend/
│   ├── users/              JWT auth (register, login, refresh)
│   ├── transcripts/        Transcript paste/parse, TranscriptEntry model
│   ├── assist/             ASSIST.org HTTP client + AssistCache model + advisory parser
│   ├── planner/            Core planning logic
│   │   ├── models.py       TransferTarget, StudentProgress, Schedule, OptionPreference
│   │   ├── results.py      compute_remaining + compute_best_schedule (the brain)
│   │   ├── views.py        API endpoints (Results, Targets, Progress, Schedules)
│   │   ├── calpoly_scraper.py  Cal Poly admissions HTML fetcher + Claude parser
│   │   ├── ge_requirements.py  IGETC and CSU GE area definitions + builders
│   │   ├── prerequisites.py    Hardcoded course prereq map + chain walker
│   │   ├── series_config.py    Hardcoded multi-course series (Physics 4ABCD, etc.)
│   │   └── management/commands/prewarm_calpoly.py  Bulk-cache all 64 Cal Poly majors
│   └── manage.py
├── frontend/src/
│   ├── api/client.ts                Axios instance, JWT refresh logic
│   ├── pages/
│   │   ├── Landing.tsx              Login/register
│   │   ├── Dashboard.tsx            Step-by-step nav hub
│   │   ├── Transcript.tsx           Transcript paste UI
│   │   ├── Schools.tsx              Add transfer targets
│   │   ├── RequirementsTab.tsx      Per-target requirement view
│   │   ├── SchedulesTab.tsx         Schedule list + viewer
│   │   ├── ScheduleWizard.tsx       Multi-stage schedule creation
│   │   └── ScheduleBuilder.tsx      Quarter drag-and-drop UI
│   └── App.tsx + index.css
└── documentation/README.md          (this file)
```

---

## Critical pipeline: from "I want Cal Poly CS" to "drag CIS 22A into Fall 2026"

### Step 1: User adds Cal Poly target
Frontend `Schools.tsx` POSTs to `/api/targets/` → backend creates a `TransferTarget` row with `receiving_institution_id=11`, `receiving_institution_name="California Polytechnic University, San Luis Obispo"`, `major_name="COMPUTER SCIENCE, B.S."`.

### Step 2: Frontend requests `/api/results/?ge_path={igetc|csu}`
`backend/planner/views.py::ResultsView.get` calls `compute_remaining(user, ge_path)` in `results.py`.

### Step 3: ASSIST articulation fetch
For each target, the backend calls `assist.client` to fetch ASSIST.org articulation data. ASSIST returns:
- `template`: the receiving school's required course cells (Cal Poly course codes)
- `articulations`: each cell maps to a list of acceptable De Anza/Foothill courses (`sendingArticulation`)

This data is cached 7 days in `AssistCache` (a model with a JSON field).

### Step 4: Cal Poly admissions advisory parse
ASSIST's "GeneralText" advisory for Cal Poly does not distinguish required vs recommended, so the system uses a custom path:

`results.py::_parse_advisory()` checks `if receiving_id == 11 and major_name` and routes to `calpoly_scraper.fetch_calpoly_requirements(major_name, valid_codes)`:

a. **Slug resolution**: looks up the major name in a cached slug map (built once by scraping the dropdown at `https://www.calpoly.edu/admissions/transfer-student/selection-criteria/major-specific-transfer-criteria`). The dropdown has `<option value="/admissions/computer-science">Computer Science</option>` style entries. Cached 30 days.

b. **Cache check** (7-day TTL): one Postgres row per Cal Poly major, keyed `calpoly:{slug}` in `AssistCache`. If hit, returns cached Claude output filtered to the valid ASSIST template codes.

c. **Cache miss → fetch + parse**:
   - HTTP GET `https://www.calpoly.edu/admissions/{slug}` (e.g. `/admissions/computer-science`)
   - Strip text and pass to **Claude Haiku** with a strict prompt that returns JSON:
     ```json
     {
       "required": ["MATH141", "MATH142", "MATH143", "CSC101", "CSC202"],
       "recommended": ["CSC203", "CSC248", "CPE225"],
       "choose_one_groups": [["MATH244", "MATH206"]],
       "series_groups": [{
         "label": "Physics/Chemistry",
         "options": [
           {"name": "Physics", "codes": ["PHYS141", "PHYS142", "PHYS143"]},
           {"name": "Chemistry", "codes": ["CHEM124", "CHEM125", "CHEM126"]}
         ]
       }],
       "flags": []
     }
     ```
   - Persist to `AssistCache`

d. **Filter to valid codes**: `_filter_to_valid` drops any Cal Poly code not present in the ASSIST template (since we have no articulation for it). Adds `comprehensive: True` flag so the legacy "every articulated course is also recommended" fallback is disabled.

### Step 5: Build per-target requirements
Back in `compute_remaining`:
- Each `required` Cal Poly code becomes a requirement; its options are the De Anza/Foothill courses that ASSIST says satisfy it
- Each `recommended` code becomes a recommended requirement
- Each `choose_one_group` becomes a single picker requirement with all alternatives
- Each `series_group` becomes an elective series with multiple "complete this whole sequence" options
- Each option's courses are tagged `completed`/`in_progress` based on the user's transcript (after course-code normalization)

### Step 6: GE injection
After per-target requirements are built, GE areas are added per the chosen `ge_path`:
- `ge_path == 'igetc'` and target is in `IGETC_APPLIES_TO`: add IGETC area requirements (1A, 1B, 1C, 2A, 3A, 3B, 4, 5A, 5B, 6) with UC/CSU-specific filtering (1C is CSU-only, 6 is UC-only)
- `ge_path == 'csu'` and target is in `CSU_INSTITUTION_IDS`: add CSU GE Golden Four (A1, A2, A3, B4)

A GE area is **auto-suppressed** (silently treated as satisfied, no picker shown) if any approved CCC course for that area is either in the user's transcript OR in the user's major's required courses (the `committed_codes` set). Example: UCSB CS requires MATH 2A → MATH 2A is on IGETC 2A's approved list → IGETC 2A is hidden.

### Step 7: Response shape
For each target, the response contains:
```json
{
  "school_name": "California Polytechnic University, San Luis Obispo",
  "major_name": "COMPUTER SCIENCE, B.S.",
  "ge_path": "igetc",
  "ge_approved_codes": ["EWRT 1A", "MATH 1A", ...],
  "prereq_map": {"SPAN 2": ["SPAN 1"], "MATH 1B": ["MATH 1A"], ...},
  "requirements": [...],
  "recommended": [...],
  "elective_series": [...]
}
```

### Step 8: Frontend builds a class bank
`ScheduleWizard.tsx` `classBank` useMemo iterates results, runs `pickOption` for each requirement (using user picks or the optimal default), and collects a deduplicated set of CCC course chips. Then it walks `prereq_map` for each picked code and adds missing prereqs (skipping anything in the transcript). Finally tags each chip with the appropriate `needed_for` label:
- "UCSD" / "UCSB" / "CP SLO" for school-specific requirements
- "IGETC" / "CSU GE" for GE area requirements
- "prereq for SPAN 2" for prereq chips

A chip needed by both UCSB's major AND IGETC area 5A shows "UCSB · IGETC".

---

## Key data: GE paths

### CSU Golden Four (`CSU_GE_AREAS` in `ge_requirements.py`)
- A1 Oral Communication
- A2 Written Communication
- A3 Critical Thinking
- B4 College-Level Math

### IGETC areas (`IGETC_AREAS`)
- 1A English Composition, 1B Critical Thinking + Composition, 1C Oral Communication (CSU only)
- 2A Mathematical Concepts and Quantitative Reasoning
- 3A Arts, 3B Humanities
- 4 Social and Behavioral Sciences
- 5A Physical Science, 5B Biological Science
- 6 Language Other Than English (UC only)

Each area has a hardcoded list of De Anza and Foothill course codes that satisfy it, sourced from the colleges' published GE Breadth and IGETC certification PDFs.

### Institution scope
- `CSU_INSTITUTION_IDS = {11, 21, 36, 60, 66, 75, 81, 84, 85, 88, 102, 110, 122, 131}` (Cal Poly SLO + 13 other Bay Area / common-transfer CSUs)
- `UC_INSTITUTION_IDS = {7, 79, 117, 120, 128, 132, 135, 137}` (UCSD, UCB, UCLA, UCI, UCSB, plus a few more)
- `IGETC_APPLIES_TO = CSU_INSTITUTION_IDS | UC_INSTITUTION_IDS`

---

## Key data: Prerequisites (`prerequisites.py`)

A hardcoded `PREREQS` map covers common De Anza and Foothill course chains:
- Languages: SPAN/FREN/CHIN/JAPN/KORE/GERM/VIET/ASL/ITAL ladders 1 through 4
- Math: MATH 1A → 1B → 1C → 1D, MATH 2A → 2B (plus honors variants)
- Chemistry: CHEM 1A → 1B → 1C, CHEM 12A → 12B → 12C
- Physics: PHYS 4A → 4B → 4C → 4D, PHYS 2A → 2B
- CS: CIS 22A → 22B → 22C, CIS 26A → 26B, CIS 21JA → 21JB
- Biology: BIOL 6A → 6B → 6C

`chain(code, completed)` walks the chain and returns all required prereqs in earliest-first order, skipping anything already completed.

`direct_prereqs(code)` falls back to the H-stripped variant for honors classes (so `CIS 26BH` inherits prereqs from `CIS 26B`).

The prereq map is exposed via `/api/results/` so the frontend can compute the same chains locally for picker option counts ("3 classes to take" instead of "1") and for grouped prereq → parent rendering in the bank.

---

## Schedule builder mechanics (`ScheduleBuilder.tsx`)

- Renders a class bank (top) plus a horizontal row of `QuarterCard`s
- Drag-and-drop powered by @dnd-kit; a class chip can be dragged from bank to a quarter, between quarters, or back to the bank
- Bank chips with prereqs are visually grouped: the prereq and parent appear inside a blue-tinted container with `→` separators (e.g. `[FREN 1 → FREN 2]`), so the user can see the order requirement at a glance
- `ClassItem` shape: `{ code, name, units, needed_for: string[], kind?: 'required' | 'recommended' | 'prereq', prereq_for?: string }`
- The viewer reuses the same component, loaded with the saved `quarters` and `class_bank` from the database

When the wizard saves, it persists the **complete** class bank (placed + unplaced + transcript items) so reloading the schedule preserves all metadata (names, units, kind, prereq_for). For older saved schedules without this metadata, the builder falls back to a minimal chip showing just the code.

---

## Backend models

```python
class StudentProgress(models.Model):
    user = OneToOne(User)
    last_step = CharField  # which page to resume on

class TranscriptEntry(models.Model):
    user = FK(User)
    school = CharField  # 'deanza' | 'foothill'
    course_code = CharField  # e.g. 'CIS D022A'
    course_name = CharField
    units = DecimalField
    grade = CharField
    status = CharField  # 'completed' | 'in_progress' | 'withdrawn'
    term = CharField  # e.g. 'Fall 2025'

class TransferTarget(models.Model):
    user = FK(User)
    receiving_institution_id = IntegerField  # ASSIST id
    receiving_institution_name = CharField
    major_name = CharField

class AssistCache(models.Model):
    receiving_institution_id, sending_institution_id, academic_year_id, major_code = IntegerFields/CharField
    raw_json = JSONField
    cached_at = DateTimeField
    # 7-day TTL for articulation, 30-day for slug map, 7-day for Cal Poly major parse

class Schedule(models.Model):
    user = FK(User)
    name = CharField
    schedule_type = CharField  # 'custom' | 'optimal'
    ge_path = CharField  # 'igetc' | 'csu' | ''
    quarters = JSONField  # [{id, term, year, class_codes}]
    class_bank = JSONField  # [ClassItem]

class OptionPreference(models.Model):
    user = FK(User)
    requirement_key = CharField
    chosen_option_index = IntegerField
    scope = CharField  # 'requirements' | 'schedule'
```

---

## Course code normalization

ASSIST and Cal Poly use codes like `CIS22A` or `CIS 22A`. De Anza transcripts have `CIS D022A`. Foothill has `MATH F001A`. The normalizer at `transcripts/parser.py::normalize_course_code` strips the `D`/`F` prefix and leading zeros from the last token.

Both raw and normalized forms are added to the completed/in-progress sets, so matching works regardless of source format.

---

## Caching strategy summary

| Data | Key | TTL |
|---|---|---|
| ASSIST articulation | `(receiving_id, sending_id, year_id, major_code)` | 7 days |
| Cal Poly slug map | `calpoly:slug-map` | 30 days |
| Cal Poly per-major Claude parse | `calpoly:{slug}` | 7 days |
| Generic ASSIST advisory Claude parse | `advisory:{agreement_key}` | 365 days |

All caches share the `AssistCache` model with a JSON payload. Cache keys use sentinel IDs (-2) for non-ASSIST entries.

---

## Auth

JWT (access + refresh) via SimpleJWT. Tokens stored in `localStorage` on the frontend. The Axios client (`frontend/src/api/client.ts`) auto-refreshes on 401 and redirects to `/` if refresh fails. All API endpoints require auth except `/api/auth/register/` and `/api/auth/token/`.

---

## Conventions

Per the project `CLAUDE.md`:
- No `Co-Authored-By` in commits; commits in the user's name only
- Suggest 3 commit message options before every commit; the user picks
- Commit after each small change; only push at end of session after asking
- No em dashes in any text (descriptions, commit messages, code comments)
- No comments or docstrings in code files
- Vincent Nguyen, USC CS student, is the maintainer

---

## API endpoints

```
POST /api/auth/register/
POST /api/auth/token/
POST /api/auth/token/refresh/

GET  /api/transcript/         List user's transcript entries
POST /api/transcript/         Add entries
POST /api/transcript/parse/   Paste raw text, parse and save

GET    /api/progress/
PATCH  /api/progress/

GET    /api/targets/
POST   /api/targets/
DELETE /api/targets/<id>/

GET  /api/results/?ge_path=<igetc|csu>
GET  /api/best-schedule/

GET    /api/option-preferences/
POST   /api/option-preferences/
DELETE /api/option-preferences/

GET    /api/schedules/
POST   /api/schedules/
GET    /api/schedules/<id>/
PATCH  /api/schedules/<id>/
DELETE /api/schedules/<id>/

ASSIST proxy endpoints under /api/assist/...
```

---

## Recent feature additions (most recent first)

1. **Click-to-open saved schedules** — SchedulesTab cards now open the schedule in the builder; full class metadata is persisted in `class_bank` so reloads aren't blank
2. **Alphabetical option sort** — courses within picker options and requirement options are now sorted A-Z
3. **Honors variant prereq fallback** — `CIS 26BH` inherits prereqs from `CIS 26B` via H-suffix lookup in both backend and frontend
4. **Prereq inline in pickers** — picker options show prereqs inside a blue pill (`ASL 1 → ASL 2`) and the "X classes to take" badge counts prereqs
5. **Hide already-done picker options + satisfied elective groups**
6. **GE chip labels** — bank chips for GE-only courses show "IGETC" or "CSU GE" instead of school list; courses serving both major and GE show "School · IGETC"
7. **Picker dedup across schools** — IGETC_5B needed by UCSB + UCB shows one card with both targets
8. **Catalog overflow fix** — Cal Poly bank no longer floods with unrelated courses (the comprehensive flag short-circuits the legacy fallback)
9. **CP SLO label** — `abbreviateSchool` returns `CP SLO` instead of fallback `CPUS`
10. **Prerequisites system** — hardcoded prereq map, chain walker, frontend bank expansion with grouped UI, optimizer awareness in `compute_best_schedule`
11. **IGETC support (Phase 2)** — 9 IGETC areas with auto-satisfaction
12. **CSU GE Golden Four (Phase 1)** — wizard asks GE path; A1/A2/A3/B4 added for CSU targets when not doing IGETC, auto-suppressed when major or transcript covers them
13. **Cal Poly admissions scraper + Claude advisory** — replaces the old "default everything to recommended" behavior for Cal Poly

---

## Out of scope / known limitations

- Quarter ordering enforcement (you can drag SPAN 1 to Spring after SPAN 2 in Fall; we visually group but don't block bad ordering)
- Co-requisites
- Catalog-scraped prereqs for less common courses (only the hardcoded map is supported)
- IGETC and CSU GE area data are hardcoded snapshots; need manual refresh if De Anza or Foothill update their lists
- Only Cal Poly has a custom admissions-page scraper; UCs rely on the legacy advisory parse

---

## Testing the pipeline manually

```bash
cd backend
source venv/bin/activate

# Pre-warm all 64 Cal Poly majors into the cache
python manage.py prewarm_calpoly --sleep 1.5

# Inspect what Claude returned for one major
python manage.py shell
>>> from assist.models import AssistCache
>>> import json
>>> r = AssistCache.objects.get(major_code='calpoly:computer-science')
>>> print(json.dumps(r.raw_json, indent=2))

# Verify GE area auto-satisfaction
>>> from planner.results import compute_remaining
>>> from django.contrib.auth.models import User
>>> u = User.objects.first()
>>> for r in compute_remaining(u, ge_path='igetc'):
...     unsat = [req['receiving_code'] for req in r['requirements'] if not req['satisfied']]
...     print(r['school_name'], unsat)

# Verify prereq chain
>>> from planner.prerequisites import chain
>>> chain('SPAN 4', set())
['SPAN 1', 'SPAN 2', 'SPAN 3']
>>> chain('CIS 26BH', {'CIS 22A', 'CIS 22B'})
['CIS 26A']
```

---

## Setup quickstart

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in SECRET_KEY, DB credentials, ANTHROPIC_API_KEY
python manage.py migrate
python manage.py runserver  # :8000

# Frontend
cd frontend
npm install
npm run dev  # :5173 (proxies /api to :8000)
```

Required env vars: `SECRET_KEY`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `ANTHROPIC_API_KEY`.
