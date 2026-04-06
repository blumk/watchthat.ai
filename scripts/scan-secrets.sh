#!/usr/bin/env bash
# Scan tracked files for suspected API keys and secrets.
# Called from the pre-push hook and `pnpm scan:secrets`.
#
# Exits non-zero if any suspected secret is found. Patterns below are
# deliberately specific to known key shapes (low false-positive rate);
# prefer adding a new pattern over loosening an existing one.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# name|regex (pipe-separated). Keep regex POSIX-extended; avoid \b, \d, etc.
patterns=(
  'Anthropic|sk-ant-api[0-9a-zA-Z_-]{20,}'
  'Firecrawl|fc-[a-f0-9]{32}'
  'Supabase secret|sb_secret_[a-zA-Z0-9_-]{20,}'
  'AWS access key|AKIA[0-9A-Z]{16}'
  'GitHub PAT (classic)|ghp_[a-zA-Z0-9]{30,}'
  'GitHub PAT (fine-grained)|github_pat_[a-zA-Z0-9_]{30,}'
  'Stripe live key|sk_live_[a-zA-Z0-9]{24,}'
  'Google private key|-----BEGIN (RSA |EC )?PRIVATE KEY-----'
  'Slack webhook|hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[a-zA-Z0-9]{24,}'
)

# Files never worth scanning (would produce false positives or blow up output).
# Pathspec magic ':!' excludes the path from `git grep`.
excludes=(
  ':!scripts/scan-secrets.sh'
  ':!.env.example'
  ':!pnpm-lock.yaml'
  ':!package-lock.json'
  ':!yarn.lock'
)

found_any=0
for row in "${patterns[@]}"; do
  name="${row%%|*}"
  regex="${row#*|}"
  if matches=$(git grep -n -I -E "$regex" -- "${excludes[@]}" 2>/dev/null); then
    echo "✗ $name"
    echo "$matches" | sed 's/^/    /'
    echo ""
    found_any=1
  fi
done

if [ "$found_any" -eq 1 ]; then
  echo "Suspected secret(s) found in tracked files. Remove the literal value,"
  echo "rotate the credential if it was ever committed, and use an env var instead."
  exit 1
fi

echo "✓ scan:secrets — no suspected secrets in tracked files"
