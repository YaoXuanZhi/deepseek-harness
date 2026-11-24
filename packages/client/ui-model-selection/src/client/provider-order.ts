/** Shared provider display order for the composer and command model pickers. */
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'

function providerRank(id: string): number {
  if (id === 'deepseek-account') return 0
  if (id === 'deepseek-official') return 1
  if (id === 'kimi-coding' || id === 'moonshotai-cn' || id === 'moonshotai') return 2
  return 3
}

/**
 * Put account, official DeepSeek, and Kimi/Moonshot providers first, preserving every other relative order.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  return groups.toSorted((left, right) => providerRank(left.id) - providerRank(right.id))
}

/**
 * Clamp a reasoning effort when switching models in place so unsupported effort
 * ids never reject the switch across heterogeneous providers.
 * @param currentEffort - Previously explicitly chosen reasoning effort, if any.
 * @param reasoning - Target model's advertised reasoning metadata.
 * @returns a valid effort id for the target model, or undefined when the model uses no effort or keeps its default.
 */
export function clampModelSwitchEffort(
  currentEffort: string | undefined,
  reasoning: ModelProviderGroup['models'][number]['reasoning'],
): string | undefined {
  if (reasoning === undefined) return undefined
  if (currentEffort !== undefined && reasoning.efforts.some(level => level.id === currentEffort)) {
    return currentEffort
  }
  if (reasoning.defaultEffort !== undefined) return reasoning.defaultEffort
  if (currentEffort === undefined) return undefined
  return reasoning.efforts.find(level => level.id === 'high')?.id ?? reasoning.efforts.at(-1)?.id
}
