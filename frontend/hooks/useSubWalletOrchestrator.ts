/**
 * useSubWalletOrchestrator
 *
 * DEPRECATED: Subwallet orchestration disabled in MVP.
 * All uploads now use Blockberry HTTP API via edge routes.
 *
 * This file is kept for backward compatibility but the hook itself is no longer used.
 * getUploadStrategy is retained as a utility function.
 */

/**
 * Determine upload strategy - Blockberry HTTP API for all files
 */
export function getUploadStrategy(fileSizeBytes: number): 'blockberry' {
  return 'blockberry';
}
