export type McpStoreErrorCode = 'invalid_input' | 'invalid_configuration';

/** Stable codes and safe messages; never retain input or credential values. */
export class McpStoreError extends Error {
  constructor(readonly code: McpStoreErrorCode, message: string) {
    super(message);
    this.name = 'McpStoreError';
  }
}
