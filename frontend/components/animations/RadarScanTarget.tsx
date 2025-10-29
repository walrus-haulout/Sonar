'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * RadarScanTarget Component
 * Displays a target (like the walrus logo) with animated radar scanning effects
 * Creates the illusion of sonar actively detecting and tracking the target
 */
export interface RadarScanTargetProps {
  src: string;
  alt: string;
  size?: number; // Size in pixels
  className?: string;
}

export function RadarScanTarget({
  src,
  alt,
  size = 200,
  className,
}: RadarScanTargetProps) {
  return (
    <div className={cn('relative inline-block', className)}>
      {/* Container for all effects */}
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        {/* Pulsing Detection Ring */}
        <div className="absolute inset-0 rounded-full">
          <div className="absolute inset-0 rounded-full border-2 border-sonar-signal/40 animate-sonar-pulse" />
          <div className="absolute inset-0 rounded-full border-2 border-sonar-signal/30 animate-sonar-pulse-delayed" />
        </div>

        {/* Rotating Radar Sweep - Simulates detection beam */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute inset-0 animate-radar-sweep"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgba(26, 164, 217, 0.3) 30deg, rgba(116, 228, 255, 0.6) 45deg, transparent 60deg)',
            }}
          />
        </div>

        {/* Corner Brackets - Target Lock Indicators */}
        <div className="absolute inset-0 opacity-80">
          {/* Top Left */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-sonar-highlight animate-pulse" />
          {/* Top Right */}
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-sonar-highlight animate-pulse" />
          {/* Bottom Left */}
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-sonar-highlight animate-pulse" />
          {/* Bottom Right */}
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-sonar-highlight animate-pulse" />
        </div>

        {/* Walrus Icon with Subtle Glow */}
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="relative w-4/5 h-4/5">
            {/* Background glow that intensifies on scan */}
            <div className="absolute inset-0 bg-sonar-signal/20 blur-xl animate-sonar-glow" />

            {/* The actual image */}
            <Image
              src={src}
              alt={alt}
              width={size * 0.8}
              height={size * 0.8}
              className="relative z-10 drop-shadow-2xl"
              priority
            />
          </div>
        </div>

        {/* Center Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-full h-full">
            {/* Horizontal line */}
            <div className="absolute top-1/2 left-1/4 right-1/4 h-px bg-sonar-highlight/60" />
            {/* Vertical line */}
            <div className="absolute left-1/2 top-1/4 bottom-1/4 w-px bg-sonar-highlight/60" />
            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full bg-sonar-signal animate-pulse" />
          </div>
        </div>

        {/* Expanding Detection Ping */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 rounded-full border border-sonar-signal/60 animate-ping-slow" />
        </div>
      </div>

      {/* Target Label */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <div className="px-3 py-1 rounded-sonar bg-sonar-signal/20 border border-sonar-signal/40 backdrop-blur-sm">
          <span className="text-xs font-mono text-sonar-highlight tracking-wider">
            TARGET ACQUIRED
          </span>
        </div>
      </div>
    </div>
  );
}
