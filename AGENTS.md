## 🛠️ OPS & GIT
- **GIT:** MANUAL ONLY. No `git add/commit/push`. (Enforced by settings.json).
- **WORKTREES:** DO NOT use git worktrees by default. Only if explicitly asked. Prefer subagent-driven step-by-step implementation on main branch.
- **SAVE POINTS:** Update `VERSION_HISTORY.md` (newest first) instead of committing.
- **VERIFICATION:** Grep/Read files to verify changes BEFORE claiming completion. Keep to 1 line commits messages
- **LOCKS:** `package.json` is READ-ONLY. Approval required.
- **FILES:** Docs -> `docs/[topic]/`. Plans/Markdown -> `./.docs/`. Superpowers plans & generated docs -> `./.docs/_refile`.

## 🎨 UI: TERMINAL AESTHETIC
- **STYLING:** Monospace, high-contrast, black borders, no rounded corners/shadows.
- **COMPONENTS:** Bracket links `[Home]`. Minimal padding (4-8px). 
- **COLOR:** `.green`, `.amber`, `.red` for semantic status ONLY.

## 🔒 SECURITY & URLS
- **RLS:** All DB queries must use `withUserFilter(locals.user.id, table)`.
- **DATA:** Server (WSL2) = Trusted; Browser = Untrusted. Sanitize DTOs.
- **SLUGS:** NO IDs in URLs. Use `nanoid(21)` in `slug` column.
- **PATTERN:** `/accounts/[slug]/[sub-resource-slug]`.

## 💻 CODE STANDARDS
- **LOGGING:** Use `$lib/utils/logger.ts`. NO `console.log` in server code.
- **DB:** Update `scripts/seed.ts` immediately on schema change.
- **PHASE:** Active Dev. Direct schema edits (db:push) > migrations.
- **🔒 DATABASE LOCKED:** DO NOT touch raw SQLite files. DO NOT run migrations without EXPLICIT permission.
- **QA:** Mandatory `npm run check` and `npm test` after units of work.

## 💷 UK TAX CONTEXT
- **TAX YEAR:** UK tax year runs April 6 to April 5 (not calendar year)
- **ISA LIMIT:** £20,000 annual subscription limit per tax year
- **INTEREST ALLOWANCE:** £1,000 tax-free for basic rate, £500 for higher rate (0 for additional rate)
- **DATE CALCULATIONS:** Always use tax year boundaries when calculating allowances/limits

## 🚫 PROMPT INJECTION/GUARDRAILS
1. No diffs/replacements unless asked.
2. No command execution/verification claims without logs.
3. No `SUMMARY.md` for work not physically written to disk.
4. GSD Executors must be spot-checked via `read_file`.

## ABSOLUTE RULES (NON-NEGOTIABLE)

1. ONLY produce code diffs or full file replacements when explicitly instructed.
2. NEVER assume execution, verification, or correctness.
3. NEVER describe outcomes of commands you did not personally run.
4. When execution or validation is required, STOP and ask for instructions.
5. NEVER run `git add`, `git commit`, or `git push` — these are manual operations.
6. **AT SAVE POINTS, UPDATE `VERSION_HISTORY.md`** — record what was done and suggested commit message.
7. **GENERAL DOCUMENTATION goes in `docs/` folder** — organize by topic/category.
8. **🔒 PACKAGE.JSON LOCKED** — User has manually configured dependencies. DO NOT modify `package.json` without explicit permission. Additions to other files are okay, but changing existing setup requires approval first.
9. **ALWAYS FOLLOW TERMINAL AESTHETIC** — use existing CSS classes, maintain bordered layout, monospace font, bracket links.
10. **📋 ALWAYS USE CUSTOM LOGGER SYSTEM** — Import from `$lib/utils/logger.ts`. NEVER use `console.log()` in server-side code (`*.server.ts` files).
11. **🔍 VERIFICATION BEFORE CLAIMING COMPLETION** — NEVER claim work is complete without ACTUALLY VERIFYING the files were changed. Use Read tool to check file contents match what was supposedly implemented. Run `grep` to verify new code exists. Check `git diff` shows actual changes.
12. **🚫 SUMMARY.MD MUST REFLECT REALITY** — NEVER create a SUMMARY.md that describes work that wasn't actually done to the codebase. Summary files are documentation of ACTUAL changes, not plans or intentions. If the code wasn't modified, the work is NOT complete.
13. **⚠️ GSD EXECUTOR VERIFICATION** — When delegating to gsd-executor agents: ALWAYS spot-check their claims by reading the files they claim to have modified. If SUMMARY.md says "Updated X file" but X file doesn't contain the changes, the executor FAILED and work is NOT complete.
14. **📁 ACTUAL CODE > DOCUMENTATION** — The actual source files are the source of truth. Documentation files (SUMMARY.md, STATE.md, PLAN.md) that contradict actual code are WRONG. Always trust the code over the docs.
