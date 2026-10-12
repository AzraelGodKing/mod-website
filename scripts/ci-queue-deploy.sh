#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case "${BUILDKITE_SOURCE:-}" in
  ui|api|trigger_job|webhook) ;;
  schedule)
    if [[ "$(buildkite-agent meta-data get catalog-changed --default false)" != "true" ]]; then
      echo "Deploy stays off this build. The catalog did not change."
      exit 0
    fi
    ;;
  *)
    echo "Deploy stays off this build."
    exit 0
    ;;
esac
if [[ "${BUILDKITE_BRANCH:-}" != "main" || "${BUILDKITE_PULL_REQUEST:-false}" != "false" ]]; then
  echo "Deploy stays off this build."
  exit 0
fi
if [[ -n "${BUILDKITE_PULL_REQUEST_REPO:-}" && "${BUILDKITE_PULL_REQUEST_REPO}" != "${BUILDKITE_REPO:-}" ]]; then
  echo "Fork builds are not accepted."
  exit 0
fi
buildkite-agent pipeline upload .buildkite/deploy.yml
