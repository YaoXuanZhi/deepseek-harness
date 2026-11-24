---
name: widgetdesign
description: Apply the Kimi Perspective Design System (--kp-* warm paper & ink tokens, L1-L4 typography hierarchy, semantic accents, and responsive card geometry) to every Widget and Canvas layout.
---

# Kimi Perspective Design System (`widgetdesign`)

Every Widget MUST feel native to Kimi Work's warm minimalist aesthetic in both Light (`#FBFAF9` ground / `#FFFFFF` card) and Dark (`#181817` ground / `#1F1F1F` card) modes. Never use cold neon gradients, pure `#000` shadows, heavy `2px` borders, or arbitrary rainbow palettes.

## Core Rules

1. **Always consume `--kp-*` CSS tokens** (automatically injected into every Widget iframe; see `references/design-system.md` for the full token sheet):
   - Surfaces: `var(--kp-surface)` (primary card), `var(--kp-bg-subtle)` (inset wells/pills), `var(--kp-surface-hover)` (interactive hover).
   - Ink hierarchy: `var(--kp-ink)` (L1 hero metrics & headings), `var(--kp-ink-secondary)` (L2 body & labels), `var(--kp-ink-tertiary)` (L3 captions & axes).
   - Hairlines: `0.5px solid var(--kp-border)` or `1px solid var(--kp-border-subtle)` — never thick borders.
   - Semantic accents (used sparingly for data meaning, <= 15% area): `var(--kp-blue)`, `var(--kp-green)`, `var(--kp-amber)`, `var(--kp-red)`, `var(--kp-purple)` + matching `*-soft` badge fills.
2. **Four-Level Typography Hierarchy**:
   - **L1 Hero Metric**: `28px–34px`, `font-weight: 600`, `font-variant-numeric: tabular-nums`, `letter-spacing: -0.02em`.
   - **L2 Section Title**: `15px`, `font-weight: 500`, `color: var(--kp-ink)`.
   - **L3 Body / Data Row**: `13px`, `font-weight: 400`, `line-height: 1.55`.
   - **L4 Micro Caption / Axis**: `11px`, `font-weight: 400`, `color: var(--kp-ink-tertiary)`.
3. **Geometry & Responsiveness**:
   - Outer padding `16px–20px`; internal section gap `12px–16px`; card radius `12px`, control/pill radius `8px`.
   - Use `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))` so cards adapt seamlessly from a 5-column Canvas tile (`~400px`) to full chat width (`~720px`).
   - Inline widgets target `220px–560px` natural height (host caps inline frames at `720px` with internal scroll).
