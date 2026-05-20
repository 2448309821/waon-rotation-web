# Monthly Limit Scheduling

## Goal
- User-facing outcome: automatic and random assignment should avoid assigning a teacher above their monthly target when another eligible available teacher can cover the class.
- Non-goals: make the monthly target an absolute blocker that leaves classes empty immediately.
- Constraints: keep the existing "なるべく" behavior by allowing over-limit fallback only when no complete in-limit assignment exists.

## Current Behavior
- What works now: scheduling first tries teachers who are still under their monthly limit, including adding shortage candidates when needed.
- How to use it: set each teacher's monthly target in teacher settings, then generate or reroll the assignment.
- Important edge cases: if every complete assignment requires someone over the limit, the scheduler still fills classes and reports the over-limit teacher in notes.

## How It Works
- Entry points: `buildSchedule` calls the assignment helpers for each session in month order.
- State/data flow: `assignmentCounts` tracks how many sessions each teacher has already been assigned this month.
- UI or API behavior: random reroll still works, but only within the eligible under-limit candidates before fallback.
- Integration points: class capability rules are still checked by `tryAssign`.

## Changed Files
| File | Role |
| --- | --- |
| `web/src/schedule.js` | Prefer under-limit teachers before using over-limit fallback. |

## Iterations
### 2026-05-20 - Prefer under-limit candidates
- Change: added an under-limit assignment pass before fallback assignment.
- Reason: a teacher set to 2 monthly assignments was receiving a third assignment while other available teachers existed.
- Evidence: user screenshot showed 柴田 assigned on 6/6, 6/13, and 6/20 despite a monthly target of 2.
- Result: build passes; ready for browser confirmation with the user's June data.
- Next: confirm the table no longer assigns 柴田 a third class when an eligible under-limit teacher can cover it.

## Verification
| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` | pass | Vite build completed; only the existing chunk-size warning remains. |

## Known Issues
- If no under-limit complete assignment exists, the scheduler still exceeds the target to avoid leaving classes empty.

## Next Steps
- Confirm with the user's June example in the browser.
