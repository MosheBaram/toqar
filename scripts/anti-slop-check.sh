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

# Secret scan (tenancy-and-security D5): high-confidence credential
# patterns anywhere in the repo's source/config/docs. Fails the build.
secret_hits=$(grep -rnE 'AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-ant-[A-Za-z0-9-]{10,}|xox[bap]-[0-9A-Za-z-]{10,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY' \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
  --include='*.json' --include='*.yml' --include='*.yaml' --include='*.md' --include='*.sh' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude='anti-slop-check.sh' \
  packages apps skills infra docs scripts 2>/dev/null || true)
if [[ -n "$secret_hits" ]]; then
  echo 'FAIL: credential-shaped strings in the repo'
  echo "$secret_hits"
  violations=1
fi

if [[ "$violations" -ne 0 ]]; then
  echo 'Anti-slop check failed.'
  exit 1
fi
echo 'Anti-slop check passed.'
