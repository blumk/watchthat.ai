#!/usr/bin/env bash
# One-time setup: point git at the committed hook scripts in scripts/hooks/.
# Re-run is idempotent.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

chmod +x scripts/hooks/* scripts/*.sh
git config core.hooksPath scripts/hooks

echo "✓ Git hooks installed. core.hooksPath=$(git config core.hooksPath)"
