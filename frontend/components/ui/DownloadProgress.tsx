'use client';

/**
 * Download Progress Component
 * Displays download progress with speed and ETA
 */

import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface DownloadProgressProps {
  /**
   * Progress percentage (0-100)
   */
  progress: number;

  /**
   * Total bytes to download
   */
  totalBytes: number;

  /**
   * Bytes downloaded so far
   */
  bytesDownloaded: number;

  /**
   * Download speed in MB/s
   */
  speedMBps?: number;

  /**
   * Estimated time remaining in seconds
   */
  timeRemainingSec?: number;

  /**
   * Optional callback for cancel button
   */
  onCancel?: () => void;

  /**
   * Optional filename being downloaded
   */
  filename?: string;

  /**
   * Show detailed stats
   */
  showDetails?: boolean;
}

export function DownloadProgress({
  progress,
  totalBytes,
  bytesDownloaded,
  speedMBps = 0,
  timeRemainingSec,
  onCancel,
  filename,
  showDetails = true,
}: DownloadProgressProps): JSX.Element {
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (progress >= 100) {
      setIsAnimating(false);
    }
  }, [progress]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const percentComplete = Math.min(progress, 100);
  const isComplete = progress >= 100;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-sonar-abyss/50 border border-sonar-signal/30 rounded-lg p-5 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-sonar-signal" />
            <span className="text-sm font-mono text-sonar-highlight-bright">
              {isComplete ? 'Download Complete' : 'Downloading'}
            </span>
          </div>
          {onCancel && !isComplete && (
            <button
              onClick={onCancel}
              className="p-1 hover:bg-sonar-coral/20 rounded transition-colors"
              aria-label="Cancel download"
            >
              <X className="w-4 h-4 text-sonar-coral/70 hover:text-sonar-coral" />
            </button>
          )}
        </div>

        {/* Filename */}
        {filename && (
          <p className="text-xs text-sonar-highlight/70 mb-3 truncate font-mono">
            {filename}
          </p>
        )}

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="w-full h-2 bg-sonar-abyss rounded-full overflow-hidden border border-sonar-signal/20">
            <div
              className={`h-full bg-gradient-to-r from-sonar-signal to-sonar-highlight transition-all duration-300 ${
                isAnimating ? 'animate-pulse' : ''
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs font-mono text-sonar-highlight-bright">
              {percentComplete}%
            </span>
            <span className="text-xs font-mono text-sonar-highlight/70">
              {formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)}
            </span>
          </div>
        </div>

        {/* Details */}
        {showDetails && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-sonar-highlight/60 mb-1">Speed</p>
              <p className="font-mono text-sonar-signal">
                {speedMBps > 0 ? `${speedMBps.toFixed(2)} MB/s` : '—'}
              </p>
            </div>
            <div>
              <p className="text-sonar-highlight/60 mb-1">Time Remaining</p>
              <p className="font-mono text-sonar-signal">
                {timeRemainingSec ? formatTime(timeRemainingSec) : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Completion Message */}
        {isComplete && (
          <div className="mt-4 pt-4 border-t border-sonar-highlight/20">
            <p className="text-xs text-sonar-highlight/70">
              ✓ File ready to play
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
