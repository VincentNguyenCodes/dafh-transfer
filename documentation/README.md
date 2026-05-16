# DAFH Transfer — Project Documentation

A transfer planning web app for De Anza and Foothill Community College students. Given a student's transcript and which UC, CSU, or AICCU schools and majors they want to transfer into, it computes which CCC courses they still need to take, lets them build quarter-by-quarter schedules, and integrates Cal-GETC general education requirements.

This single document is intended to be pasted into a chat (e.g. claude.ai) to give an LLM full project context.

---

## What it does (user flow)

1. Student creates an account (JWT auth)
2. Student pastes their unofficial De Anza and/or Foothill transcript text. The parser extracts course rows (code, name, units, term, grade, status: completed/in_progress)
3. Student picks transfer targets via a school + major search powered by the ASSIST.org institution and agreement APIs
4. Student visits the Requirements tab to see, per target, which receiving-school courses are required, which are recommended, what's a choose-one group (e.g. MATH 244 or MATH 206), what's an elective series (e.g. Physics OR Chemistry), and which CCC course satisfies each
5. Student creates a Schedule via a wizard:
   - Picks one option for every choose-one requirement that has alternatives (custom mode), or lets the optimizer pre-select the option requiring the fewest classes (optimal mode), with prereqs auto-added
   - Multi-pick areas (Cal-GETC Area 3 Arts and Humanities, Cal-GETC Area 4 Social and Behavioral Sciences) use checkboxes with constraint validation (at-least-one-per-subarea for Area 3, different-disciplines for Area 4)
   - Drags classes into quarters via a quarter-based schedule builder
   - Saves the schedule (name, quarters, full bank metadata)
6. Saved schedules appear on the Schedules tab; clicking one re-opens the builder for editing

---

## Stack

**Backend**
- Django 4.2 + Django REST Framework
- PostgreSQL (or SQLite for dev) with JSONField storage for schedules and cached payloads
- SimpleJWT for auth (access + refresh tokens)
- Anthropic Claude Haiku (`anthropic` Python SDK) for parsing unstructured admissions HTML (six scrapers: Cal Poly SLO, Cal Poly Pomona, Cal State LA, SJSU, CSU Long Beach, SDSU)

**Frontend**
- React 19 + TypeScript + Vite
- Tailwind CSS for styling
- @dnd-kit for drag-and-drop in the schedule builder
- Axios for HTTP, with a global response interceptor that auto-refreshes JWT tokens

**Data sources**
- ASSIST.org reverse-engineered browser API endpoints (no API key needed) — canonical for course articulation between CCCs and UC/CSU/AICCU
- Per-campus admissions websites (live HTML scraping for 6 schools)
- De Anza Cal-GETC course list (hardcoded snapshot)

---

## Repo layout

