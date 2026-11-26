/**
 * Kimi Perspective Design System stylesheet and `window.DaimonWidget` /
 * `window.DaimonCanvas` sandboxed iframe bridge injected into every Widget HTML
 * document.
 *
 * Exposes both `--kp-*` and official Kimi Perspective `--kimi-*` tokens plus
 * `.kp-*` and `.kimi-*` reusable host classes so Widgets authored against either
 * Kimi Desktop or DeepSeek Harness render identically in light and dark modes.
 *
 * @module @deepseek-ai/dsh-blueprint/runtime-assets
 */

import { KIMI_WIDGET_ICONS } from './kimi-icons.ts'
import type { BlueprintWidgetRecord } from './types.ts'

/** Injected Kimi Perspective CSS variables and utility classes. */
export const KIMI_PERSPECTIVE_CSS = `
:root {
  color-scheme: light;
  --kp-bg: #FBFAF9;
  --kp-surface: #FFFFFF;
  --kp-bg-subtle: #F5F5F4;
  --kp-surface-hover: #F3F3F2;
  --kp-ink: #181817;
  --kp-ink-on-primary: #FFFFFF;
  --kp-ink-secondary: #666664;
  --kp-ink-tertiary: #8C8C8A;
  --kp-border: rgba(0, 0, 0, 0.09);
  --kp-border-subtle: rgba(0, 0, 0, 0.05);
  --kp-blue: #1783FF;
  --kp-blue-soft: rgba(23, 131, 255, 0.12);
  --kp-green: #16A34A;
  --kp-green-soft: rgba(22, 163, 74, 0.12);
  --kp-amber: #D97706;
  --kp-amber-soft: rgba(217, 119, 6, 0.12);
  --kp-red: #DC2626;
  --kp-red-soft: rgba(220, 38, 38, 0.12);
  --kp-purple: #7C3AED;
  --kp-purple-soft: rgba(124, 58, 237, 0.12);
  --kp-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

  /* Official Kimi Perspective runtime tokens */
  --kimi-color-text-primary: #181817;
  --kimi-color-text-secondary: #666664;
  --kimi-color-text-tertiary: #8C8C8A;
  --kimi-color-text-quaternary: #B5B4B1;
  --kimi-color-surface: #FFFFFF;
  --kimi-color-surface-muted: #F5F5F4;
  --kimi-color-surface-raised: #FFFFFF;
  --kimi-color-surface-strong: #ECEBE9;
  --kimi-color-border: rgba(0, 0, 0, 0.09);
  --kimi-color-danger: #DC2626;
  --kimi-color-positive: #16A34A;
  --kimi-color-warning: #D97706;
  --kimi-color-accent: #1783FF;
  --kimi-color-on-accent: #FFFFFF;
  --kimi-chart-1: #1783FF;
  --kimi-chart-2: #DC2626;
  --kimi-chart-3: #16A34A;
  --kimi-chart-4: #7C3AED;
  --kimi-chart-5: #8C8C8A;
  --kimi-font-sans: var(--kp-font);
  --kimi-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --kimi-font-serif: Georgia, "Songti SC", serif;
  --kimi-space-1: 4px;
  --kimi-space-2: 8px;
  --kimi-space-3: 12px;
  --kimi-space-4: 16px;
  --kimi-space-5: 20px;
  --kimi-space-6: 24px;
  --kimi-space-7: 32px;
  --kimi-radius-small: 4px;
  --kimi-radius-chip: 6px;
  --kimi-radius-button: 8px;
  --kimi-radius-input: 10px;
  --kimi-radius-panel: 12px;
  --kimi-radius-large: 16px;
  --kimi-radius-full: 999px;
  --t-micro: 60ms;
  --t-fast: 120ms;
  --t-normal: 200ms;
  --t-slow: 300ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);

  /* Compatibility aliases */
  --color-text-primary: var(--kimi-color-text-primary);
  --color-text-secondary: var(--kimi-color-text-secondary);
  --color-text-tertiary: var(--kimi-color-text-tertiary);
  --color-background-primary: var(--kimi-color-surface);
  --color-background-secondary: var(--kimi-color-surface-muted);
  --color-border-tertiary: var(--kimi-color-border);
}

:root[data-theme="dark"], :root.dark {
  color-scheme: dark;
  --kp-bg: #181817;
  --kp-surface: #1F1F1F;
  --kp-bg-subtle: #262625;
  --kp-surface-hover: #2E2E2D;
  --kp-ink: #E8E8E6;
  --kp-ink-on-primary: #181817;
  --kp-ink-secondary: #9E9E9C;
  --kp-ink-tertiary: #787876;
  --kp-border: rgba(255, 255, 255, 0.10);
  --kp-border-subtle: rgba(255, 255, 255, 0.06);
  --kp-blue: #4994FF;
  --kp-blue-soft: rgba(73, 148, 255, 0.16);
  --kp-green: #4ADE80;
  --kp-green-soft: rgba(74, 222, 128, 0.15);
  --kp-amber: #FBBF24;
  --kp-amber-soft: rgba(251, 191, 36, 0.15);
  --kp-red: #F87171;
  --kp-red-soft: rgba(248, 113, 113, 0.15);
  --kp-purple: #A78BFA;
  --kp-purple-soft: rgba(167, 139, 250, 0.15);

  --kimi-color-text-primary: #E8E8E6;
  --kimi-color-text-secondary: #9E9E9C;
  --kimi-color-text-tertiary: #787876;
  --kimi-color-text-quaternary: #575755;
  --kimi-color-surface: #1F1F1F;
  --kimi-color-surface-muted: #262625;
  --kimi-color-surface-raised: #292928;
  --kimi-color-surface-strong: #333331;
  --kimi-color-border: rgba(255, 255, 255, 0.10);
  --kimi-color-danger: #F87171;
  --kimi-color-positive: #4ADE80;
  --kimi-color-warning: #FBBF24;
  --kimi-color-accent: #4994FF;
  --kimi-color-on-accent: #181817;
  --kimi-chart-1: #4994FF;
  --kimi-chart-2: #F87171;
  --kimi-chart-3: #4ADE80;
  --kimi-chart-4: #A78BFA;
  --kimi-chart-5: #9E9E9C;
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  color: var(--kimi-color-text-primary);
  font-family: var(--kimi-font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
}

button, input, select, textarea {
  font: inherit;
}

svg text {
  font-family: var(--kimi-font-sans);
}

kimi-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  line-height: 0;
  vertical-align: middle;
  color: currentColor;
}

.kp-root {
  padding: var(--kimi-space-4);
  color: var(--kimi-color-text-primary);
}

.kp-card {
  background: var(--kimi-color-surface-muted);
  border: 0.5px solid var(--kp-border-subtle);
  border-radius: var(--kimi-radius-panel);
  padding: 12px 14px;
}

.kimi-panel {
  background: transparent;
  border: 0.5px solid var(--kimi-color-border);
  border-radius: var(--kimi-radius-panel);
  padding: var(--kimi-space-4);
}

.kimi-page-title { font-size: 20px; font-weight: 500; line-height: 1.3; margin: 0; color: var(--kimi-color-text-primary); }
.kimi-section-title { font-size: 17px; font-weight: 500; line-height: 1.35; margin: 0; color: var(--kimi-color-text-primary); }
.kimi-text-secondary { font-size: 14px; line-height: 20px; color: var(--kimi-color-text-secondary); }
.kimi-meta { font-size: 12px; line-height: 16px; color: var(--kimi-color-text-tertiary); }
.kp-tabular, .kimi-number { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
.kimi-code {
  font-family: var(--kimi-font-mono);
  font-size: 12px;
  line-height: 1.4;
  padding: 1px 5px;
  border-radius: var(--kimi-radius-small);
  background: var(--kimi-color-surface-muted);
  color: var(--kimi-color-text-primary);
}
.kimi-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--kimi-space-2); }
.kimi-stack { display: flex; flex-direction: column; gap: var(--kimi-space-3); }
.kimi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--kimi-space-3); }

.kimi-svg-text-primary { fill: var(--kimi-color-text-primary); }
.kimi-svg-text-secondary { fill: var(--kimi-color-text-secondary); }
.kimi-svg-grid { stroke: var(--kimi-color-text-quaternary); stroke-width: 0.75; fill: none; }
.kimi-svg-chart-1 { fill: var(--kimi-chart-1); }
.kimi-svg-chart-2 { fill: var(--kimi-chart-2); }
.kimi-svg-chart-3 { fill: var(--kimi-chart-3); }
.kimi-svg-chart-4 { fill: var(--kimi-chart-4); }
.kimi-svg-chart-5 { fill: var(--kimi-chart-5); }

.kp-badge, .kimi-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--kimi-radius-full);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  background: var(--kimi-color-surface-muted);
  color: var(--kimi-color-text-secondary);
}
.kp-badge-blue, .kimi-status--accent {
  background: color-mix(in srgb, var(--kimi-color-accent) 12%, transparent);
  color: var(--kimi-color-accent);
}
.kp-badge-green, .kimi-status--positive {
  background: color-mix(in srgb, var(--kimi-color-positive) 12%, transparent);
  color: var(--kimi-color-positive);
}
.kp-badge-amber, .kimi-status--warning {
  background: color-mix(in srgb, var(--kimi-color-warning) 14%, transparent);
  color: var(--kimi-color-warning);
}
.kp-badge-red, .kimi-status--danger {
  background: color-mix(in srgb, var(--kimi-color-danger) 12%, transparent);
  color: var(--kimi-color-danger);
}
.kp-badge-purple {
  background: var(--kp-purple-soft);
  color: var(--kp-purple);
}

.kp-btn, .kimi-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--kimi-radius-button);
  border: 0.5px solid var(--kimi-color-border);
  background: var(--kimi-color-surface);
  color: var(--kimi-color-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), opacity var(--t-fast) var(--ease-out);
}
.kp-btn:hover, .kimi-button:hover { background: var(--kp-surface-hover); }
.kimi-button:disabled, .kp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.kp-btn-primary, .kimi-button--primary {
  background: var(--kimi-color-text-primary);
  color: var(--kp-ink-on-primary);
  border-color: transparent;
}
.kp-btn-primary:hover, .kimi-button--primary:hover {
  background: var(--kimi-color-text-primary);
  opacity: 0.88;
}
.kimi-button--secondary {
  background: var(--kimi-color-surface-muted);
  color: var(--kimi-color-text-primary);
  border-color: var(--kimi-color-border);
}
.kimi-button--secondary:hover { background: var(--kimi-color-surface-strong); }
.kimi-button--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--kimi-color-text-secondary);
}
.kimi-button--ghost:hover {
  background: var(--kimi-color-surface-muted);
  color: var(--kimi-color-text-primary);
}
.kimi-button--danger {
  color: var(--kimi-color-danger);
  border-color: color-mix(in srgb, var(--kimi-color-danger) 28%, transparent);
  background: color-mix(in srgb, var(--kimi-color-danger) 8%, transparent);
}
.kimi-button--danger:hover {
  background: color-mix(in srgb, var(--kimi-color-danger) 14%, transparent);
}

.kimi-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: var(--kimi-radius-button);
  border: 0.5px solid transparent;
  background: transparent;
  color: var(--kimi-color-text-secondary);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}
.kimi-icon-button:hover {
  background: var(--kimi-color-surface-muted);
  color: var(--kimi-color-text-primary);
}

.kimi-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--kimi-radius-chip);
  border: 0.5px solid var(--kimi-color-border);
  background: transparent;
  color: var(--kimi-color-text-secondary);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}
.kimi-chip:hover {
  background: var(--kimi-color-surface-muted);
  color: var(--kimi-color-text-primary);
}
.kimi-chip[aria-pressed="true"], .kimi-chip[aria-selected="true"], .kimi-chip.is-selected {
  background: var(--kimi-color-text-primary);
  color: var(--kp-ink-on-primary);
  border-color: transparent;
  font-weight: 500;
}

.kimi-segmented {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--kimi-radius-button);
  background: var(--kimi-color-surface-muted);
}
.kimi-segmented .kimi-chip {
  height: 26px;
  border: none;
  border-radius: var(--kimi-radius-chip);
  background: transparent;
}
.kimi-segmented .kimi-chip[aria-pressed="true"],
.kimi-segmented .kimi-chip[aria-selected="true"],
.kimi-segmented .kimi-chip.is-selected {
  background: var(--kimi-color-surface-raised);
  color: var(--kimi-color-text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.kimi-row-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--kimi-space-1);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--t-fast) var(--ease-out);
}
*:hover > .kimi-row-actions,
*:focus-within > .kimi-row-actions {
  opacity: 1;
  visibility: visible;
}

.kimi-field { display: flex; flex-direction: column; gap: var(--kimi-space-1); }
.kimi-label { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--kimi-color-text-secondary); }
.kp-input, .kp-select, .kimi-input, .kimi-select, .kimi-textarea {
  height: 34px;
  padding: 0 10px;
  border-radius: var(--kimi-radius-input);
  border: 0.5px solid var(--kimi-color-border);
  background: var(--kimi-color-surface);
  color: var(--kimi-color-text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--t-fast) var(--ease-out);
}
.kimi-textarea { height: auto; min-height: 68px; padding: 8px 10px; line-height: 20px; }
.kp-input:focus, .kp-select:focus, .kimi-input:focus, .kimi-select:focus, .kimi-textarea:focus {
  border-color: var(--kimi-color-text-primary);
}
.kimi-range {
  accent-color: var(--kimi-color-text-primary);
  cursor: pointer;
}
.kimi-switch {
  appearance: none;
  -webkit-appearance: none;
  width: 34px;
  height: 20px;
  margin: 0;
  border-radius: var(--kimi-radius-full);
  background: var(--kimi-color-surface-strong);
  border: 0.5px solid var(--kimi-color-border);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--t-fast) var(--ease-out);
}
.kimi-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
  transition: transform var(--t-fast) var(--ease-out);
}
.kimi-switch:checked {
  background: var(--kimi-color-text-primary);
  border-color: var(--kimi-color-text-primary);
}
.kimi-switch:checked::after {
  transform: translateX(14px);
  background: var(--kp-ink-on-primary);
}

.kimi-table { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 20px; }
.kimi-table th, .kimi-table td {
  padding: 8px 10px;
  border-bottom: 0.5px solid var(--kimi-color-border);
  text-align: left;
  vertical-align: middle;
}
.kimi-table th {
  font-weight: 500;
  color: var(--kimi-color-text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.kimi-table th.kimi-number, .kimi-table td.kimi-number {
  text-align: right;
}
`.trim()

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
}

