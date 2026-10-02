#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is missing on the deploy agent."
  exit 1
fi
if [[ -z "${TURNSTILE_SECRET:-}" || -z "${LINEAR_API_KEY:-}" || -z "${TURNSTILE_HOSTNAMES:-}" ]]; then
  echo "The deploy agent is missing the report-form secrets."
  exit 1
fi
if [[ "${TURNSTILE_HOSTNAMES}" == *localhost* || "${TURNSTILE_HOSTNAMES}" == *127.0.0.1* ]]; then
  echo "TURNSTILE_HOSTNAMES must be the public site hostname."
  exit 1
fi
if [[ "${BUILDKITE_BRANCH:-}" != "main" || "${BUILDKITE_PULL_REQUEST:-false}" != "false" ]]; then
  echo "Deploy only runs for main."
  exit 1
fi

put_secret() {
  printf '%s' "$2" | npx wrangler secret put "$1"
}

npm ci
bash scripts/fetch-catalog-repos.sh
export RIMWORLD_MODS="$PWD/.catalog-sources/rimworld"
export SUNHAVEN_MODS="$PWD/.catalog-sources/sunhaven"
export SEVENDAYS_MODS="$PWD/.catalog-sources/sevendays"
npm run deploy
put_secret TURNSTILE_SECRET "$TURNSTILE_SECRET"
put_secret LINEAR_API_KEY "$LINEAR_API_KEY"
put_secret TURNSTILE_HOSTNAMES "$TURNSTILE_HOSTNAMES"
