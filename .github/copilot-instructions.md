# Copilot / Agent Instructions

## Design Context

This context is authoritative for any UI/UX work. Full version lives in `.impeccable.md` at the repo root — read it before doing design work. Summary below.

### Users
Two surfaces, one site. **Evaluators** (Nordic support-ops managers, heads of CX evaluating mid-day from a desk) and **Operators** (the same people after signup, using onboarding → agent settings → observability → conversation review during workdays). Daytime desk context, mid-to-large monitors dominant. Job: get an AI support agent from zero to deployed in an afternoon, then run it confidently.

### Brand Personality
**Sharp, operational, serious.** Adults at work, doing work that matters (customer trust). Quiet confidence. No emojis, no growth-marketing patter. Information density is a feature. Emotional goal: confidence, competence, calm focus — not delight, not warmth, not awe.

### Aesthetic Direction
- **Reference**: Linear / Height / Vercel dashboard / Plain.com — app-operator minimalism with editorial discipline.
- **Anti-references**: current Fraunces+teal wellness-SaaS look; generic Chatbase/Intercom purple-gradient + rounded card pattern; creative-agency maximalism; developer-terminal pastiche.
- **Theme**: light only. Warm paper-white background, not pure white, not gray.
- **Accent**: a single muted forest / moss green (`oklch(38% 0.06 150)` ink-accent, `oklch(52% 0.09 150)` interactive). Used sparingly — primary actions and key metrics only.
- **Typography**: editorial serif for display (GT Sectra / Tiempos / PP Editorial New tier — NOT Fraunces, Playfair, Cormorant) paired with a neo-grotesk for UI and body (Söhne / Diatype / Geist tier — NOT Inter, DM Sans, Manrope). Tabular figures for numerics.
- **Spatial**: 4pt scale, tight radii (4–6px), 1px hairlines over drop shadows, left-aligned, asymmetric grids where appropriate.

### Design Principles
1. **Density is respect.** Group information, don't float it in cards.
2. **One accent, used once.** Moss green signals the one primary thing.
3. **Typography carries hierarchy**, not color-size alone. 3–4 sizes, two weights, display serif for authored moments.
4. **Hairlines over shadows; edges over gradients.**
5. **Numbers are first-class.** Tabular figures, units, context.
6. **Copy is operational.** Name the thing, name the fix. No fluff.
7. **No AI-slop tells.** No gradient text, no side-stripe borders, no glassmorphism, no rounded icon tiles above every heading, no monospace-as-decoration, no purple-blue gradients.

When writing any UI code, re-read `.impeccable.md` first. When invoking `/impeccable craft`, this context is the starting point — do not re-derive from the codebase.
