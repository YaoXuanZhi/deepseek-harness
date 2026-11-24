# Kimi Perspective Token & Component Sheet

The Widget host injects these variables on `:root` (Light) and `:root[data-theme="dark"]` (Dark):

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--kp-bg` | `#FBFAF9` | `#181817` | Page / canvas ground |
| `--kp-surface` | `#FFFFFF` | `#1F1F1F` | Primary widget surface |
| `--kp-bg-subtle` | `#F5F5F5` | `#262625` | Secondary container, segmented track, table header |
| `--kp-surface-hover` | `#F3F3F2` | `#2E2E2D` | Interactive row or button hover |
| `--kp-ink` | `#181817` | `#E8E8E6` | Primary text, active tab, primary button fill |
| `--kp-ink-on-primary` | `#FFFFFF` | `#181817` | Foreground on `--kp-ink` primary button |
| `--kp-ink-secondary` | `#666664` | `#9E9E9C` | Supporting copy, table labels |
| `--kp-ink-tertiary` | `#8C8C8A` | `#787876` | Timestamps, axis ticks, units |
| `--kp-border` | `rgba(0,0,0,0.09)` | `rgba(255,255,255,0.10)` | Card & input hairline |
| `--kp-border-subtle` | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.06)` | Row divider |
| `--kp-blue` / `--kp-blue-soft` | `#1783FF` / `rgba(23,131,255,0.10)` | `#4994FF` / `rgba(73,148,255,0.16)` | Primary data series, active state |
| `--kp-green` / `--kp-green-soft` | `#16A34A` / `rgba(22,163,74,0.10)` | `#4ADE80` / `rgba(74,222,128,0.15)` | Positive delta, healthy status |
| `--kp-amber` / `--kp-amber-soft` | `#D97706` / `rgba(217,119,6,0.10)` | `#FBBF24` / `rgba(251,191,36,0.15)` | Warning threshold |
| `--kp-red` / `--kp-red-soft` | `#DC2626` / `rgba(220,38,38,0.10)` | `#F87171` / `rgba(248,113,113,0.15)` | Negative delta, alert |
| `--kp-purple` / `--kp-purple-soft` | `#7C3AED` / `rgba(124,58,237,0.10)` | `#A78BFA` / `rgba(167,139,250,0.15)` | Secondary series |

## Utility Classes Provided Out-of-the-Box

- `.kp-root`: Padded responsive container (`padding: 16px`, `color: var(--kp-ink)`).
- `.kp-card`: Inset surface block (`background: var(--kp-bg-subtle)`, `border-radius: 10px`, `padding: 12px 14px`).
- `.kp-badge` + `.kp-badge-blue` / `.kp-badge-green` / `.kp-badge-amber` / `.kp-badge-red`: Pill status badge.
- `.kp-btn` / `.kp-btn-primary`: Tactile warm-minimalist button (`font-weight: 500`, `border-radius: 8px`).
- `.kp-input` / `.kp-select`: Hairline form controls with theme-aware focus ring.
- `.kp-tabular`: `font-variant-numeric: tabular-nums` for aligned metrics and tables.
