#!/usr/bin/env bash
# Fail the build if any of the forbidden offline patterns appear in source files.

set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Patterns that indicate external network dependencies
PATTERNS=(
  'fonts\.googleapis\.com'
  'fonts\.gstatic\.com'
  'googletagmanager\.com'
  'google-analytics\.com'
  'cloudflare\.com'
  'cloudfront\.net'
  'cdnjs\.cloudflare\.com'
  'jsdelivr\.net'
  'unpkg\.com'
  'use\.typekit\.net'
  'mixpanel\.com'
  'segment\.com'
  'hotjar\.com'
  'fullstory\.com'
  'amplitude\.com'
  'sentry-cdn\.com'
  'gtag\('
)

# Files to scan: source code, public assets, and built dist (if any)
DIRS=(
  'app/src'
  'app/index.html'
  'app/public'
  'api'
  'scripts'
  'loadtest'
)

EXCLUDE_DIRS=(
  'node_modules'
  '.git'
  'dist'
  'build'
  'playwright-report'
  'test-results'
  '.venv'
  'venv'
  '__pycache__'
)

# Compose a find that excludes the noisy directories
FIND_EXCLUDES=()
for d in "${EXCLUDE_DIRS[@]}"; do
  FIND_EXCLUDES+=( -path "*/$d" -prune -o )
done

VIOLATIONS=0
for pattern in "${PATTERNS[@]}"; do
  # Look in any of our relevant files. Use grep -E for portability.
  matches=$(find "${DIRS[@]}" "${FIND_EXCLUDES[@]}" -type f \( \
      -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
      -o -name '*.mjs' -o -name '*.cjs' -o -name '*.html' -o -name '*.css' \
      -o -name '*.json' -o -name '*.md' -o -name '*.py' -o -name '*.sh' -o -name '*.svg' \
    \) -print 2>/dev/null \
    | xargs -I{} grep -lE "$pattern" {} 2>/dev/null || true)

  if [ -n "$matches" ]; then
    echo "✗ Forbidden pattern '$pattern' found in:"
    echo "$matches" | sed 's/^/    /'
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

# Also scan app/dist if it exists (built artifacts)
if [ -d "app/dist" ]; then
  for pattern in "${PATTERNS[@]}"; do
    matches=$(grep -rE "$pattern" app/dist 2>/dev/null | cut -d: -f1 | sort -u || true)
    if [ -n "$matches" ]; then
      echo "✗ Forbidden pattern '$pattern' in built output (app/dist):"
      echo "$matches" | sed 's/^/    /'
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done
fi

if [ $VIOLATIONS -gt 0 ]; then
  echo ""
  echo "✗ $VIOLATIONS violation(s) found. Build cannot continue."
  exit 1
fi

echo "✓ No forbidden external network references detected."
