'use client';

/**
 * Streaming Indicator Component
 * Shows animated bars to indicate audio streaming
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

interface StreamingIndicatorProps {
  /**
   * Optional message to display
   */
  message?: string;

  /**
   * Number of bars to animate (default: 5)
   */
  barCount?: number;

  /**
   * Show as inline indicator (smaller)
   */
  inline?: boolean;
}

export function StreamingIndicator({
  message = 'Streaming audio...',
  barCount = 5,
  inline = false,
}: StreamingIndicatorProps): React.ReactElement {
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: barCount }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-sonar-signal rounded-full animate-pulse"
              style={{
                height: '8px',
                animationDelay: `${i * 100}ms`,
                animationDuration: '1s',
              }}
            />
          ))}
        </div>
        <span className="text-xs text-sonar-highlight/70 font-mono">{message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      {/* Animated Bars */}
      <div className="flex gap-2 h-12">
        {Array.from({ length: barCount }).map((_, i) => (
          <div
            key={i}
            className="w-2 bg-gradient-to-t from-sonar-signal to-sonar-highlight rounded-full"
            style={{
              height: `${30 + Math.sin(i * (Math.PI / barCount)) * 20}px`,
              animation: `pulse 0.8s ease-in-out infinite`,
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-sonar-signal animate-spin" />
          <span className="text-sm font-mono text-sonar-highlight-bright">
            {message}
          </span>
        </div>
      )}

      {/* Inline CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scaleY(0.6);
          }
          50% {
            opacity: 1;
            transform: scaleY(1);
          }
        }
      `}</style>
    </div>
  );
}
