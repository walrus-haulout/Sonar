'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SonarButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Sonar Button Component
 * Animated button with aquatic theme
 * Respects reduced motion preferences
 */
export function SonarButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className,
  type = 'button',
}: SonarButtonProps) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={disabled}
      type={type}
      className={cn(
        'px-6 py-3 rounded-sonar font-mono tracking-wide uppercase text-sm',
        'border transition-all duration-300',
        'focus:outline-none focus:ring-2 focus:ring-sonar-signal focus:ring-offset-2 focus:ring-offset-sonar-abyss',
        variant === 'primary' &&
          'bg-sonar-signal/20 border-sonar-signal text-sonar-highlight-bright hover:bg-sonar-signal/30 hover:shadow-sonar',
        variant === 'secondary' &&
          'bg-transparent border-sonar-blue text-sonar-blue hover:bg-sonar-blue/10',
        variant === 'danger' &&
          'bg-sonar-coral/20 border-sonar-coral text-sonar-coral hover:bg-sonar-coral/30',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </motion.button>
  );
}
