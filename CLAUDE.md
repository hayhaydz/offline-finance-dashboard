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
- `.benchmarks/`, `beamng_cortex.egg-info`, `.serena/`, `.claude/`

This is enforced by `.claude/settings.json` which denies these git commands.

---

## 📝 VERSION HISTORY LOG

Instead of automated git operations, record work at **save points** to `VERSION_HISTORY.md`.

**When to write a log entry:**
- After completing a meaningful unit of work (feature, fix, refactor)
- At natural checkpoints (end of phase, after testing, before context switch)
- When you would have otherwise created a git commit

**Entry format:**

```markdown
## [YYYY-MM-DD HH:MM] — [Brief Description]

**Summary:** [1-2 sentences about what was done]

**Files changed:** [list key files modified/created]

**Suggested commit message:**
```
[type](scope): description

[detailed notes if needed]
```

---
```

**Log location:** `VERSION_HISTORY.md` (create if doesn't exist)

**Example entry:**

```markdown
## [2025-02-07 14:30] — Project initialization

**Summary:** Initialized GSD project with questioning, research, requirements, and roadmap. Created .gitignore and git-add-excluded.sh with proper exclusions for sensitive data.

**Files changed:**
- `.planning/PROJECT.md` (created)
- `.planning/config.json` (created)
- `.planning/REQUIREMENTS.md` (created)
- `.planning/ROADMAP.md` (created)
- `.planning/research/*` (created)
- `.gitignore` (created)
- `git-add-excluded.sh` (created, chmod +x)

**Suggested commit message:**
```
feat: initialize offline finance dashboard project

- GSD project setup with 6-phase roadmap
- Research complete: stack, features, architecture, pitfalls
- 48 v1 requirements defined across 10 categories
- .gitignore configured for sensitive data exclusions
- git-add-excluded.sh for safe manual staging
```

---
```

---

## ABSOLUTE RULES (NON-NEGOTIABLE)

1. ONLY produce code diffs or full file replacements when explicitly instructed.
2. NEVER run or suggest running tests, CLI commands, scripts, or builds.
3. NEVER assume execution, verification, or correctness.
4. NEVER describe outcomes of commands you did not personally run.
5. When execution or validation is required, STOP and ask for instructions.
6. NEVER run `git add`, `git commit`, or `git push` — these are manual operations.
7. **AT SAVE POINTS, UPDATE `VERSION_HISTORY.md`** — record what was done and suggested commit message.
