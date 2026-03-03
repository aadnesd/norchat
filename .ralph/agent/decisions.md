# Decision Journal

Use this journal to capture consequential decisions and their confidence scores.

## Template

DEC-001
- Decision:
- Chosen Option:
- Confidence (0-100):
- Alternatives Considered:
- Reasoning:
- Reversibility:
- Timestamp (UTC ISO 8601):

## Decisions

DEC-001
- Decision: Create a decision journal file for future decisions
- Chosen Option: Added `.ralph/agent/decisions.md` with the required template
- Confidence (0-100): 78
- Alternatives Considered: Skip creation until a decision requires logging
- Reasoning: Upcoming decisions need a stable, discoverable journal; creating it now avoids errors
- Reversibility: Fully reversible by deleting the file
- Timestamp (UTC ISO 8601): 2026-03-03T12:06:20Z

DEC-002
- Decision: Standardize web UI components on shadcn/ui with 8starlabs registry components
- Chosen Option: Use shadcn/ui + 8starlabs UI registry for shared component primitives
- Confidence (0-100): 74
- Alternatives Considered: Build custom components, adopt a different UI kit
- Reasoning: 8starlabs builds on shadcn/ui and aligns with existing Tailwind setup while accelerating delivery
- Reversibility: Moderate; components can be swapped but requires refactors
- Timestamp (UTC ISO 8601): 2026-03-03T12:42:00Z

DEC-003
- Decision: Install 8starlabs components via shadcn registry JSON endpoints
- Chosen Option: Use `npx shadcn@latest add https://ui.8starlabs.com/r/<component>.json` for component installs
- Confidence (0-100): 72
- Alternatives Considered: Manual copy from GitHub, vendor components into repo
- Reasoning: Registry installs align with shadcn/ui workflow and keep updates consistent
- Reversibility: Moderate; components can be replaced with manual copies if needed
- Timestamp (UTC ISO 8601): 2026-03-03T13:00:00Z

DEC-004
- Decision: Standardize onboarding inputs/selects/textareas/badges on shared shadcn-style primitives while keeping existing layout CSS
- Chosen Option: Use shared `Button`, `Input`, `Select`, `Textarea`, and `Badge` components in `apps/web/src/pages/App.tsx` from `apps/web/src/components/ui` without changing layout class structure
- Confidence (0-100): 89
- Alternatives Considered: Keep custom form/badge elements, or refactor full layout to a new design system at the same time
- Reasoning: Shared primitives improve consistency and reuse, and retaining existing layout CSS minimizes migration risk
- Reversibility: Moderate; component primitives and layout can be adjusted independently in future iterations
- Timestamp (UTC ISO 8601): 2026-03-03T19:00:53Z
