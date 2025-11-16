'use client';

import React, { useEffect, useRef } from 'react';
import { motion, Variants } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { SonarButton } from '@/components/ui/SonarButton';
import { RadarScanTarget } from '@/components/animations/RadarScanTarget';
import { cn } from '@/lib/utils';

/**
 * SonicWaveformCanvas Component
 * Canvas-based animated waveform with mouse interaction
 */
const SonicWaveformCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    let time = 0;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const draw = () => {
      // Subtle fade effect instead of full clear
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const lineCount = 60;
      const segmentCount = 80;
      const height = canvas.height / 2;

      for (let i = 0; i < lineCount; i++) {
        ctx.beginPath();
        const progress = i / lineCount;
        // Sonar cyan/teal gradient
        const colorIntensity = Math.sin(progress * Math.PI);
        ctx.strokeStyle = `rgba(26, 164, 217, ${colorIntensity * 0.4})`;
        ctx.lineWidth = 1.5;

        for (let j = 0; j < segmentCount + 1; j++) {
          const x = (j / segmentCount) * canvas.width;

          // Mouse influence
          const distToMouse = Math.hypot(x - mouse.x, height - mouse.y);
          const mouseEffect = Math.max(0, 1 - distToMouse / 400);

          // Wave calculation
          const noise = Math.sin(j * 0.1 + time + i * 0.2) * 20;
          const spike =
            Math.cos(j * 0.2 + time + i * 0.1) *
            Math.sin(j * 0.05 + time) *
            50;
          const y = height + noise + spike * (1 + mouseEffect * 2);

          if (j === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      time += 0.02;
      animationFrameId = requestAnimationFrame(draw);
    };

    const handleMouseMove = (event: MouseEvent) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);

    resizeCanvas();
    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 w-full h-full"
      style={{ background: '#000000' }}
      aria-hidden="true"
    />
  );
};

export interface SonicWaveformHeroProps {
  className?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  ctaText?: string;
  ctaHref?: string;
  logoSrc?: string;
  logoAlt?: string;
  logoSize?: number;
}

/**
 * SonicWaveformHero Component
 * Full-screen hero section with animated sonic waveform
 */
export function SonicWaveformHero({
  className,
  title = 'Sonic Waveform',
  subtitle = 'Real-Time Data Sonification',
  description = 'Translate complex audio streams into intuitive, interactive visualizations. Hear the patterns, feel the insights.',
  ctaText = 'Explore Marketplace',
  ctaHref = '/marketplace',
  logoSrc,
  logoAlt = 'Logo',
  logoSize = 220,
}: SonicWaveformHeroProps) {
  const fadeUpVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.2 + 0.5,
        duration: 0.8,
        ease: [0.25, 0.1, 0.25, 1.0],
      },
    }),
  };

  return (
    <div
      className={cn(
        'relative h-screen w-full flex flex-col items-center justify-center overflow-hidden',
        className
      )}
    >
      {/* Canvas Background */}
      <SonicWaveformCanvas />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent z-10" />

      {/* Overlay Content */}
      <div className="relative z-20 text-center px-6 space-y-8 max-w-4xl mx-auto">
        {/* Logo */}
        {logoSrc && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex justify-center mb-8"
          >
            <RadarScanTarget
              src={logoSrc}
              alt={logoAlt}
              size={logoSize}
            />
          </motion.div>
        )}

        {/* Badge */}
        <motion.div
          custom={0}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sonar-signal/10 border border-sonar-signal/20 mb-6 backdrop-blur-sm"
        >
          <BarChart2 className="h-4 w-4 text-sonar-signal" />
          <span className="text-sm font-medium text-sonar-highlight">
            {subtitle}
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          custom={1}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="text-5xl md:text-7xl font-bold font-mono tracking-radar mb-6 text-sonar-highlight"
        >
          {title}
        </motion.h1>

        {/* Description */}
        <motion.p
          custom={2}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className="max-w-2xl mx-auto text-lg text-sonar-highlight-bright/80 mb-10"
        >
          {description}
        </motion.p>

        {/* CTA Button */}
        <motion.div
          custom={3}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
        >
          <a href={ctaHref}>
            <SonarButton variant="primary">{ctaText}</SonarButton>
          </a>
        </motion.div>
      </div>
    </div>
  );
}
