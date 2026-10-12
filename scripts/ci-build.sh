#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${BUILDKITE_SOURCE:-}" == "schedule" && "${BUILDKITE_BRANCH:-}" != "main" ]]; then
  echo "Scheduled builds only run for main."
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

# A scheduled build only deploys when a mod release changed the catalog.
if [[ "${BUILDKITE_SOURCE:-}" == "schedule" ]]; then
  live="$(curl -fsS -H 'Cache-Control: no-cache' https://azraelsmods.com/catalog-version.txt || true)"
  if [[ "$(cat public/catalog-version.txt)" == "$live" ]]; then
    echo "The catalog matches the live site. Nothing to deploy."
    buildkite-agent meta-data set catalog-changed false
    exit 0
  fi
  echo "The catalog changed since the last deploy."
  buildkite-agent meta-data set catalog-changed true
fi

npm test
npm run build
