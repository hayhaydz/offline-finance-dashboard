#!/usr/bin/env bash
# git-add-excluded.sh - Safe git add with exclusions
# Use this script instead of 'git add' to stage files
# Excludes things that shouldn't be committed but keeps them visible to Claude

EXCLUDE_PATTERNS=(
    # ============================================
    # CRITICAL - Already in .gitignore, but double-safe
    # ============================================
    '*.db'
    '*.sqlite'
    '*.sqlite3'
    '*.db-shm'
    '*.db-wal'
    '*.db-journal'
    '*.bak'
    '*.backup'
    '*.sql.gz'
    '*.key'
    '*.pem'
    '*.p12'
    '*.pfx'
    'statements'
    'uploads'
    'storage'
    'secrets'
    '.secrets'
    '.env'
    '.env.*'
    './node_modules/'

    # ============================================
    # Build artifacts (Claude can see, don't commit)
    # ============================================
    '.svelte-kit'
    'build'
    'dist'
    '.vercel'
    '.netlify'

    # ============================================
    # Tooling & Cache (Claude can see, don't commit)
    # ============================================
    'npm-debug.log*'
    'yarn-debug.log*'
    'yarn-error.log*'
    'pnpm-debug.log*'
    'coverage'
    '.nyc_output'
    '*.test.ts.snap'
    'logs/'
    '*.log'

    # ============================================
    # IDE settings (Claude can see, don't commit)
    # ============================================
    '.vscode'
    '.idea'
    '*.swp'
    '*.swo'
    '*~'
    '.DS_Store'
)

# Build the exclusions once
exclusions=()
for pat in "${EXCLUDE_PATTERNS[@]}"; do
    exclusions+=(":(exclude)$pat")
done

# Add the whole tree minus the exclusions
git add "${exclusions[@]}" .

count=$(git diff --cached --name-only | wc -l)
echo "Total files staged: $count"
