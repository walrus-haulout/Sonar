'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Info, Tag, Globe, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DatasetMetadata, AudioFile } from '@/lib/types/upload';
import { SonarButton } from '@/components/ui/SonarButton';
import { GlassCard } from '@/components/ui/GlassCard';

interface MetadataStepProps {
  metadata: DatasetMetadata | null;
  audioFiles?: AudioFile[];
  onSubmit: (metadata: DatasetMetadata) => void;
  onBack: () => void;
  error: string | null;
}

const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
];

const SUGGESTED_TAGS = [
  'conversational',
  'interview',
  'podcast',
  'lecture',
  'music',
  'ambient',
  'speech',
  'multilingual',
  'emotional',
  'technical',
];

const metadataSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be less than 100 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description must be less than 1000 characters'),
  languages: z
    .array(z.string())
    .min(1, 'Select at least one language')
    .max(5, 'Maximum 5 languages'),
  tags: z
    .array(z.string())
    .min(1, 'Add at least one tag')
    .max(10, 'Maximum 10 tags'),
  consent: z
    .boolean()
    .refine((val) => val === true, 'You must confirm consent and rights'),
});

type MetadataFormData = z.infer<typeof metadataSchema>;

/**
 * MetadataStep Component
 * Form for dataset metadata with validation
 */
export function MetadataStep({
  metadata,
  audioFiles,
  onSubmit,
  onBack,
  error,
}: MetadataStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<MetadataFormData>({
    resolver: zodResolver(metadataSchema),
    mode: 'onChange',
    defaultValues: metadata || {
      title: '',
      description: '',
      languages: [],
      tags: [],
      consent: false,
    },
  });

  const selectedLanguages = watch('languages') || [];
  const selectedTags = watch('tags') || [];
  const consentChecked = watch('consent');

  const toggleLanguage = (code: string) => {
    const current = selectedLanguages;
    if (current.includes(code)) {
      setValue(
        'languages',
        current.filter((l) => l !== code),
        { shouldValidate: true }
      );
    } else {
      if (current.length < 5) {
        setValue('languages', [...current, code], { shouldValidate: true });
      }
    }
  };

  const toggleTag = (tag: string) => {
    const current = selectedTags;
    if (current.includes(tag)) {
      setValue(
        'tags',
        current.filter((t) => t !== tag),
        { shouldValidate: true }
      );
    } else {
      if (current.length < 10) {
        setValue('tags', [...current, tag], { shouldValidate: true });
      }
    }
  };

  const handleFormSubmit = (data: MetadataFormData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <label
          htmlFor="title"
          className="block text-sm font-mono font-semibold text-sonar-highlight-bright"
        >
          Dataset Title *
        </label>
        <input
          id="title"
          type="text"
          {...register('title')}
          placeholder="e.g., Natural Conversations in English"
          className={cn(
            'w-full px-4 py-3 rounded-sonar',
            'bg-sonar-abyss/50 border',
            'text-sonar-highlight-bright font-mono',
            'placeholder:text-sonar-highlight/30',
            'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
            errors.title
              ? 'border-sonar-coral focus:ring-sonar-coral'
              : 'border-sonar-blue/50'
          )}
        />
        {errors.title && (
          <p className="text-sm text-sonar-coral font-mono">
            {errors.title.message}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label
          htmlFor="description"
          className="block text-sm font-mono font-semibold text-sonar-highlight-bright"
        >
          Description *
        </label>
        <textarea
          id="description"
          {...register('description')}
          rows={4}
          placeholder="Describe your dataset, its contents, quality, and intended use cases..."
          className={cn(
            'w-full px-4 py-3 rounded-sonar',
            'bg-sonar-abyss/50 border',
            'text-sonar-highlight-bright font-mono',
            'placeholder:text-sonar-highlight/30',
            'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
            'resize-none',
            errors.description
              ? 'border-sonar-coral focus:ring-sonar-coral'
              : 'border-sonar-blue/50'
          )}
        />
        {errors.description && (
          <p className="text-sm text-sonar-coral font-mono">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Languages */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 text-sonar-signal" />
          <label className="text-sm font-mono font-semibold text-sonar-highlight-bright">
            Languages * (up to 5)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => toggleLanguage(lang.code)}
              className={cn(
                'px-3 py-1.5 rounded-sonar text-sm font-mono',
                'border transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                selectedLanguages.includes(lang.code)
                  ? 'bg-sonar-signal/20 border-sonar-signal text-sonar-highlight-bright'
                  : 'bg-transparent border-sonar-blue/50 text-sonar-highlight/70 hover:border-sonar-signal/50'
              )}
            >
              {lang.name}
            </button>
          ))}
        </div>
        {errors.languages && (
          <p className="text-sm text-sonar-coral font-mono">
            {errors.languages.message}
          </p>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Tag className="w-4 h-4 text-sonar-signal" />
          <label className="text-sm font-mono font-semibold text-sonar-highlight-bright">
            Tags * (up to 10)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                'px-3 py-1.5 rounded-sonar text-sm font-mono',
                'border transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                selectedTags.includes(tag)
                  ? 'bg-sonar-blue/20 border-sonar-blue text-sonar-highlight-bright'
                  : 'bg-transparent border-sonar-blue/30 text-sonar-highlight/70 hover:border-sonar-blue/50'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
        {errors.tags && (
          <p className="text-sm text-sonar-coral font-mono">
            {errors.tags.message}
          </p>
        )}
      </div>

      {/* Consent */}
      <GlassCard className="bg-sonar-blue/5">
        <div className="flex items-start space-x-3">
          <input
            id="consent"
            type="checkbox"
            {...register('consent')}
            className={cn(
              'mt-1 w-5 h-5 rounded border-2',
              'focus:ring-2 focus:ring-sonar-signal focus:ring-offset-2 focus:ring-offset-sonar-abyss',
              'cursor-pointer',
              consentChecked
                ? 'bg-sonar-signal border-sonar-signal'
                : 'bg-transparent border-sonar-blue/50'
            )}
          />
          <label
            htmlFor="consent"
            className="flex-1 text-sm text-sonar-highlight/80 cursor-pointer"
          >
            <span className="font-mono font-semibold text-sonar-highlight-bright block mb-1">
              Consent & Rights Confirmation *
            </span>
            I confirm that I have the necessary rights and permissions to upload
            and distribute this audio dataset. I understand that this dataset
            will be encrypted and stored on Walrus, and published to the Sui
            blockchain.
          </label>
        </div>
        {errors.consent && (
          <p className="text-sm text-sonar-coral font-mono mt-2">
            {errors.consent.message}
          </p>
        )}
      </GlassCard>

      {/* Info Box */}
      <GlassCard className="bg-sonar-signal/5">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-sonar-signal mt-0.5 flex-shrink-0" />
          <div className="text-sm text-sonar-highlight/80 space-y-2">
            <p className="font-mono font-semibold text-sonar-signal">
              Dataset Quality Matters
            </p>
            <p>
              Provide accurate metadata to help buyers find your dataset. AI
              verification will analyze your audio for quality and safety before
              publishing.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4">
        <SonarButton variant="secondary" onClick={onBack} type="button">
          ← Back
        </SonarButton>
        <SonarButton
          variant="primary"
          type="submit"
          disabled={!isValid}
          className={!isValid ? 'opacity-50 cursor-not-allowed' : ''}
        >
          Continue →
        </SonarButton>
      </div>
    </form>
  );
}