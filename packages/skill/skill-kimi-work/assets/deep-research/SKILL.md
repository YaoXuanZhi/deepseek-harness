---
name: deep-research
description: Execute rigorous multi-dimensional deep research and report engineering with iterative primary-source triangulation, quantitative verification, centralized comparison tables, and Kimi Perspective visual widgets.
---

# Deep Research & Report Engineering (`deep-research`)

Use this workflow for open-ended technical, architectural, market, competitive, or literature investigations requiring exhaustive evidence and structured synthesis rather than a single lookup.

## 1. Discovery & Triangulation Loop

1. **Inspect Context & Clarify Ambiguity**: Read attached/referenced workspace files first. Use `ask_user_question` only if user-owned scope or goal ambiguity would materially change the research direction.
2. **Multi-Angle Iterative Search**: Decompose the inquiry into orthogonal dimensions (primary specs/code/filings, quantitative benchmarks, failure modes & counter-arguments, historical/version trajectory). Batch independent `web_search`, `web_fetch`, `glob`, `grep`, and `read` calls in parallel each turn; avoid redundant queries and ensure each round closes a concrete evidence gap.
   - When `/swarm` is active, fan out independent dimensions in parallel via `agent_swarm` and synthesize all subagent findings into one unified voice.
3. **Primary-Source Authority & Quantitative Verification**:
   - Prefer primary codebases, official documentation, standards, filings, and peer-reviewed benchmarks over secondary summaries.
   - Cross-check contested numbers across at least two independent sources; record exact dates, units, versions, and denominators. Use Python or shell commands when exact counts or statistical calculations are required — **never guess or fabricate metrics**.

## 2. Content Orchestration & Editorial Standards

1. **Executive Opening**: Open with the direct verdict or core architectural thesis up front when answerable in 2–4 crisp sentences; omit generic textbook introductions.
2. **Centralized Comparison Tables**:
   - Use Markdown tables as the primary structural backbone to consolidate recurring entities, layers, options, or risk items instead of repetitive bullet lists.
   - Keep citations inline inside data cells or at sentence ends rather than adding a detached "Source" column or a fabricated bibliography section.
3. **Fact vs. Inference Separation**: Explicitly distinguish verified observations (backed by exact file/line or primary URL citations) from architectural inferences or runtime hypotheses that still require live verification.
4. **Visual + Prose Pairing**:
   - When quantitative trade-offs, multi-layer architecture metrics, or scenario comparisons are central to the answer, load `widgetdesign` and `widget` to deliver a polished interactive `Widget` as the primary visual anchor, keeping surrounding prose focused on synthesis, root-cause risks, and recommendations without repeating the widget's table/chart values.
5. **Pre-Delivery Audit**: Before finalizing, verify that every figure, file count, path, citation, and table cell is internally consistent and directly supported by observed tool outputs.
