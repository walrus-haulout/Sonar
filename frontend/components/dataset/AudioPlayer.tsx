'use client';

import { useState, useRef, useMemo } from 'react';
import { SonarButton } from '@/components/ui/SonarButton';
import type { Dataset } from '@/types/blockchain';
import { useWaveform } from '@/hooks/useWaveform';

interface AudioPlayerProps {
  dataset: Dataset;
}

/**
 * AudioPlayer Component
 * Displays waveform visualization and playback controls with real audio
 * Integrates Wavesurfer.js for accurate peak visualization and playback
 */
export function AudioPlayer({ dataset }: AudioPlayerProps) {
  const [volume, setVolume] = useState(1);
  const waveformRef = useRef<HTMLDivElement>(null);

  // Generate mock full audio URL
  // In production, this would use dataset.blob_id from Walrus after purchase validation
  const mockAudioUrl = `/audio/full-${dataset.id}.mp3`;

  // Initialize waveform hook for full audio playback
  const waveform = useWaveform({
    src: mockAudioUrl,
    sliceCount: 50, // Match current bar count
    autoplay: false,
    preload: true, // Preload on mount for detail page
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = waveform.progress;

  // Handle seeking by clicking on waveform
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || waveform.duration === 0) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickProgress = x / rect.width;
    const seekTime = clickProgress * waveform.duration;

    waveform.seek(seekTime);
  };

  // Handle volume change
  const handleVolumeClick = () => {
    const newVolume = volume > 0 ? 0 : 1;
    setVolume(newVolume);
    waveform.setVolume(newVolume);
  };

  return (
    <div className="space-y-4">
      {/* Waveform Visualization */}
      <div
        ref={waveformRef}
        onClick={handleWaveformClick}
        className="relative w-full h-32 bg-sonar-abyss/50 rounded-sonar overflow-hidden border border-sonar-signal/20 cursor-pointer hover:border-sonar-signal/40 transition-colors"
      >
        {/* Waveform bars - real peaks from audio */}
        <div className="flex items-center justify-center h-full gap-1 px-4">
          {waveform.peaks ? (
            // Render real peaks when available
            waveform.peaks.map((height, index) => {
              const isPassed = (index / waveform.peaks!.length) * 100 < progress;
              return (
                <div
                  key={index}
                  className={`flex-1 rounded-full transition-colors ${
                    isPassed ? 'bg-sonar-signal' : 'bg-sonar-highlight/30'
                  }`}
                  style={{
                    height: `${height * 100}%`,
                    maxWidth: '4px',
                  }}
                />
              );
            })
          ) : (
            // Loading placeholder - show empty bars
            Array.from({ length: 50 }).map((_, index) => (
              <div
                key={index}
                className="flex-1 rounded-full bg-sonar-highlight/20 animate-pulse"
                style={{
                  height: '40%',
                  maxWidth: '4px',
                }}
              />
            ))
          )}
        </div>

        {/* Play progress overlay */}
        <div
          className="absolute top-0 left-0 h-full bg-sonar-signal/10 pointer-events-none transition-all"
          style={{ width: `${progress}%` }}
        />

        {/* Loading state */}
        {waveform.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-sonar-abyss/70">
            <p className="text-sm text-sonar-highlight-bright/50 font-mono">
              Loading audio...
            </p>
          </div>
        )}

        {/* Placeholder text when not playing and no progress */}
        {!waveform.isPlaying && waveform.currentTime === 0 && !waveform.isLoading && waveform.peaks && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-sonar-highlight-bright/30 font-mono">
              Click waveform to seek
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center space-x-4">
        {/* Play/Pause Button */}
        <SonarButton
          variant="primary"
          onClick={waveform.playPause}
          disabled={waveform.isLoading}
          className="w-12 h-12 rounded-full flex items-center justify-center"
        >
          {waveform.isPlaying ? (
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </SonarButton>

        {/* Timeline */}
        <div className="flex-1">
          {/* Progress Bar */}
          <div
            className="relative w-full h-2 bg-sonar-abyss/50 rounded-full overflow-hidden mb-2 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const clickProgress = x / rect.width;
              const seekTime = clickProgress * waveform.duration;
              waveform.seek(seekTime);
            }}
          >
            <div
              className="h-full bg-sonar-signal transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Time Display */}
          <div className="flex justify-between text-xs font-mono text-sonar-highlight-bright/60">
            <span>{formatTime(waveform.currentTime)}</span>
            <span>{formatTime(waveform.duration || dataset.duration_seconds)}</span>
          </div>
        </div>

        {/* Volume Control */}
        <button
          onClick={handleVolumeClick}
          className="flex items-center space-x-2 text-sonar-highlight-bright/60 hover:text-sonar-signal transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            {volume > 0 ? (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            ) : (
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            )}
          </svg>
        </button>
      </div>

      {/* Format Info */}
      <div className="text-xs text-sonar-highlight-bright/50 font-mono">
        Available formats: {dataset.formats.join(', ')} • Sample rate: 44.1kHz • Bit depth: 16-bit
      </div>

      {/* Note about preview */}
      <div className="p-3 bg-sonar-highlight/5 rounded-sonar border border-sonar-highlight/20">
        <p className="text-xs text-sonar-highlight-bright/70">
          <span className="font-mono text-sonar-highlight">ⓘ Preview Mode:</span> Full audio
          access requires dataset purchase. Encrypted audio is stored on Walrus and decrypted
          with Mysten Seal upon purchase.
        </p>
      </div>
    </div>
  );
}
