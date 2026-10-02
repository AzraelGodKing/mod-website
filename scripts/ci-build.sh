#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${BUILDKITE_SOURCE:-}" == "webhook" || "${BUILDKITE_SOURCE:-}" == "schedule" ]]; then
  echo "Builds start from the Buildkite page, or from a mod release pipeline."
  exit 0
fi
if [[ -n "${BUILDKITE_PULL_REQUEST_REPO:-}" && "${BUILDKITE_PULL_REQUEST_REPO}" != "${BUILDKITE_REPO:-}" ]]; then
  echo "Fork builds are not accepted."
  exit 0
fi

npm ci
npm test
bash scripts/fetch-catalog-repos.sh
export RIMWORLD_MODS="$PWD/.catalog-sources/rimworld"
export SUNHAVEN_MODS="$PWD/.catalog-sources/sunhaven"
export SEVENDAYS_MODS="$PWD/.catalog-sources/sevendays"
npm run build
