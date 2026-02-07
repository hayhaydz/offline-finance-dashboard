## 🚫 GIT OPERATIONS (MANUAL ONLY)

**CRITICAL:** Git operations (`git add`, `git commit`, `git push`) are **HANDLED MANUALLY** by the developer.

- **DO NOT** run `git add`, `git commit`, or `git push` commands
- **DO NOT** suggest running these commands
- **DO NOT** create commits or push changes
- The developer uses a custom `git-add-excluded.sh` script to stage files with proper exclusions
- History has been cleaned with `git-filter-repo` to remove excluded paths

**Excluded from git:**
- `logs/`, `.env*`, `venv/`, `storage/`, `storage-dev/`, `test-storage/`
- `.ruff_cache/`, `.pytest_cache/`, `__pycache__/`, `*.pyc`
- `.benchmarks/`, `beamng_cortex.egg-info/`, `.serena/`, `.claude/`

This is enforced by `.claude/settings.json` which denies these git commands.

## ABSOLUTE RULES (NON-NEGOTIABLE)

1. ONLY produce code diffs or full file replacements when explicitly instructed.
2. NEVER run or suggest running tests, CLI commands, scripts, or builds.
3. NEVER assume execution, verification, or correctness.
4. NEVER describe outcomes of commands you did not personally run.
5. When execution or validation is required, STOP and ask for instructions.
6. NEVER run `git add`, `git commit`, or `git push` - these are manual operations.