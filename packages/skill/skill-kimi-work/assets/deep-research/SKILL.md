---
name: deep-research
description: Execute rigorous multi-angle research with source triangulation, quantitative verification, structured synthesis, and interactive visual presentation.
---

# Deep Research Workflow

Use this workflow for open-ended market, technical, competitive, or literature investigations requiring high-confidence synthesis rather than a single lookup.

## Four-Stage Execution

1. **Scope & Decompose**:
   - Restate the core decision question, evaluation dimensions, time horizon, and verification criteria.
   - Break the inquiry into 3–6 orthogonal sub-questions (primary specs/filings, independent benchmarks, counter-arguments, historical trajectory).
   - When Swarm Mode (`/swarm` / `agent_swarm`) is active and sub-questions are independent, fan out parallel `explore` subagents via `agent_swarm`; otherwise batch `web_search` / `web_fetch` / workspace search calls in parallel per turn.
2. **Primary-Source Triangulation**:
   - Prefer primary documentation, official releases, codebases, and peer-reviewed data over secondary summaries.
   - Cross-check contested numbers across at least two independent sources; record exact dates, units, and denominators.
3. **Critical Synthesis**:
   - Separate verified facts from inference; surface trade-offs, failure modes, and boundary conditions explicitly instead of flattening disagreements.
4. **Visual + Prose Delivery**:
   - Pair concise executive prose and comparison tables with an interactive `Widget` (comparison matrix, metric explorer, or scenario calculator) when quantitative trade-offs are central to the user's decision.
