/**
 * Coded errors raised by `@deepseek-ai/dsh-swarm-mode`.
 * @module @deepseek-ai/dsh-swarm-mode/error
 */

import { HarnessError } from '@deepseek-ai/dsh-error'

/** Machine-readable error codes emitted by Swarm mode. */
export type SwarmModeErrorCode =
  | 'SWARM_STATE_UNAVAILABLE'
  | 'SWARM_PROVIDER_UNAVAILABLE'
  | 'SWARM_DEPTH_EXCEEDED'

/** Coded error thrown when Swarm mode state or delegation backends reject an operation. */
export class SwarmModeError extends HarnessError {
  override readonly code: SwarmModeErrorCode

  constructor(message: string, code: SwarmModeErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
    this.name = 'SwarmModeError'
  }
}
