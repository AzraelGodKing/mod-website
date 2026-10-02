#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is missing on the deploy agent."
  exit 1
fi
if [[ "${BUILDKITE_BRANCH:-}" != "main" || "${BUILDKITE_PULL_REQUEST:-false}" != "false" ]]; then
  echo "Deploy only runs for main."
  exit 1
fi

npm ci
bash scripts/fetch-catalog-repos.sh
export RIMWORLD_MODS="$PWD/.catalog-sources/rimworld"
export SUNHAVEN_MODS="$PWD/.catalog-sources/sunhaven"
export SEVENDAYS_MODS="$PWD/.catalog-sources/sevendays"
npm run deploy
