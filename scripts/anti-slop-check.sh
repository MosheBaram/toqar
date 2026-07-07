#!/usr/bin/env bash
# Anti-slop gate: fake-data and placeholder patterns are forbidden in
# product code. A metric either computes from real data or does not exist.
#
# Exemptions: *.test.ts files, fixtures/, and lines carrying an explicit
# ANTI-SLOP-EXEMPT marker (for clearly-labelled seed scripts).
set -euo pipefail

violations=0

check() {
  local pattern="$1" label="$2"
  local hits
  hits=$(grep -rniE "$pattern" \
    --include='*.ts' --include='*.tsx' --include='*.js' \
    --exclude='*.test.ts' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=fixtures \
    packages skills 2>/dev/null | grep -v 'ANTI-SLOP-EXEMPT' || true)
  if [[ -n "$hits" ]]; then
    echo "FAIL: $label"
    echo "$hits"
    violations=1
  fi
}

check 'Math\.random\(' 'Math.random in product code'
check 'mock for now|TODO: real implementation|placeholder data|hardcoded for demo' 'placeholder/mock markers in product code'

if [[ "$violations" -ne 0 ]]; then
  echo 'Anti-slop check failed.'
  exit 1
fi
echo 'Anti-slop check passed.'
