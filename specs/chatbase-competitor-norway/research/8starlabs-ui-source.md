# 8starlabs UI package source

## Source and docs
- Repo: https://github.com/8starlabs/ui
- Docs: https://ui.8starlabs.com

## Distribution
- Built on shadcn/ui with a registry-based distribution.
- Components installed via shadcn registry JSON endpoints.
- Example: `npx shadcn@latest add https://ui.8starlabs.com/r/status-indicator.json`
- The registry endpoint pattern is `https://ui.8starlabs.com/r/<component>.json`.
- Configurable as a third-party registry via shadcn/ui `components.json`.

## Prerequisites
- Node 18+
- shadcn/ui initialized in the target app
- Tailwind CSS configured

## Notes
- Registry artifacts live in the upstream repo (`registry/` and `registry.json`).
- Compatible with shadcn/ui component conventions.
- Works with shadcn's `components.json` registry configuration for third-party registries.