/**
 * Assemble a Widget's raw HTML into a standalone sandboxed document carrying
 * the Kimi Perspective stylesheet and `window.DaimonWidget` / `window.DaimonCanvas`
 * `postMessage` bridge.
 *
 * @param record - Stored widget metadata and latest slot/input state.
 * @param rawHtml - Author-written `index.html`.
 * @returns Complete HTML document ready for `<iframe sandbox="allow-scripts">`.
 */
export function assembleWidgetHtml(record: BlueprintWidgetRecord, rawHtml: string): string {
  const bootstrap = {
    widgetId: record.id,
    title: record.title,
    slots: record.latestData,
    savedInput: record.savedInput,
    status: record.status,
    statusMessage: record.statusMessage ?? null,
  }
  const bridgeScript = `
(function () {
  var KIMI_ICONS = ${escapeScriptJson(KIMI_WIDGET_ICONS)};
  if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined' && !customElements.get('kimi-icon')) {
    var KimiIconElement = function () {
      return Reflect.construct(HTMLElement, [], KimiIconElement);
    };
    KimiIconElement.prototype = Object.create(HTMLElement.prototype);
    KimiIconElement.prototype.constructor = KimiIconElement;
    KimiIconElement.observedAttributes = ['name', 'width', 'height'];
    KimiIconElement.prototype._render = function () {
      var w = this.getAttribute('width');
      var h = this.getAttribute('height');
      if (w) this.style.width = /^\\d+$/.test(w) ? w + 'px' : w;
      if (h) this.style.height = /^\\d+$/.test(h) ? h + 'px' : h;
      var iconName = this.getAttribute('name') || '';
      var body = iconName && Object.prototype.hasOwnProperty.call(KIMI_ICONS, iconName) ? KIMI_ICONS[iconName] : null;
      if (body) {
        this.removeAttribute('data-missing-icon');
        this.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:100%;height:100%;display:block">' + body + '</svg>';
      } else {
        this.innerHTML = '';
        if (iconName) this.setAttribute('data-missing-icon', iconName);
      }
    };
    KimiIconElement.prototype.connectedCallback = function () { this._render(); };
    KimiIconElement.prototype.attributeChangedCallback = function () { this._render(); };
    customElements.define('kimi-icon', KimiIconElement);
  }

  var state = ${escapeScriptJson(bootstrap)};
  var viewState = { main: {} };
  var viewStateListeners = [];
  var theme = (document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('dark')) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
  var locale = navigator.language || 'zh-CN';
  var slotListeners = Object.create(null);
  var dataListeners = [];
  var themeListeners = [];
  var localeListeners = [];
  var statusListeners = [];
  var fileCallSeq = 0;
  var pendingFiles = Object.create(null);

  function post(type, payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          channel: 'daimon-widget',
          widgetId: state.widgetId,
          type: type,
          payload: payload
        }, '*');
      }
    } catch (_err) {}
  }

  function updateSizeTier() {
    var w = window.innerWidth || 0;
    var h = window.innerHeight || 0;
    var tier = (w > 0 && (w < 300 || h < 220))
      ? 'compact'
      : (w >= 760 && h >= 500 ? 'expanded' : 'regular');
    if (document.documentElement) {
      document.documentElement.setAttribute('data-daimon-size-tier', tier);
    }
  }

  function measureNaturalHeight() {
    if (!document.body) {
      return document.documentElement ? document.documentElement.scrollHeight : 180;
    }
    var bodyRect = document.body.getBoundingClientRect();
    var maxBottom = bodyRect.height;
    var children = document.body.children;
    for (var i = 0; i < children.length; i++) {
      var r = children[i].getBoundingClientRect();
      var bottom = r.bottom - bodyRect.top;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    var padBottom = 0;
    if (typeof getComputedStyle === 'function') {
      padBottom = parseFloat(getComputedStyle(document.body).paddingBottom || '0') || 0;
    }
    var naturalH = Math.max(maxBottom + padBottom, document.body.offsetHeight || 0);
    var vh = window.innerHeight || 0;
    var bodyScroll = document.body.scrollHeight || 0;
    var docScroll = document.documentElement ? (document.documentElement.scrollHeight || 0) : 0;
    if (bodyScroll > vh + 2) naturalH = Math.max(naturalH, bodyScroll);
    if (docScroll > vh + 2) naturalH = Math.max(naturalH, docScroll);
    return Math.max(Math.ceil(naturalH), 140);
  }

  var lastReportedHeight = 0;
  function measureAndReport(explicitHeight) {
    updateSizeTier();
    var h = typeof explicitHeight === 'number' && explicitHeight > 0
      ? Math.ceil(explicitHeight)
      : measureNaturalHeight();
    if (Math.abs(h - lastReportedHeight) >= 2 || explicitHeight !== undefined) {
      lastReportedHeight = h;
      post('resize', { height: h });
    }
  }

  function readToken(name) {
    if (!name || !document.documentElement || typeof getComputedStyle !== 'function') return undefined;
    var prop = String(name).indexOf('--') === 0 ? String(name) : '--' + String(name);
    var val = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
    return val || undefined;
  }

  window.addEventListener('message', function (ev) {
    var msg = ev && ev.data;
    if (!msg || msg.channel !== 'daimon-widget-host') return;
    if (msg.widgetId && msg.widgetId !== state.widgetId) return;
    if (msg.type === 'files-result') {
      var fp = msg.payload || {};
      var pending = fp.requestId ? pendingFiles[fp.requestId] : null;
      if (pending) {
        delete pendingFiles[fp.requestId];
        if (fp.ok) {
          pending.resolve(fp.result);
        } else {
          var errObj = fp.error && typeof fp.error === 'object'
            ? { code: String(fp.error.code || 'host_error'), message: String(fp.error.message || 'File operation failed') }
            : { code: 'host_error', message: 'File operation failed' };
          pending.reject(errObj);
        }
      }
      return;
    }
    if (msg.type === 'init' || msg.type === 'sync') {
      var p = msg.payload || {};
      if (p.theme === 'dark' || p.theme === 'light') {
        var changed = p.theme !== theme;
        theme = p.theme;
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
        if (changed) {
          for (var i = 0; i < themeListeners.length; i++) {
            try { themeListeners[i](theme); } catch (_e) {}
          }
        }
      }
      if (typeof p.locale === 'string' && p.locale) {
        var localeChanged = p.locale !== locale;
        locale = p.locale;
        if (localeChanged) {
          for (var li = 0; li < localeListeners.length; li++) {
            try { localeListeners[li](locale); } catch (_el) {}
          }
        }
      }
      if (p.slots && typeof p.slots === 'object') {
        state.slots = p.slots;
        Object.keys(p.slots).forEach(function (slotName) {
          var list = slotListeners[slotName] || [];
          for (var j = 0; j < list.length; j++) {
            try { list[j](p.slots[slotName]); } catch (_e2) {}
          }
        });
        for (var di = 0; di < dataListeners.length; di++) {
          try { dataListeners[di](state.slots); } catch (_ed) {}
        }
      }
      if (p.savedInput && typeof p.savedInput === 'object') {
        state.savedInput = p.savedInput;
      }
      if (typeof p.status === 'string') {
        state.status = p.status;
        state.statusMessage = p.statusMessage || null;
        for (var k = 0; k < statusListeners.length; k++) {
          try { statusListeners[k]({ status: state.status, message: state.statusMessage }); } catch (_e3) {}
        }
      }
      requestAnimationFrame(function () { measureAndReport(); });
    }
  });

  var api = {
    widgetId: state.widgetId,
    title: state.title,
    get data() { return state.slots || {}; },
    get status() { return state.status || 'idle'; },
    get inputState() { return { currentInput: state.savedInput || {} }; },
    get theme() { return theme; },
    get locale() { return locale; },
    get tokens() {
      var names = [
        '--kimi-color-text-primary', '--kimi-color-text-secondary', '--kimi-color-text-tertiary',
        '--kimi-color-surface', '--kimi-color-surface-muted', '--kimi-color-border',
        '--kimi-color-accent', '--kimi-color-positive', '--kimi-color-warning', '--kimi-color-danger',
        '--kimi-chart-1', '--kimi-chart-2', '--kimi-chart-3', '--kimi-chart-4', '--kimi-chart-5'
      ];
      var out = {};
      for (var ti = 0; ti < names.length; ti++) {
        var v = readToken(names[ti]);
        if (v !== undefined) out[names[ti]] = v;
      }
      return out;
    },
    getToken: readToken,
    onDataChange: function (cb) {
      dataListeners.push(cb);
      try { cb(state.slots || {}); } catch (_ed0) {}
      return function () {
        dataListeners = dataListeners.filter(function (fn) { return fn !== cb; });
      };
    },
    onStatusChange: function (cb) {
      statusListeners.push(cb);
      return function () {
        statusListeners = statusListeners.filter(function (fn) { return fn !== cb; });
      };
    },
    onThemeChange: function (cb) {
      themeListeners.push(cb);
      return function () {
        themeListeners = themeListeners.filter(function (fn) { return fn !== cb; });
      };
    },
    onLocaleChange: function (cb) {
      localeListeners.push(cb);
      try { cb(locale); } catch (_el0) {}
      return function () {
        localeListeners = localeListeners.filter(function (fn) { return fn !== cb; });
      };
    },
    getSlot: function (name) {
      var key = name || 'main';
      return state.slots ? state.slots[key] : undefined;
    },
    onSlot: function (name, cb) {
      var key = name || 'main';
      if (!slotListeners[key]) slotListeners[key] = [];
      slotListeners[key].push(cb);
      if (state.slots && Object.prototype.hasOwnProperty.call(state.slots, key)) {
        try { cb(state.slots[key]); } catch (_e) {}
      }
      return function () {
        slotListeners[key] = (slotListeners[key] || []).filter(function (fn) { return fn !== cb; });
      };
    },
    getSavedInput: function () {
      return state.savedInput || {};
    },
    saveInput: function (patch) {
      if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
        state.savedInput = Object.assign({}, state.savedInput || {}, patch);
        post('saveInput', { input: state.savedInput });
      }
    },
    emit: function (eventName, payload) {
      post('emit', { event: String(eventName || 'submit'), data: payload === undefined ? null : payload });
    },
    getTheme: function () { return theme; },
    onTheme: function (cb) {
      themeListeners.push(cb);
      return function () {
        themeListeners = themeListeners.filter(function (fn) { return fn !== cb; });
      };
    },
    getLocale: function () { return locale; },
    getStatus: function () { return { status: state.status, message: state.statusMessage }; },
    onStatus: function (cb) {
      statusListeners.push(cb);
      return function () {
        statusListeners = statusListeners.filter(function (fn) { return fn !== cb; });
      };
    },
    expand: function () { post('expand', {}); },
    resize: function (height) { measureAndReport(height); }
  };

  function callFilesHost(method, args) {
    return new Promise(function (resolve, reject) {
      if (!window.parent || window.parent === window) {
        reject({ code: 'host_unavailable', message: 'DaimonWidget.files requires a Blueprint host frame' });
        return;
      }
      var reqId = 'df_' + (++fileCallSeq) + '_' + Date.now();
      pendingFiles[reqId] = { resolve: resolve, reject: reject };
      post('files-call', { requestId: reqId, method: method, args: args || {} });
    });
  }

  function bytesToBase64(bytes) {
    var binary = '';
    var chunkSize = 0x8000;
    for (var i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function normalizeWritePayload(data) {
    if (typeof data === 'string') {
      return Promise.resolve({ encoding: 'utf8', data: data });
    }
    if (data && typeof data === 'object') {
      if (data.encoding === 'utf8' && typeof data.text === 'string') {
        return Promise.resolve({ encoding: 'utf8', data: data.text });
      }
      if (data.encoding === 'base64' && typeof data.data === 'string') {
        return Promise.resolve({ encoding: 'base64', data: data.data });
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob && typeof data.arrayBuffer === 'function') {
        return data.arrayBuffer().then(function (ab) {
          return { encoding: 'base64', data: bytesToBase64(new Uint8Array(ab)) };
        });
      }
      if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
        return Promise.resolve({ encoding: 'base64', data: bytesToBase64(new Uint8Array(data)) });
      }
      if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data)) {
        var view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        return Promise.resolve({ encoding: 'base64', data: bytesToBase64(view) });
      }
    }
    return Promise.reject({ code: 'invalid_argument', message: 'Unsupported DaimonWidget.files.write payload' });
  }

  function normalizeTarget(target) {
    if (typeof target === 'string') {
      return { workspacePath: target };
    }
    if (target && typeof target === 'object') {
      if (target.kind === 'file' && typeof target.fileId === 'string') {
        return { fileId: target.fileId };
      }
      if (target.fileRef && target.fileRef.kind === 'file' && typeof target.fileRef.fileId === 'string') {
        return { fileId: target.fileRef.fileId };
      }
      if (typeof target.path === 'string') {
        return { workspacePath: target.path };
      }
    }
    return null;
  }

  var filesApi = {
    pick: function (options) {
      var opts = options && typeof options === 'object' ? options : {};
      var accept = Array.isArray(opts.accept) ? opts.accept.join(',') : (typeof opts.accept === 'string' ? opts.accept : '');
      return callFilesHost('pick', { accept: accept, multiple: Boolean(opts.multiple) });
    },
    readText: function (target, options) {
      var resolved = normalizeTarget(target);
      if (!resolved) return Promise.reject({ code: 'invalid_file_ref', message: 'Invalid file target' });
      var maxBytes = options && typeof options.maxBytes === 'number' ? options.maxBytes : undefined;
      return callFilesHost('readText', Object.assign({}, resolved, maxBytes !== undefined ? { maxBytes: maxBytes } : {}));
    },
    readBytes: function (target, options) {
      var resolved = normalizeTarget(target);
      if (!resolved) return Promise.reject({ code: 'invalid_file_ref', message: 'Invalid file target' });
      var maxBytes = options && typeof options.maxBytes === 'number' ? options.maxBytes : undefined;
      return callFilesHost('readBytes', Object.assign({}, resolved, maxBytes !== undefined ? { maxBytes: maxBytes } : {}));
    },
    write: function (input) {
      if (!input || typeof input !== 'object' || typeof input.name !== 'string' || !input.name.trim()) {
        return Promise.reject({ code: 'invalid_argument', message: 'files.write requires a non-empty name' });
      }
      return normalizeWritePayload(input.data).then(function (encoded) {
        return callFilesHost('write', {
          name: input.name,
          mimeType: typeof input.mimeType === 'string' ? input.mimeType : undefined,
          encoding: encoded.encoding,
          data: encoded.data
        });
      });
    },
    writeText: function (path, contents) {
      if (typeof path !== 'string' || typeof contents !== 'string') {
        return Promise.reject({ code: 'invalid_argument', message: 'files.writeText requires (path, contents) strings' });
      }
      return callFilesHost('writeText', { path: path, contents: contents });
    },
    url: function (target) {
      var resolved = normalizeTarget(target);
      if (!resolved) return Promise.reject({ code: 'invalid_file_ref', message: 'Invalid file target' });
      return callFilesHost('url', resolved);
    },
    download: function (fileRef, options) {
      if (!fileRef || fileRef.kind !== 'file' || typeof fileRef.fileId !== 'string') {
        return Promise.reject({ code: 'invalid_file_ref', message: 'files.download requires a FileResourceRef' });
      }
      var suggested = typeof options === 'string'
        ? options
        : (options && typeof options.suggestedFilename === 'string' ? options.suggestedFilename : undefined);
      return callFilesHost('download', {
        fileRef: fileRef,
        suggestedFilename: suggested
      });
    }
  };

  api.files = filesApi;
  window.DaimonWidget = api;
  window.DaimonCanvas = {
    files: filesApi,
    capabilities: { files: true },
    get viewState() { return viewState; },
    setViewState: function (patch) {
      if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
        viewState = { main: Object.assign({}, viewState.main || {}, patch) };
        for (var vi = 0; vi < viewStateListeners.length; vi++) {
          try { viewStateListeners[vi](viewState); } catch (_ev) {}
        }
      }
    },
    onViewStateChange: function (cb) {
      viewStateListeners.push(cb);
      try { cb(viewState); } catch (_ev0) {}
      return function () {
        viewStateListeners = viewStateListeners.filter(function (fn) { return fn !== cb; });
      };
    },
    expand: function () { post('expand', {}); },
    openDashboard: function (canvasId) {
      post('openCanvas', { canvasId: canvasId || null });
    }
  };

  var rafScheduled = false;
  function scheduleMeasure() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(function () {
      rafScheduled = false;
      measureAndReport();
    });
  }

  window.addEventListener('resize', scheduleMeasure);
  document.addEventListener('click', scheduleMeasure, true);
  document.addEventListener('toggle', scheduleMeasure, true);
  window.addEventListener('load', function () {
    post('ready', { widgetId: state.widgetId });
    measureAndReport();
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(function () { scheduleMeasure(); });
      if (document.body) ro.observe(document.body);
      if (document.documentElement) ro.observe(document.documentElement);
    }
  });
})();
`.trim()

  const injection = `<style data-kimi-perspective>${KIMI_PERSPECTIVE_CSS}</style><script data-daimon-widget>${bridgeScript}</script>`
  if (/<head[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<head([^>]*)>/i, `<head$1>${injection}`)
  }
  if (/<html[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<html([^>]*)>/i, `<html$1><head>${injection}</head>`)
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${injection}</head><body>${rawHtml}</body></html>`
}
