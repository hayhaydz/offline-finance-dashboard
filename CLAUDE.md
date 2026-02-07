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

**Files:**
- [list key files modified/created]

**Commit:**
```
[type](scope): one-line description
```

**Context:** [Additional details for context]

---
```

**Log location:** `VERSION_HISTORY.md` (most recent entry at top)

---

## 📁 DOCUMENTATION ORGANIZATION

**General project documentation** (non-GSD, non-oh-my-claude-code) goes in `docs/`:

- Organize by topic/category with descriptive folder names
- Use markdown files (`.md`) for documentation
- Keep docs/ folder structure clean and logical

**Examples:**
```
docs/
  architecture/
    database-schema.md
    security-model.md
  design/
    ui-principles.md
    research-paper-aesthetic.md
  setup/
    installation.md
    configuration.md
```

**GSD and Claude-specific files** remain in `.planning/`:
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/phases/*/` - context, research, plans

---

## ABSOLUTE RULES (NON-NEGOTIABLE)

1. ONLY produce code diffs or full file replacements when explicitly instructed.
2. NEVER run or suggest running tests, CLI commands, scripts, or builds.
3. NEVER assume execution, verification, or correctness.
4. NEVER describe outcomes of commands you did not personally run.
5. When execution or validation is required, STOP and ask for instructions.
6. NEVER run `git add`, `git commit`, or `git push` — these are manual operations.
7. **AT SAVE POINTS, UPDATE `VERSION_HISTORY.md`** — record what was done and suggested commit message.
8. **GENERAL DOCUMENTATION goes in `docs/` folder** — organize by topic/category.