```
dafh-transfer/
├── backend/
│   ├── users/                  JWT auth (register, login, refresh)
│   ├── transcripts/            Transcript paste/parse, TranscriptEntry model
│   ├── assist/                 ASSIST.org HTTP client + AssistCache model + advisory parser
│   ├── planner/                Core planning logic
│   │   ├── models.py           TransferTarget, StudentProgress, Schedule, OptionPreference
│   │   ├── results.py          compute_remaining + compute_best_schedule (the brain)
│   │   ├── views.py            API endpoints (Results, Targets, Progress, Schedules)
│   │   ├── ge_requirements.py  Cal-GETC area definitions + multi-pick rules + builder
│   │   ├── prerequisites.py    Hardcoded course prereq map + chain walker
│   │   ├── series_config.py    Hardcoded multi-course series (Physics 4ABCD, etc.)
│   │   ├── calpoly_scraper.py  Cal Poly SLO admissions HTML fetcher + Claude parser
│   │   ├── cpp_scraper.py      Cal Poly Pomona impacted-majors scraper
│   │   ├── csula_scraper.py    Cal State LA major-specific criteria scraper
│   │   ├── sjsu_scraper.py     SJSU impaction transfer coursework scraper
│   │   ├── csulb_scraper.py    CSU Long Beach multi-college transfer requirements scraper
│   │   ├── sdsu_scraper.py     SDSU catalog Preparation-for-the-Major scraper
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

### Step 2: Frontend requests `/api/results/?ge_path=calgetc`
`backend/planner/views.py::ResultsView.get` calls `compute_remaining(user, ge_path='calgetc')` in `results.py`.

### Step 3: ASSIST articulation fetch
For each target, the backend calls `assist.client` to fetch ASSIST.org articulation data. ASSIST returns:
- `template`: the receiving school's required course cells (Cal Poly course codes)
- `articulations`: each cell maps to a list of acceptable De Anza/Foothill courses (`sendingArticulation`)

This data is cached 7 days in `AssistCache` (a model with a JSON field).

### Step 4: Per-school admissions advisory parse
ASSIST's "GeneralText" advisory doesn't distinguish required vs recommended for many schools, so the system uses custom scrapers for schools that publish strict admission requirements outside ASSIST.

`results.py::_parse_advisory()` checks `receiving_id` and routes to the appropriate scraper:
- `receiving_id == 11` → `calpoly_scraper.fetch_calpoly_requirements()`
- `receiving_id == 75` → `cpp_scraper.fetch_cpp_requirements()`
- `receiving_id == 76` → `csula_scraper.fetch_csula_requirements()`
- `receiving_id == 39` → `sjsu_scraper.fetch_sjsu_requirements()`
- `receiving_id == 81` → `csulb_scraper.fetch_csulb_requirements()`
- `receiving_id == 26` → `sdsu_scraper.fetch_sdsu_requirements()`
- otherwise → legacy `get_cached_advisory_parse()` against ASSIST's GeneralText

Each scraper follows the same general pattern:

a. **Slug or index resolution**: looks up the major name in a cached index mapping major name → URL or per-major identifier. Cached 30 days.

b. **Per-major cache check** (7-day TTL): one Postgres row per (school, major) keyed `{school}:{slug-or-id}` in `AssistCache`. If hit, returns cached Claude output filtered to the valid ASSIST template codes.

c. **Cache miss → fetch + parse**:
   - HTTP GET the per-major or per-college page
   - Strip text and pass to **Claude Haiku** with a school-specific prompt that returns JSON:
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

d. **Filter to valid codes**: `_filter_to_valid` drops any receiving code not present in the ASSIST template (since we have no articulation for it). Adds `comprehensive: True` flag so the legacy "every articulated course is also recommended" fallback is disabled.

If the major is not in the scraper's index (e.g. SJSU English isn't on the impaction page), the scraper returns `None` and `_parse_advisory` falls through to the legacy ASSIST advisory parser so the student still gets ASSIST-articulated major prep recommendations.

### Step 5: Build per-target requirements
Back in `compute_remaining`:
- Each `required` receiving code becomes a requirement; its options are the De Anza/Foothill courses that ASSIST says satisfy it
- Each `recommended` code becomes a recommended requirement
- Each `choose_one_group` becomes a single picker requirement with all alternatives
- Each `series_group` becomes an elective series with multiple "complete this whole sequence" options
- Each option's courses are tagged `completed`/`in_progress` based on the user's transcript (after course-code normalization)

### Step 6: Cal-GETC injection
After per-target requirements are built, Cal-GETC area requirements are added if the target is in `CALGETC_APPLIES_TO` (all 23 CSUs + 9 UCs + 14 AICCU schools):
- Single-pick areas (1A English Composition, 1B Critical Thinking, 1C Oral Communication, 2 Math, 5A Physical Science, 5B Biological Science, 6 Ethnic Studies)
- Multi-pick areas: Area 3 (Arts and Humanities, pick 2 with at-least-one-per-subarea) and Area 4 (Social and Behavioral Sciences, pick 2 from different disciplines)

A Cal-GETC area is **auto-suppressed** (silently treated as satisfied, no picker shown) if any approved CCC course for that area is either in the user's transcript OR in the user's major's required courses (the `committed_codes` set). Example: UCSB CS requires MATH 2A → MATH 2A is on Cal-GETC Area 2's approved list → Area 2 picker is hidden. For multi-pick areas, suppression requires meeting the full pick_count AND the area's rule (at-least-one-per-subarea or different-disciplines).

### Step 7: Response shape
For each target, the response contains:
```json
{
  "school_name": "California Polytechnic University, San Luis Obispo",
  "major_name": "COMPUTER SCIENCE, B.S.",
  "ge_path": "calgetc",
  "ge_approved_codes": ["ENGL C1000", "MATH 1A", ...],
  "prereq_map": {"SPAN 2": ["SPAN 1"], "MATH 1B": ["MATH 1A"], ...},
  "requirements": [...],
  "recommended": [...],
  "elective_series": [...]
}
```

### Step 8: Frontend builds a class bank
`ScheduleWizard.tsx` `classBank` useMemo iterates results, runs `pickOption` for each single-pick requirement and collects all checked options for multi-pick requirements, then collects a deduplicated set of CCC course chips. Then it walks `prereq_map` for each picked code and adds missing prereqs (skipping anything in the transcript). Finally tags each chip with the appropriate `needed_for` label:
- "UCSD" / "UCSB" / "CP SLO" for school-specific requirements
- "Cal-GETC" for GE area requirements
- "prereq for SPAN 2" for prereq chips (rendered as "→ SPAN 2")

A chip needed by both UCSB's major AND Cal-GETC Area 5A shows "UCSB · Cal-GETC".

---

## Key data: Cal-GETC areas

Cal-GETC (California General Education Transfer Curriculum) replaced both IGETC and CSU GE Breadth starting Fall 2025. It is the single GE pattern for UC, CSU, and most AICCU transfer students. Definitions live in `backend/planner/ge_requirements.py::CALGETC_AREAS`, sourced from De Anza's official Cal-GETC 2025-2026 PDF.

### Single-pick areas
- **1A English Composition** (1 course): ENGL C1000, ENGL C1000H, ESL 5, plus legacy EWRT 1A
- **1B Critical Thinking and English Composition** (1 course): COMM 9, ENGL C1001, PHIL 3, plus legacy EWRT 2
- **1C Oral Communication** (1 course): COMM C1000, COMM 10, plus legacy COMM 1
- **2 Mathematical Concepts and Quantitative Reasoning** (1 course): MATH 1A-1D, 2A-B, 11, 12, 17, 22, 23, 31, 32, 44, POLI 20, PSYC 15, SOC 15, STAT C1000
- **5A Physical Science** (1 course, with lab option): ASTR, CHEM, GEO, GEOL, MET, PHYS series
- **5B Biological Science** (1 course, with lab option): ANTH 1, BIOL series, ESCI
- **6 Ethnic Studies** (1 course): ADMJ 29, AFAM 10, AFAM 11, ASAM 11, CETH 10, CETH 29, CHLX 10, NAIS 12

### Multi-pick areas (`CALGETC_MULTI_PICK`)
- **3 Arts and Humanities** (2 courses, `at_least_one_per_subarea`):
  - 3A Arts: ARTS, ASAM 40, CETH 13, DANC, F/TV, HUMI, INTL, MUSI, NAIS, PHTG, THEA, WMST
  - 3B Humanities: AFAM, ASAM, CHLX, ELIT, EWRT 1C, F/TV, FREN 3, GERM, HIST, HUMI, INTL, ITAL, JAPN, KORE, LING, MAND, NAIS, PERS, PHIL, READ, RUSS, SIGN, SPAN, VIET, WMST
- **4 Social and Behavioral Sciences** (2 courses, `different_disciplines`): ADMJ, AFAM, ANTH, ASAM, C D, CETH, CHLX, COMM, ECON, E S, F/TV, GEO, HIST, HUMA, ICS, INTL, JOUR, KNES, NAIS, POLI, POLS, PSYC, SOC, WMST

### Institution scope
- `CSU_INSTITUTION_IDS = {1, 11, 12, 21, 23, 24, 26, 29, 39, 42, 50, 60, 75, 76, 81, 85, 88, 98, 115, 116, 129, 141, 143}` (all 23 CSUs)
- `UC_INSTITUTION_IDS = {7, 46, 79, 89, 117, 120, 128, 132, 144}` (all 9 undergrad UCs)
- `AICCU_INSTITUTION_IDS = {201, 206, 209, 213, 214, 215, 216, 217, 220, 222, 227, 228, 230, 235}` (14 AICCU independents in ASSIST)
- `CALGETC_APPLIES_TO = CSU_INSTITUTION_IDS | UC_INSTITUTION_IDS | AICCU_INSTITUTION_IDS`

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

## Per-school scrapers

| School | ASSIST id | Scraper file | Source URL | Structure |
|---|---|---|---|---|
| Cal Poly SLO | 11 | `calpoly_scraper.py` | `calpoly.edu/admissions/{slug}` | Per-major pages, 64 majors, dropdown index |
| Cal Poly Pomona | 75 | `cpp_scraper.py` | `cpp.edu/admissions/transfer/impacted-majors.shtml` | Single tabular page, 19 impacted majors |
| Cal State LA | 76 | `csula_scraper.py` | `calstatela.edu/admissions/major-specific-criteria-2026-2027` | Single page, year-prefixed URL, ~7 majors with criteria |
| SJSU | 39 | `sjsu_scraper.py` | `sjsu.edu/admissions/impaction/program-supplemental-criteria/program-impaction-transfer-coursework.php` | Single mega-page, 38 majors, ♦ marker = required |
| CSU Long Beach | 81 | `csulb_scraper.py` | `csulb.edu/admissions/major-specific-degree-requirements-for-transfer-students` + 7 college pages | Multi-page, term-prefixed URLs |
| SDSU | 26 | `sdsu_scraper.py` | `catalog.sdsu.edu/preview_program.php?catoid=11&poid={poid}` | Per-program catalog pages, 537 programs indexed, lazy fetch |

All scrapers emit the same JSON shape with `comprehensive: True` so the legacy catalog-overflow fallback in `compute_remaining` is short-circuited. If a major isn't found in a scraper's index, the scraper returns `None` and `_parse_advisory` falls through to the legacy ASSIST advisory parser.

---

## Schedule builder mechanics (`ScheduleBuilder.tsx`)

- Renders a class bank (top) plus a horizontal row of `QuarterCard`s
- Drag-and-drop powered by @dnd-kit; a class chip can be dragged from bank to a quarter, between quarters, or back to the bank
- Bank chips with prereqs are visually grouped: the prereq and parent appear inside a blue-tinted container with `→` separators (e.g. `[FREN 1 → FREN 2]`), so the user can see the order requirement at a glance
- `ClassItem` shape: `{ code, name, units, needed_for: string[], kind?: 'required' | 'recommended' | 'prereq', prereq_for?: string }`
- The viewer reuses the same component, loaded with the saved `quarters` and `class_bank` from the database

When the wizard saves, it persists the **complete** class bank (placed + unplaced + transcript items) so reloading the schedule preserves all metadata (names, units, kind, prereq_for). For older saved schedules without this metadata, the builder falls back to a minimal chip showing just the code.

---

## Schedule wizard mechanics (`ScheduleWizard.tsx`)

Two stages: `picking` and `building`.

**Picking stage**: shows a "GE pattern: Cal-GETC" indicator banner, then a sorted list of picker cards. Order: Cal-GETC areas (1A, 1B, 1C, 2, 3, 4, 5A, 5B, 6 numerically) first, then school-specific requirements alphabetically. Single-pick uses radio buttons; multi-pick (Area 3, Area 4) uses checkboxes with subarea grouping and live constraint validation. Picker cards for already-satisfied requirements are hidden (auto-suppression). Cards for individual satisfied options within a multi-option picker are hidden.

**Building stage**: full ScheduleBuilder drag-and-drop UI.

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

class Schedule(models.Model):
    user = FK(User)
    name = CharField
    schedule_type = CharField  # 'custom' | 'optimal'
    ge_path = CharField  # always 'calgetc' for new schedules; legacy 'igetc'/'csu' values still accepted
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

ASSIST and receiving schools use codes like `CIS22A` or `CIS 22A`. De Anza transcripts have `CIS D022A`. Foothill has `MATH F001A`. The normalizer at `transcripts/parser.py::normalize_course_code` strips the `D`/`F` prefix and leading zeros from the last token.

Both raw and normalized forms are added to the completed/in-progress sets, so matching works regardless of source format.

Note: Cal-GETC's new C-ID common course numbering (e.g. `ENGL C1000`, `STAT C1000`, `POLS C1000`) is preserved as-is and used alongside legacy De Anza codes for transcript matching.

---

## Caching strategy summary

| Data | Key | TTL |
|---|---|---|
| ASSIST articulation | `(receiving_id, sending_id, year_id, major_code)` | 7 days |
| Cal Poly SLO slug map | `calpoly:slug-map` | 30 days |
| Cal Poly SLO per-major | `calpoly:{slug}` | 7 days |
| Cal Poly Pomona all majors | `cpp:impacted-majors` | 7 days |
| Cal State LA all majors | `csula:all-majors-{year}` | 7 days |
| SJSU all majors | `sjsu:all-majors` | 7 days |
| CSU Long Beach college index | `csulb:colleges` | 30 days |
| CSU Long Beach all majors | `csulb:all-majors` | 7 days |
| SDSU program index | `sdsu:program-index` | 30 days |
| SDSU per-program | `sdsu:poid-{poid}` | 7 days |
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

GET  /api/results/?ge_path=calgetc
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

1. **Cal-GETC migration** — replaced IGETC + CSU GE Breadth with a single Cal-GETC pattern per De Anza 2025-2026 policy. New Area 6 Ethnic Studies added. Area 1C now required for everyone (no UC/CSU split). Area 3 picks 2 (was 3); Area 4 picks 2 (was 3). Area 6 LOTE removed (now a separate UC graduation requirement). Wizard GE-path picker step removed.
2. **SDSU catalog scraper** — `catalog.sdsu.edu/preview_program.php?catoid=11&poid={poid}` per program, 537 programs indexed, lazy fetch on first request
3. **CSU Long Beach multi-college scraper** — index + 7 college pages, lazy combined fetch
4. **SJSU impaction scraper** — single mega-page with ♦ marker handling
5. **Cal State LA scraper** — single page with year-prefixed URL (currently 2026-2027)
6. **Cal Poly Pomona impacted-majors scraper** — single tabular page
7. **Honors-variant prereq fallback** — `CIS 26BH` inherits prereqs from `CIS 26B`
8. **Click-to-open saved schedules** — SchedulesTab cards now open the schedule in the builder; full class metadata is persisted in `class_bank` so reloads aren't blank
9. **Picker dedup across schools** — Cal-GETC area 5B needed by UCSB + UCB shows one card with both targets
10. **Multi-pick Cal-GETC Areas 3 and 4** — single picker card with checkboxes, subarea grouping for Area 3, discipline-diversity rule for Area 4, live constraint validation
11. **Cal-GETC chip labels** — bank chips for GE-only courses show "Cal-GETC" instead of school list; courses serving both major and GE show "School · Cal-GETC"
12. **Prerequisites system** — hardcoded prereq map, chain walker, frontend bank expansion with grouped UI, optimizer awareness in `compute_best_schedule`
13. **Cal Poly admissions scraper** — replaces the old "default everything to recommended" behavior for Cal Poly
14. **AICCU institution support** — 14 AICCU independents in ASSIST now get Cal-GETC injection
15. **Catalog overflow short-circuit** — `comprehensive: True` flag prevents the legacy fallback from flooding the bank with unrelated articulated courses

---

## Out of scope / known limitations

- Quarter ordering enforcement (you can drag SPAN 1 to Spring after SPAN 2 in Fall; we visually group but don't block bad ordering)
- Co-requisites
- Catalog-scraped prereqs for less common courses (only the hardcoded map is supported)
- Cal-GETC area data is a hardcoded snapshot of De Anza's 2025-2026 PDF; need manual refresh if the GE-approved course lists change
- Cal Maritime, all UCs, and Group C CSUs (Fullerton, Northridge, Sacramento, etc.) do not have custom scrapers — they rely on the legacy ASSIST advisory parser
- Private and out-of-state schools not in ASSIST cannot be added as targets

---

## Testing the pipeline manually

```bash
cd backend
source venv/bin/activate

# Pre-warm all 64 Cal Poly SLO majors into the cache
python manage.py prewarm_calpoly --sleep 1.5

# Inspect what Claude returned for one major
python manage.py shell
>>> from assist.models import AssistCache
>>> import json
>>> r = AssistCache.objects.get(major_code='calpoly:computer-science')
>>> print(json.dumps(r.raw_json, indent=2))

# Verify Cal-GETC auto-satisfaction
>>> from planner.results import compute_remaining
>>> from django.contrib.auth.models import User
>>> u = User.objects.first()
>>> for r in compute_remaining(u, ge_path='calgetc'):
...     unsat = [req['receiving_code'] for req in r['requirements'] if not req['satisfied']]
...     print(r['school_name'], unsat)

# Verify prereq chain
>>> from planner.prerequisites import chain
>>> chain('SPAN 4', set())
['SPAN 1', 'SPAN 2', 'SPAN 3']
>>> chain('CIS 26BH', {'CIS 22A', 'CIS 22B'})
['CIS 26A']

# Inspect a per-school scraper output
>>> from planner.cpp_scraper import _load_all_majors
>>> data = _load_all_majors()
>>> print(list(data.keys()))
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
