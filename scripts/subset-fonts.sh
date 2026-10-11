#!/usr/bin/env bash
# Subsets the axis-narrowed page fonts to the characters and OpenType features the site uses.
# Input: the narrowed latin files from step 2 of src/assets/fonts/README.md in <input-dir>.
# Output: the committed files in src/assets/fonts/. Needs fonttools 4.x (pyftsubset) and brotli.
# Usage: scripts/subset-fonts.sh <input-dir>
set -euo pipefail

IN="${1:?usage: scripts/subset-fonts.sh <input-dir>}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/src/assets/fonts"

# Typographic punctuation kept in every cut: nbsp, copyright, guillemets, registered, degree,
# middle dot, multiplication sign, en dash, curly quotes, bullet, ellipsis, primes, single
# guillemets, euro, trademark, minus.
PUNCT="U+00A0,U+00A9,U+00AB,U+00AE,U+00B0,U+00B7,U+00BB,U+00D7,U+2013,U+2018-201A,U+201C-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2212"
ASCII="U+0020-007E"
# Body text (and Ask answers) may contain accented names, so Inter keeps the Latin-1 letters.
LATIN1="U+00A0-00FF,U+0131,U+0152-0153"

subset() {
  local src="$1" dest="$2" unicodes="$3" features="$4"
  pyftsubset "$IN/$src" --unicodes="$unicodes" --layout-features="$features" --name-IDs="*" --flavor=woff2 --output-file="$OUT/$dest"
  printf '%-48s %6d bytes\n' "$dest" "$(wc -c <"$OUT/$dest")"
}

# kern and mark positioning stay; tnum backs `font-variant-numeric: tabular-nums`. Code ligatures
# (JetBrains Mono calt), fractions and proportional figures are unused. All name records (copyright,
# license) are kept.
subset inter-latin-wght400-800.woff2 inter-latin1-wght400-800.woff2 "$ASCII,$LATIN1,$PUNCT" "kern,mark,mkmk,ccmp,locl,tnum"
subset jetbrains-mono-latin-wght400-700.woff2 jetbrains-mono-ascii-wght400-700.woff2 "$ASCII,$PUNCT" "mark,ccmp,locl"
subset archivo-latin-wdth72-92-wght600-800.woff2 archivo-ascii-wdth72-92-wght600-800.woff2 "$ASCII,$PUNCT" "kern,mark,mkmk,ccmp,locl,tnum,rvrn"
