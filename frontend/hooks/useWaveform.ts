'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UseWaveformOptions, UseWaveformResult } from '@/types/audio';
import { getCachedPeaks, evictPeakCache } from '@/lib/waveform-utils';

/**
 * Hook for managing Wavesurfer.js instance with peak extraction and playback controls
 * Handles SSR-safe dynamic import, peak caching, and proper cleanup
 */
export function useWaveform(options: UseWaveformOptions): UseWaveformResult {
  const { src, sliceCount, autoplay = false, preload = false, fetchOptions } = options;

  // Wavesurfer instance state
  const [wavesurfer, setWavesurfer] = useState<any | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Refs for cleanup
  const containerRef = useRef<HTMLDivElement | null>(null);
  const objectURLRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  /**
   * Load audio and extract peaks
   * Can be called multiple times safely (idempotent)
   */
  const load = useCallback(async () => {
    if (isLoading || peaks || wavesurfer) return; // Already loading/loaded
    if (!src) return;

    setIsLoading(true);

    try {
      // Dynamic import to avoid SSR issues
      const WaveSurfer = (await import('wavesurfer.js')).default;

      // Create hidden container for headless operation
      if (!containerRef.current) {
        containerRef.current = document.createElement('div');
        containerRef.current.style.display = 'none';
        document.body.appendChild(containerRef.current);
      }

      // Create Wavesurfer instance
      const ws = WaveSurfer.create({
        container: containerRef.current,
        url: src,
        backend: 'WebAudio',
        autoplay: autoplay,
        height: 0, // No visual renderer
        barWidth: 0,
        ...(fetchOptions && { fetchParams: fetchOptions }),
      });

      // Extract peaks when ready
      ws.on('ready', () => {
        if (!mountedRef.current) return;

        try {
          // Get raw peaks from Wavesurfer
          const rawPeaks = ws.exportPeaks({ channels: 1, maxLength: 512 });

          if (rawPeaks && rawPeaks[0]) {
            // Downsample and cache peaks
            const peaksData = rawPeaks[0] instanceof Float32Array
              ? rawPeaks[0]
              : new Float32Array(rawPeaks[0]);
            const downsampled = getCachedPeaks(src, peaksData, sliceCount);
            setPeaks(downsampled);
          }

          setDuration(ws.getDuration());
          setIsLoading(false);
        } catch (error) {
          console.error('Failed to extract peaks:', error);
          setIsLoading(false);
        }
      });

      // Track playback state
      ws.on('play', () => {
        if (mountedRef.current) setIsPlaying(true);
      });

      ws.on('pause', () => {
        if (mountedRef.current) setIsPlaying(false);
      });

      ws.on('finish', () => {
        if (mountedRef.current) {
          setIsPlaying(false);
          setProgress(100);
        }
      });

      // Track playback progress
      ws.on('audioprocess', (time: number) => {
        if (!mountedRef.current) return;

        const dur = ws.getDuration();
        if (dur > 0) {
          setCurrentTime(time);
          setProgress((time / dur) * 100);
        }
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        console.error('Wavesurfer error:', error);
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });

      setWavesurfer(ws);
    } catch (error) {
      console.error('Failed to initialize Wavesurfer:', error);
      setIsLoading(false);
    }
  }, [src, sliceCount, autoplay, fetchOptions, isLoading, peaks, wavesurfer]);

  /**
   * Preload on mount if requested
   */
  useEffect(() => {
    if (preload) {
      load();
    }
  }, [preload, load]);

  /**
   * Playback control methods
   */
  const play = useCallback(() => {
    if (!wavesurfer) {
      // Auto-load on first play
      load();
      return;
    }
    wavesurfer.play();
  }, [wavesurfer, load]);

  const pause = useCallback(() => {
    wavesurfer?.pause();
  }, [wavesurfer]);

  const playPause = useCallback(() => {
    if (!wavesurfer) {
      load();
      return;
    }
    wavesurfer.playPause();
  }, [wavesurfer, load]);

  const seek = useCallback(
    (time: number) => {
      if (!wavesurfer) return;
      wavesurfer.setTime(time);
    },
    [wavesurfer]
  );

  const setVolume = useCallback(
    (volume: number) => {
      if (!wavesurfer) return;
      wavesurfer.setVolume(volume);
    },
    [wavesurfer]
  );

  const destroy = useCallback(() => {
    if (wavesurfer) {
      wavesurfer.destroy();
      setWavesurfer(null);
    }

    // Revoke object URL if created
    if (objectURLRef.current) {
      URL.revokeObjectURL(objectURLRef.current);
      objectURLRef.current = null;
    }

    // Remove hidden container
    if (containerRef.current && containerRef.current.parentNode) {
      containerRef.current.parentNode.removeChild(containerRef.current);
      containerRef.current = null;
    }

    // Evict cache entry to prevent unbounded growth
    evictPeakCache(src, sliceCount);

    // Reset state
    setPeaks(null);
    setIsLoading(false);
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
  }, [wavesurfer, src, sliceCount]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      destroy();
    };
  }, [destroy]);

  return {
    peaks,
    isLoading,
    isPlaying,
    progress,
    duration,
    currentTime,
    play,
    pause,
    playPause,
    seek,
    setVolume,
    load,
    destroy,
  };
}
