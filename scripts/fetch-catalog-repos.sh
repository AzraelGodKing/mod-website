#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/.catalog-sources"
rm -rf "$dest"
mkdir -p "$dest"
# mod.json is on chore/mod-json until those branches merge to main.
clone() {
  git clone --depth 1 --branch chore/mod-json "https://github.com/AzraelGodKing/$1.git" "$dest/$2"
}
clone rimworld_mods rimworld
clone SunhavenMod sunhaven
clone 7d2d_mods sevendays
