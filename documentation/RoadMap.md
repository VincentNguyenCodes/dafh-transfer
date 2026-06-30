# DAFH Transfer: Roadmap

Running list of planned work and known gaps. Add to this as new items come up.

---

## 1. Auth: switch to Google OAuth

**Current state**: plain Django `User` model + `djangorestframework-simplejwt`. Register takes username, email, password; login only checks username + password (email isn't used for login at all). No email verification step, no domain restriction (confirmed unrestricted), and no password-reset flow of any kind.

**Why Google OAuth specifically**: password-based auth needs some email-sending capability for a self-serve "forgot password" flow, and there is currently no email infrastructure configured anywhere (no SMTP, no SendGrid). Setting that up is a real cost. Google OAuth removes the problem at the root: there's no password, so there's nothing to reset.

**Scope when picked up**:
- Replace `Landing.tsx`'s username/email/password form with a Google sign-in flow.
- Drop the `username` field entirely; the verified Google email becomes the identity.
- Backend verifies the Google ID token and gets-or-creates the local `User` by email.
- Needs a Google Cloud Console OAuth client (client ID) before implementation can start.

---

## 2. Dead code to clean up

Found while auditing endpoints earlier this session, confirmed via grep that nothing in the frontend calls these:

- `GET/POST/DELETE /api/option-preferences/` + `OptionPreference` model (`backend/planner/models.py`, `views.py`): no caller anywhere.
- `GET /api/best-schedule/` + `compute_best_schedule()` (`backend/planner/results.py`, `views.py`): no caller anywhere.
- `Results.tsx` / the `/results` route (`frontend/src/App.tsx`): superseded by `RequirementsTab`, unreferenced by any nav link.
- `CourseLine` and `fmtCode` in `frontend/src/pages/RequirementsTab.tsx`: both flagged by `npm run lint` as unused (`@typescript-eslint/no-unused-vars`). `CourseLine` predates `CourseChip`; `fmtCode` has had no call site since at least the last common ancestor with the redesign branch.

---

## 3. Pending issue from the redesign-branch merge

`OverviewTab.tsx` has 2 lint errors ("Cannot create components during render") introduced by the other session's redesign commits (`ac1edee` and the commits around it), not by anything in this session's work. Confirmed via `npm run lint` right after merging that branch in. Not fixed yet since it isn't this session's code to fix uninvited.

---

## 4. Overview page: "what's next" idea

A small teaser card pulling the 2-3 nearest unsatisfied requirements across all targets, using data the page already loads via `/api/results/`. Turns the page from purely retrospective (percentages and counts) into actionable, without duplicating the full Requirements tab.

Smaller follow-up noted alongside this: the Overview page currently has zero mention of saved schedules despite Schedules being a core feature. A line like "you have N schedules, next planned quarter is X" was floated.

---

## 5. Known data and coverage limitations

See the "Out of scope / known limitations" section in [README.md](README.md) for the full list (quarter-ordering is advisory not enforced, no co-requisites, hardcoded-map-only prereqs, hardcoded Cal-GETC snapshot, missing scrapers for Cal Maritime/all UCs/Group C CSUs, no support for schools outside ASSIST).

One addition from this session, not yet in that list: blank-schedule mode doesn't wire in the transcript, so the prerequisite-ordering warning can't be suppressed for a prereq the student actually completed in real life but isn't on that particular board. This was a deliberate scope decision at the time (see "Prerequisite ordering check" in README.md) and is revisitable.
