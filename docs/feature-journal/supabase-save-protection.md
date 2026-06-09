# Supabase Save Protection

## Goal
- User-facing outcome: saved notes, meeting memos, personal memos, lesson reports, and month records should not disappear when an older or stale browser tab saves state.
- Non-goals: split lesson reports into a dedicated Supabase table in this iteration.
- Constraints: keep the existing single-row `rotation_states/shared` storage shape and avoid UI changes.

## Current Behavior
- What works now: before each Supabase save, the app reloads the current remote state and protects user-entered map fields from stale local overwrites.
- How to use it: use the app normally; the protection runs automatically during cloud sync.
- Important edge cases: a user can still edit an individual memo or lesson report because local keys changed after the last sync win over the remote value for that key.

## How It Works
- Entry points: the Supabase save `useEffect` in `web/src/App.jsx`.
- State/data flow: `lastSyncedStateRef` is used as the base snapshot, the current local `state` is the proposed change, and the freshly fetched Supabase row is the remote state to preserve.
- UI or API behavior: the app still performs one `upsert` to `rotation_states`, but the payload is rebuilt with protected map fields merged first.
- Integration points: protected fields include monthly session maps, attendance maps, memos, meeting notes, personal memos, lesson reports, archives, and attendance counts.

## Changed Files
| File | Role |
| --- | --- |
| `web/src/App.jsx` | Adds protected merge helpers and reloads remote state before saving. |
| `docs/feature-journal/supabase-save-protection.md` | Records the data-loss prevention change. |

## Iterations
### 2026-06-09 - Add protected Supabase save merge
- Change: added diff-based protected merging before Supabase `upsert`.
- Reason: whole-state writes could let stale clients overwrite non-empty remote maps with empty or outdated local maps.
- Evidence: current Supabase state still had memos, but `lessonReportsByMonth` was already `{}`, matching a whole-state overwrite failure mode.
- Result: implementation added; build verification passed.
- Next: push when the live GitHub Pages version should be updated.

## Verification
| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` | pass | Vite build completed; only the existing chunk-size warning remains. |

## Known Issues
- This prevents future overwrites but does not recover lesson reports already deleted from the current Supabase row.
- A dedicated `lesson_reports` table would be a stronger long-term design, but it requires a Supabase schema migration and API changes.

## Next Steps
- Push after verification if the user wants the live GitHub Pages version updated.
