/**
 * Waveform utility functions for audio peak processing and caching
 */

// Global peak cache to avoid recomputation across re-renders
const peakCache = new Map<string, number[]>();

/**
 * Downsample audio peaks to target count using max absolute values
 * Captures both positive and negative amplitudes for punchier visuals
 */
function downsamplePeaks(peaks: Float32Array, targetCount: number): number[] {
  const blockSize = Math.floor(peaks.length / targetCount);
  const downsampled: number[] = [];

  for (let i = 0; i < targetCount; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, peaks.length);

    // Get max absolute value in this block for punch
    let maxAbs = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(peaks[j]);
      if (abs > maxAbs) maxAbs = abs;
    }

    downsampled.push(maxAbs);
  }

  return downsampled;
}

/**
 * Get cached peaks or compute and cache them
 * Prevents recomputation on component re-renders
 */
export function getCachedPeaks(
  src: string,
  peaks: Float32Array,
  targetCount: number
): number[] {
  const cacheKey = `${src}-${targetCount}`;

  if (!peakCache.has(cacheKey)) {
    peakCache.set(cacheKey, downsamplePeaks(peaks, targetCount));
  }

  return peakCache.get(cacheKey)!;
}

/**
 * Evict a specific cache entry
 * Call on unmount to prevent unbounded cache growth with many unique sources
 */
export function evictPeakCache(src: string, targetCount: number): void {
  const cacheKey = `${src}-${targetCount}`;
  peakCache.delete(cacheKey);
}

/**
 * Get current cache size (for debugging)
 */
export function getPeakCacheSize(): number {
  return peakCache.size;
}

/**
 * Clear all cached peaks
 */
export function clearPeakCache(): void {
  peakCache.clear();
}
