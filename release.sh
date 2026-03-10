#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DRY_RUN="false"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required." >&2
  exit 1
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "Error: pi is required for smoke tests." >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
NAME="$(node -p "require('./package.json').name")"

echo "==> Releasing $NAME@$VERSION"

echo "==> Running smoke tests"
npm run smoke

echo "==> Checking package contents"
npm run pack:check

if [[ "$DRY_RUN" == "true" ]]; then
  echo "==> Dry run complete. Skipping npm publish."
  exit 0
fi

echo "==> Verifying npm auth"
npm whoami >/dev/null

echo "==> Publishing to npm"
if [[ -n "${NPM_OTP:-}" ]]; then
  echo "==> Using NPM_OTP from environment"
  npm publish --otp "$NPM_OTP"
else
  npm publish
fi

echo "==> Done"
echo "Install command: pi install npm:${NAME}@${VERSION}"
