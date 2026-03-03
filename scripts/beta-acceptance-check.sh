#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Running beta acceptance release gates..."

echo "1/4 lint"
npm run lint

echo "2/4 tests"
npm test

echo "3/4 build"
npm run build

echo "4/4 critical e2e path (onboarding)"
npm run e2e -w apps/web -- tests/onboarding.spec.ts

echo "Beta acceptance checks passed."
