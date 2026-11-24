/**
 * Coded errors raised by `@deepseek-ai/dsh-blueprint`.
 * @module @deepseek-ai/dsh-blueprint/error
 */

import { HarnessError } from '@deepseek-ai/dsh-error'

/** Closed union of Blueprint domain error codes. */
export type BlueprintErrorCode =
  | 'BLUEPRINT_NOT_FOUND'
  | 'BLUEPRINT_INVALID_ID'
  | 'BLUEPRINT_INVALID_LAYOUT'
  | 'BLUEPRINT_INVALID_PATH'
  | 'BLUEPRINT_VALIDATION_FAILED'
  | 'BLUEPRINT_AUTOMATION_FAILED'

/** Coded error raised by Blueprint CRUD, layout, schema-binding, or execution operations. */
export class BlueprintError extends HarnessError {
  override readonly code: BlueprintErrorCode

  constructor(message: string, code: BlueprintErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
    this.name = 'BlueprintError'
  }
}
