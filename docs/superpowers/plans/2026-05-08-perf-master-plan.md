# MomAI Performance Optimization — Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.
>
> This is a **master orchestration plan** linking 3 independent sub-plans. Each sub-plan targets a different subsystem and can be executed in parallel.

**Goal:** Eliminate all 75 identified performance issues (27 High, 33 Medium, 15 Low) across MomAI's 3 subsystems to make the assistant extremely responsive.

**Architecture:** The issues are naturally isolated by subsystem boundary — Python Core (FastAPI/LangGraph), Electron Frontend (React/TypeScript), and Node-Core (Node.js scripts). Each has independent deploy units and can be worked in parallel.

**Phases per subsystem:**
- **Phase 1 (P1):** Critical responsiveness — fixes that directly impact perceived latency
- **Phase 2 (P2):** Stability & memory — fixes that prevent degradation over time
- **Phase 3 (P3):** Hardening — error handling, minor optimizations, code quality

---

## Sub-Plans (Independent, Parallel)

| # | Plan | Subsystem | Files | Issues | Est. Effort |
|---|------|-----------|-------|--------|-------------|
| 1 | `2026-05-08-perf-python-core.md` | `apps/core/` | ~20 Python files | 8H + 9M + 8L | Large |
| 2 | `2026-05-08-perf-frontend.md` | `apps/momai/src/` | ~30 TSX/TS files | 7H + 6M + 7L | Large |
| 3 | `2026-05-08-perf-node-core.md` | `apps/momai/scripts/` | ~25 JS files | 12H + 18M + 7L | X-Large |

### Execution Order Within Each Sub-Plan

Each sub-plan is organized as P1 → P2 → P3 strictly sequential within itself (P2 depends on P1 being stable, P3 is polish).

### Cross-Cutting Concerns

- **Testing:** Run `pnpm test` after each phase.
- **Lint:** Run `pnpm lint` after each phase.
- **Typecheck:** Run `pnpm typecheck` after each phase.
- **Commit:** Conventional commits, one commit per phase per sub-plan.

---

## Resource Strategy

Given the volume (~75 issues), use subagent-driven-development to dispatch independent sub-plans in parallel:

1. **Subagent A** — Python Core plan (P1 → P2 → P3)
2. **Subagent B** — Frontend plan (P1 → P2 → P3)
3. **Subagent C** — Node-Core plan (P1 → P2 → P3)

After all 3 complete, do a final integration verification pass.
