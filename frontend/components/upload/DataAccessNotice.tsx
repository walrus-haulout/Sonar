'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';

interface DataAccessNoticeProps {
  onAcknowledge: (acknowledged: boolean) => void;
  disabled?: boolean;
}

/**
 * DataAccessNotice Component
 * Transparency notice about SONAR admin access to datasets for AI model training
 * Users must acknowledge before proceeding with encryption
 */
export function DataAccessNotice({ onAcknowledge, disabled = false }: DataAccessNoticeProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleAcknowledge = () => {
    setAcknowledged(!acknowledged);
    onAcknowledge(!acknowledged);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <GlassCard className="border-amber-500/30 bg-amber-950/10 backdrop-blur-sm">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-amber-600" />
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-3">
              Data Access & AI Model Training
            </h3>

            <div className="space-y-2 text-sm text-gray-300 mb-4">
              <p>
                By uploading to SONAR, you give the SONAR team access to your dataset for:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Verifying audio quality and authenticity</li>
                <li>Training open-source AI models to benefit the community</li>
                <li>Platform improvement and research</li>
              </ul>
              <p className="mt-3 text-xs text-gray-400">
                Your data is encrypted and only accessible by authorized SONAR team members.
                Learn more in our{' '}
                <a href="/docs/privacy" className="text-blue-400 hover:text-blue-300 underline">
                  Privacy Policy
                </a>
              </p>
            </div>

            {/* Acknowledgment Checkbox */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleAcknowledge}
                disabled={disabled}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  acknowledged
                    ? 'bg-green-600 border-green-500'
                    : 'border-gray-400 hover:border-gray-300'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {acknowledged && <CheckCircle2 className="w-4 h-4 text-white" />}
              </button>

              <label
                onClick={() => !disabled && handleAcknowledge()}
                className={`text-sm cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="text-gray-300">
                  I understand and acknowledge that SONAR can access my dataset for AI model training
                </span>
              </label>
            </div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
