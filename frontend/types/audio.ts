/**
 * Type definitions for audio playback and waveform visualization
 */

export interface WaveformPeaks {
  peaks: number[];
  duration: number;
}

export interface UseWaveformOptions {
  src: string;
  sliceCount: number;
  autoplay?: boolean;
  preload?: boolean; // If true, call load() on mount
}

export interface UseWaveformResult {
  peaks: number[] | null; // null during loading
  isLoading: boolean;
  isPlaying: boolean;
  progress: number; // 0-100
  duration: number;
  currentTime: number;
  play: () => void;
  pause: () => void;
  playPause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  load: () => Promise<void>; // Prefetch audio + extract peaks
  destroy: () => void;
}
