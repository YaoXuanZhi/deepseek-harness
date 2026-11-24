/**
 * Bundled Kimi Work skill names in deterministic catalog order.
 * @module @deepseek-ai/dsh-skill-kimi-work/names
 */

/** Bundled Kimi Work skill names in deterministic catalog order. */
export const KIMI_WORK_SKILL_NAMES = [
  'blueprint',
  'widget',
  'widgetdesign',
  'canvas',
  'automation',
  'binding',
  'deep-research',
] as const

/** Identifier of one bundled Kimi Work skill. */
export type KimiWorkSkillName = (typeof KIMI_WORK_SKILL_NAMES)[number]
