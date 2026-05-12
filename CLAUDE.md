# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Transfer planner for De Anza (ID: 113) and Foothill (ID: 51) community college students. Given a student's transcript and selected transfer targets (UC/CSU school + major), it fetches live articulation data from ASSIST.org and shows which CCC courses satisfy each transfer requirement.

## Commands

### Backend (Django)
```bash
cd backend
source venv/bin/activate
python manage.py runserver          # start dev server on :8000
python manage.py migrate            # apply migrations
python manage.py makemigrations     # create new migrations
python manage.py test               # run all tests
python manage.py test transcripts   # run tests for one app
```

### Frontend (React + Vite)
```bash
cd frontend
npm run dev      # dev server on :5173 (proxied to :8000)
npm run build    # production build (runs tsc first)
npm run lint     # ESLint
```

### Environment
Backend requires `backend/.env` (see `README.md` for variables). The Vite dev server proxies `/api` to Django — check `frontend/vite.config.ts` if the proxy needs adjustment.

## Architecture

### Data Flow
1. User pastes transcript text → `POST /api/transcript/parse/` → `transcripts/parser.py` extracts courses into `TranscriptEntry` rows
2. User picks a school+major → saved as `TransferTarget` in `planner/models.py`
3. `GET /api/results/` → `planner/results.py::compute_remaining()` orchestrates everything:
   - Loads user's completed/in-progress course codes from `TranscriptEntry`
   - For each `TransferTarget`, calls `assist/client.py` to fetch articulation data from ASSIST.org
   - Parses articulation JSON to build requirements and recommended courses
   - Returns satisfaction status for each requirement

### ASSIST.org Integration (`assist/`)
- `client.py` — raw HTTP client that maintains a session with ASSIST.org (needs XSRF cookie from homepage visit)
- `views.py` — proxies ASSIST API calls to the frontend (institution search, agreements list)
- `models.py::AssistCache` — caches all ASSIST API responses in PostgreSQL to avoid hammering the external API
  - Articulation data: 7-day TTL
  - Claude advisory parses: 365-day TTL (keyed by `advisory:{agreement_key}`)
- `constants.py` — hardcoded IDs: `DEANZA_ID=113`, `FOOTHILL_ID=51`, `LATEST_YEAR_ID=76`

### Advisory Parsing (`assist/advisory_parser.py`)
ASSIST articulation agreements contain a `GeneralText` HTML block listing required/recommended courses. This is parsed two ways:
1. **Claude Haiku** (primary): sends the HTML + valid UCSD course codes → gets back structured JSON `{required, recommended, choose_one_groups}`. Result is cached 365 days in `AssistCache`.
2. **Regex fallback** (`planner/results.py::_parse_advisory`): used when Claude is unavailable or returns nothing.

### Transcript Parsing (`transcripts/parser.py`)
Handles multiple copy-paste formats from De Anza/Foothill's online transcript viewer. Key behaviors:
- Splits on the *last* occurrence of "Course(s) in Progress" (first occurrence is a nav link false positive)
- Three regex patterns for completed courses: multi-line header format, single-line with 7 fields, single-line with 6 fields
- `normalize_course_code()` strips the `D`/`F` prefix and leading zeros from course numbers (e.g. `CIS D022A` → `CIS 22A`) for matching against ASSIST codes

### Backend Apps
| App | Purpose |
|-----|---------|
| `users` | JWT auth (register, login, refresh via SimpleJWT) |
| `transcripts` | Transcript upload/parse, `TranscriptEntry` model |
| `assist` | ASSIST.org proxy + `AssistCache` model |
| `planner` | `TransferTarget` + `StudentProgress` models; `results.py` core logic |

### Frontend Pages
| Route | Page | Purpose |
|-------|------|---------|
| `/` | `Landing` | Login/register |
| `/dashboard` | `Dashboard` | Step-by-step nav hub |
| `/transcript` | `Transcript` | Paste transcript text, view parsed courses |
| `/schools` | `Schools` | Search and add transfer targets |
| `/results` | `Results` | View requirements per target with satisfaction status |

### Auth
JWT tokens stored in `localStorage` (`access`, `refresh`). `frontend/src/api/client.ts` auto-refreshes on 401 and redirects to `/` if refresh fails. All backend endpoints require auth except `api/auth/register/` and `api/auth/token/`.

### Course Code Normalization
ASSIST uses codes like `CIS22A` while transcripts have `CIS D022A`. `normalize_course_code()` bridges this. Both the raw and normalized forms are added to the completed/in-progress sets so matching works regardless of format.
