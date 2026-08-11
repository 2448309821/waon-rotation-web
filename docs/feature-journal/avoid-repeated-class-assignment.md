# Avoid Repeated Class Assignment

## Goal
- User-facing outcome: keep random assignment while avoiding giving the same teacher the same class more than once in a month when an equivalent valid assignment exists.
- Non-goals: forbid repetition when class capability or attendance leaves no alternative.
- Constraints: preserve attendance, class capability, monthly limits, manual assignments, and the existing seeded random behavior.

## Current Behavior
- What works now: from August 2026 onward, valid assignments first avoid repeating the class from the previous active session, then minimize teacher/class repetitions across the month, and finally use the existing seeded random tie-breaker.
- How to use it: no new control is required; automatic and random scheduling will apply the preference.
- Important edge cases: manual assignments remain authoritative, an automatically selected class cannot reuse a teacher already assigned manually that day, and unavoidable repeated classes remain assigned instead of becoming unassigned.

## How It Works
- Entry points: `buildSchedule` evaluates sessions in date order.
- State/data flow: the scheduler retains a per-teacher, per-class monthly count plus the previous active session's assignment map while scoring valid assignments.
- UI or API behavior: no UI changes are planned.
- Integration points: the preference is subordinate to validity and monthly-limit checks, but stronger than random tie-breaking.

## Changed Files
| File | Role |
| --- | --- |
| `web/src/schedule.js` | Assignment scoring and monthly class history. |
| `web/src/schedule.test.js` | Regression coverage for avoidable and unavoidable repetition. |
| `web/src/App.jsx` | Enables the new preference from August 2026 onward so older locked months stay unchanged. |
| `web/package.json` | Node test command. |

## Iterations
### 2026-08-11 - Start from the August report
- Change: defined a soft preference against repeated teacher/class pairs.
- Reason: the live August schedule assigned Okamoto to `きく` on both 8/22 and 8/29 even though Okazaki could cover `きく` on 8/29.
- Evidence: the current shared state reproduced the repeated assignment, and `scoreAssignment` did not inspect class history.
- Result: regression test is being added before the scheduler change.
- Next: make the regression test pass without leaving unavoidable classes empty.

### 2026-08-11 - Resolve equal monthly-repeat scores by recency
- Change: added a regression case where both choices repeat a class somewhere in the month, but only one repeats the immediately previous session.
- Reason: the first monthly-count preference still reproduced the live 8/29 assignment because Okamoto repeating `きく` from 8/22 and Okazaki repeating `きく` from 8/1 had equal scores.
- Evidence: the live August input remained unchanged after the first implementation.
- Result: previous-session repetition is now scored before broader monthly repetition.
- Next: verify the live August state and protect older locked months.

### 2026-08-11 - Preserve locked history and manual assignments
- Change: enabled the preference from August 2026 onward and excluded teachers already assigned manually in the same session from automatic candidates.
- Reason: applying the new scoring globally changed old locked schedules, and the first August implementation could assign one teacher to both a manual and automatic class.
- Evidence: old/new comparison initially changed June and July; after scoping, May through July report zero assignment changes and only 8/29 changes in August.
- Result: the live August input assigns 8/29 `きく` to Okazaki instead of repeating Okamoto's 8/22 `きく`; all classes remain assigned.
- Next: user confirmation before upload.

## Verification
| Check | Result | Notes |
| --- | --- | --- |
| `npm test` | pass | 4 tests cover avoidable repetition, unavoidable fallback, previous-session tie-breaking, and manual-assignment protection. |
| Live August recomputation | pass | 8/29 no longer repeats Okamoto on `きく`; May, June, and July have zero assignment changes. |
| `npm run build` | pass | Vite transformed 461 modules and completed successfully. |
| `git diff --check` | pass | No whitespace errors. |
| Local dev server | pass | `http://127.0.0.1:5175/waon-rotation-web/` returned HTTP 200. |

## Known Issues
- A repeated class is still allowed when attendance and class capability leave no valid alternative.

## Next Steps
- Confirm the local result with the user before pushing.
