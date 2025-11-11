/**
 * Edge API Client
 * Provides URLs for edge functions (Walrus upload, preview proxy)
 */

/**
 * Get preview audio URL (edge proxy to Walrus)
 * NOTE: This is a placeholder. In production, this would query on-chain metadata
 * to get preview_blob_id, then return edge proxy URL
 */
export function getPreviewUrl(datasetId: string): string {
  // TODO: Query on-chain metadata for preview_blob_id
  // For now, return placeholder - components should use dataset.previewUrl if available
  return `/api/edge/walrus/preview?blobId=${datasetId}`;
}

/**
 * Legacy stream URL (deprecated - use browser decryption instead)
 * @deprecated Use browser-side decryption with Seal instead
 */
export function getStreamUrl(datasetId: string, _token: string): string {
  console.warn('[API Client] getStreamUrl is deprecated. Use browser-side decryption instead.');
  return `/api/edge/walrus/preview?blobId=${datasetId}`;
}
