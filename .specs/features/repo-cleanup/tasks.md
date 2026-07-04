# Repo Cleanup Tasks

## Execution Protocol

Implement these tasks with the `tlc-spec-driven` skill.

---

**Spec**: `.specs/features/repo-cleanup/spec.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase — no project-wide testing guidelines found beyond AGENTS.md (lint/typecheck/test commands). This is a repo-maintenance task — no feature code is added. "Tests" here are verification commands, not unit/integration/e2e tests.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| .gitignore | none | — (build gate only) | — | — |
| Repo tracking | none | Verify via `git ls-files` | — | `git ls-files [path]` |

## Parallelism Assessment

> All tasks touch git tracking state — must be sequential. No parallel execution.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Verify | No | Sequential git operations on same index | All tasks modify `.gitignore` and/or git index |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After each task | Verify files removed: `git ls-files [specific paths]` |
| Build | End of each phase | `git status --short` (confirm clean state, expected files only) |

---

## Execution Plan

### Phase 1: Clean Small Files (Sequential)

```
T1 → T2 → T3
```

### Phase 2: Remove Binary Bloat + Build Artifacts (Sequential)

```
T3 done → T4 → T5 → T6
```

### Phase 3: Final Verification + PR (Sequential)

```
T6 done → T7
```

---

## Task Breakdown

### T1: Untrack .vscode/settings.json and null

**What**: Remove `.vscode/settings.json` and `null` from git tracking — both match `.gitignore` patterns but were added before the rules existed.

**Where**: `.vscode/settings.json`, `null`, `.gitignore` (verify no new entry needed — `.vscode/` already present)

**Depends on**: None
**Requirement**: CLN-04, CLN-05

**Done when**:
- [ ] `git ls-files .vscode/settings.json` returns empty
- [ ] `git ls-files null` returns empty
- [ ] `.gitignore` already covers `.vscode/` (no change needed)
- [ ] `git status --short` shows only expected changes

**Tests**: none (verify via git commands)
**Gate**: quick

**Commit**: `chore(repo): untrack .vscode/settings.json and null file`

---

### T2: Remove temp/accidental files from tracking

**What**: Remove `tmp_llama_help.txt`, `temp_comment.json`, and `test.txt` from tracking — all are accidental/temporary files at repo root.

**Where**: `tmp_llama_help.txt`, `temp_comment.json`, `test.txt`

**Depends on**: T1
**Requirement**: CLN-06

**Done when**:
- [ ] `git ls-files tmp_llama_help.txt` returns empty
- [ ] `git ls-files temp_comment.json` returns empty
- [ ] `git ls-files test.txt` returns empty
- [ ] `git status --short` shows only expected changes

**Tests**: none (verify via git commands)
**Gate**: quick

**Commit**: `chore(repo): remove temp files from tracking`

---

### T3: Untrack .opencode/package-lock.json

**What**: Remove `.opencode/package-lock.json` from tracking — lockfile for opencode agent config, not the project.

**Where**: `.opencode/package-lock.json`

**Depends on**: T2
**Requirement**: CLN-07

**Done when**:
- [ ] `git ls-files .opencode/package-lock.json` returns empty
- [ ] `git status --short` shows only expected changes

**Tests**: none (verify via git commands)
**Gate**: quick

**Commit**: `chore(repo): untrack opencode agent lockfile`

---

### T4: Untrack and gitignore llama binaries

**What**: Remove all llama.cpp binary blobs from tracking and add `apps/momai/bin/llama/` to `.gitignore`.

**Where**: `apps/momai/bin/llama/{cpu,vulkan}/*` (103 files, ~147 MB), `.gitignore`

**Depends on**: T3
**Requirement**: CLN-01, CLN-03

**Done when**:
- [ ] `git ls-files apps/momai/bin/llama/` returns empty
- [ ] `.gitignore` contains entry for `apps/momai/bin/llama/`
- [ ] `git status --short` shows only expected changes

**Tests**: none (verify via git commands)
**Gate**: quick

**Commit**: `chore(repo): untrack llama.cpp binaries and add to gitignore`

---

### T5: Untrack and gitignore uv binaries

**What**: Remove uv binaries from tracking and add `apps/momai/bin/uv*` entries to `.gitignore`.

**Where**: `apps/momai/bin/uv`, `apps/momai/bin/uv.exe`, `apps/momai/bin/uvw.exe`, `apps/momai/bin/uvx.exe`, `.gitignore`

**Depends on**: T4
**Requirement**: CLN-02, CLN-03

**Done when**:
- [ ] `git ls-files apps/momai/bin/uv apps/momai/bin/uv.exe apps/momai/bin/uvw.exe apps/momai/bin/uvx.exe` returns empty
- [ ] `.gitignore` contains entry for `apps/momai/bin/uv*`
- [ ] `git status --short` shows only expected changes

**Tests**: none (verify via git commands)
**Gate**: quick

**Commit**: `chore(repo): untrack uv binaries and add to gitignore`

---

### T6: Untrack and gitignore assets/ build artifacts

**What**: Remove `assets/` directory at repo root from tracking — contains production build output (`index-*.js`, `.js.map`, `.css`) with content-hash filenames that should never be in source control.

**Where**: `assets/index-DDgUZKhJ.js`, `assets/index-DDgUZKhJ.js.map`, `assets/index-DakjqAXu.css`, `.gitignore`

**Depends on**: T5
**Requirement**: CLN-09

**Done when**:
- [ ] `git ls-files assets/` returns empty
- [ ] `.gitignore` contains entry for `/assets/`
- [ ] `git status --short` shows only expected changes

**Tests**: none (verify via git commands)
**Gate**: quick

**Commit**: `chore(repo): untrack build artifacts in assets/ and add to gitignore`

---

### T7: Full verification + PR preparation

**What**: Run final verifications, create PR branch, and prepare PR description with all findings and flags for maintainer.

**Where**: Branch creation, PR description

**Depends on**: T6
**Requirement**: CLN-08 (PR notes about flagged items)

**Done when**:
- [ ] All `git ls-files` verification passes for every removed category
- [ ] `.gitignore` has all new entries
- [ ] Local working tree is clean (`git status --short` shows nothing unexpected)
- [ ] PR description written with:
  - Changes made (what was removed from tracking)
  - `.gitignore` additions
  - ⚠️ Flags for maintainer: `momai_certificado.pfx`, `test-chat-tts.cjs`, duplicate `icon.gif`, store icon naming conflict
  - Recommendation for store icon: keep English-named `ms-store-icon.png`

**Tests**: build (full verification)
**Gate**: build

**Commit**: (no commit — this is branch + PR preparation)

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Untrack .vscode/settings.json + null | 2 files, same category | ✅ Granular |
| T2: Remove temp files | 3 files, same category | ✅ Granular |
| T3: Untrack .opencode/package-lock.json | 1 file | ✅ Granular |
| T4: Untrack llama binaries | 1 directory, 1 .gitignore entry | ✅ Granular |
| T5: Untrack uv binaries | 4 files (same binary), 1 .gitignore entry | ✅ Granular |
| T6: Untrack assets/ build artifacts | 3 files, 1 .gitignore entry | ✅ Granular |
| T7: Final verification + PR | 0 files changed (branch/PR only) | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | T1 → T2 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | .gitignore (verify), repo tracking | none | none | ✅ OK |
| T2 | repo tracking | none | none | ✅ OK |
| T3 | repo tracking | none | none | ✅ OK |
| T4 | .gitignore (add entry), repo tracking | none | none | ✅ OK |
| T5 | .gitignore (add entry), repo tracking | none | none | ✅ OK |
| T6 | .gitignore (add entry), repo tracking | none | none | ✅ OK |
| T7 | — | none | none | ✅ OK |
