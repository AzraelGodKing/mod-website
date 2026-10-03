#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${BUILDKITE_SOURCE:-}" == "schedule" ]]; then
  echo "Scheduled builds do not run this pipeline."
  exit 0
fi
if [[ "${BUILDKITE_SOURCE:-}" == "webhook" && ( "${BUILDKITE_BRANCH:-}" != "main" || "${BUILDKITE_PULL_REQUEST:-false}" != "false" ) ]]; then
  echo "Webhook builds run only after a merge to main."
  exit 0
fi
if [[ -n "${BUILDKITE_PULL_REQUEST_REPO:-}" && "${BUILDKITE_PULL_REQUEST_REPO}" != "${BUILDKITE_REPO:-}" ]]; then
  echo "Fork builds are not accepted."
  exit 0
fi

npm ci
bash scripts/fetch-catalog-repos.sh
export RIMWORLD_MODS="$PWD/.catalog-sources/rimworld"
export SUNHAVEN_MODS="$PWD/.catalog-sources/sunhaven"
export SEVENDAYS_MODS="$PWD/.catalog-sources/sevendays"
node scripts/collect-mods.mjs
npm test
npm run build
