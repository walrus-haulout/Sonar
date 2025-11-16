'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Info, Tag, Globe, FileText, ChevronDown, Plus, X } from 'lucide-react';
import { useState, useEffect } from 'react';
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
  { code: 'other', name: 'Other' },
];

const SUGGESTED_TAGS = [
  'speech',
  'music',
  'environmental',
  'vocals',
  'sound-effects',
  'interview',
  'podcast',
  'lecture',
  'field-recording',
  'ambient',
  'nature',
  'urban',
  'instrumental',
  'multilingual',
  'emotional',
  'technical',
];

const SAMPLE_RATES = [8000, 16000, 22050, 44100, 48000, 96000];

const RECORDING_QUALITY_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'unknown', label: "I Don't Know" },
];

const USE_CASE_OPTIONS = [
  'Training Data',
  'Music Production',
  'Sound Design',
  'Field Recording',
  'Podcast',
  'Vocal Samples',
  'Sound Effects Library',
  'Interview',
  'Lecture',
  'Presentation',
  'Call Recording',
  'Environmental Study',
  'Other',
];

const CONTENT_TYPE_OPTIONS = [
  'Speech/Dialogue',
  'Monologue',
  'Music',
  'Vocals',
  'Environmental Sounds',
  'Sound Effects',
  'Field Recording',
  'Ambient/Soundscape',
  'Mixed',
];

const DOMAIN_OPTIONS = [
  'Technology',
  'Healthcare',
  'Education',
  'Entertainment',
  'Music Production',
  'Sound Design',
  'Environmental Science',
  'Wildlife/Nature',
  'Broadcast/Media',
  'Business',
  'Science',
  'Arts',
  'News',
  'Sports',
  'Other',
];

const AGE_RANGE_OPTIONS = [
  '18-25',
  '26-35',
  '36-50',
  '50+',
  'Unknown',
];

const GENDER_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
  'Unknown',
];

const ACCENT_OPTIONS = [
  'Native',
  'Regional',
  'International',
  'Unknown',
];

const metadataSchema = z.object({
  title: z
    .string()
    .min(10, 'Title must be at least 10 characters')
    .max(100, 'Title must be less than 100 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description must be less than 1000 characters'),
  languages: z
    .array(z.string())
    .max(5, 'Maximum 5 languages')
    .optional(),
  tags: z
    .array(z.string())
    .max(10, 'Maximum 10 tags')
    .optional(),
  consent: z
    .boolean()
    .refine((val) => val === true, 'You must confirm consent and rights'),
  perFileMetadata: z.array(z.object({
    fileId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  audioQuality: z.object({
    sampleRate: z.preprocess((val) => (typeof val === 'number' && isNaN(val) ? undefined : val), z.number().positive().optional()),
    bitDepth: z.preprocess((val) => (typeof val === 'number' && isNaN(val) ? undefined : val), z.number().positive().optional()),
    channels: z.preprocess((val) => (typeof val === 'number' && isNaN(val) ? undefined : val), z.number().int().min(1).optional()),
    codec: z.string().optional(),
    recordingQuality: z.enum(['professional', 'high', 'medium', 'low', 'unknown']).optional(),
  }).optional(),
  speakers: z.object({
    speakerCount: z.preprocess((val) => (typeof val === 'number' && isNaN(val) ? undefined : val), z.number().int().min(1).max(20).optional()),
    speakers: z.array(z.object({
      id: z.string(),
      role: z.string().optional(),
      ageRange: z.string().optional(),
      gender: z.string().optional(),
      accent: z.string().optional(),
    })),
  }).optional(),
  categorization: z.object({
    useCase: z.string().optional().or(z.literal('')),
    contentType: z.string().optional().or(z.literal('')),
    domain: z.string().optional().or(z.literal('')),
  }).optional(),
});

type MetadataFormData = z.infer<typeof metadataSchema>;

/**
 * MetadataStep Component
 * Enhanced form with per-file, audio quality, speaker, and content labeling
 */
export function MetadataStep({
  metadata,
  audioFiles = [],
  onSubmit,
  onBack,
  error,
}: MetadataStepProps) {
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    perFile: true,
    audioQuality: false, // Optional - start collapsed
    speakers: false, // Optional - start collapsed
    categorization: true,
  });

  // Initialize default values - handle undefined audioFiles
  const isSingleFile = audioFiles && audioFiles.length === 1;
  const defaultPerFileMetadata = (audioFiles && Array.isArray(audioFiles) ? audioFiles : []).map((f) => ({
    fileId: f.id || '',
    title: f.file?.name?.replace(/\.[^.]+$/, '') || 'Untitled Audio File',
    description: isSingleFile ? 'A single audio file.' : '', // Default description for single files
  }));

  // Audio quality is optional - initialize only if user opens the section
  // This helps reduce friction for users who don't know technical details

  // Speakers is optional - initialize only if user opens the section

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
      languages: undefined,
      tags: undefined,
      consent: false,
      perFileMetadata: defaultPerFileMetadata,
      // Optional fields - not initialized by default
      audioQuality: undefined,
      speakers: undefined,
      categorization: undefined,
    },
  });

  const selectedLanguages = watch('languages') || [];
  const selectedTags = watch('tags') || [];
  const consentChecked = watch('consent');
  const speakerCount = watch('speakers.speakerCount');
  const speakers = watch('speakers.speakers');
  const watchedTitle = watch('title');
  const watchedDescription = watch('description');
  const perFileMetadata = watch('perFileMetadata');

  // Auto-sync dataset metadata to per-file metadata for single-file uploads
  useEffect(() => {
    if (isSingleFile && perFileMetadata && perFileMetadata.length === 1) {
      // Only update if the values have changed to avoid infinite loops
      const currentPerFile = perFileMetadata[0];
      if (currentPerFile.title !== watchedTitle && watchedTitle.length >= 10) {
        setValue(`perFileMetadata.0.title`, watchedTitle, { shouldValidate: true });
      }
      if (currentPerFile.description !== watchedDescription && watchedDescription.length >= 10) {
        setValue(`perFileMetadata.0.description`, watchedDescription, { shouldValidate: true });
      }
    }
  }, [isSingleFile, watchedTitle, watchedDescription, perFileMetadata, setValue]);


  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

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

  const updateSpeakerCount = (count: number) => {
    const newSpeakers = [];
    for (let i = 0; i < count; i++) {
      // Get existing speaker or create new one - handle both undefined and missing speakers
      const existingSpeaker = speakers && Array.isArray(speakers) ? speakers[i] : null;
      newSpeakers.push(
        existingSpeaker || { id: String(i + 1), role: '', ageRange: '', gender: '', accent: '' }
      );
    }
    setValue('speakers.speakerCount', count);
    setValue('speakers.speakers', newSpeakers);
  };

  const handleFormSubmit = (data: MetadataFormData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* BASIC SECTION */}
      <SectionCollapsible
        title="Basic Information"
        isExpanded={expandedSections.basic}
        onToggle={() => toggleSection('basic')}
      >
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
              Languages (optional, up to 5)
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
              Tags (optional, up to 10)
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
      </SectionCollapsible>

      {/* PER-FILE METADATA SECTION */}
      <SectionCollapsible
        title="Per-File Labels"
        isExpanded={expandedSections.perFile}
        onToggle={() => toggleSection('perFile')}
      >
        {isSingleFile ? (
          <p className="text-xs text-sonar-highlight/70 font-mono mb-3">
            Your per-file title and description are automatically synced with your dataset details above.
          </p>
        ) : (
          <p className="text-xs text-sonar-highlight/70 font-mono mb-3">
            Provide individual title and description for each audio file
          </p>
        )}
        <div className="space-y-3">
          {audioFiles && Array.isArray(audioFiles) && audioFiles.length > 0 && audioFiles.map((file, index) => (
            <div key={file.id} className="space-y-2 p-3 bg-sonar-abyss/30 rounded-sonar border border-sonar-blue/20">
              <p className="text-xs font-mono text-sonar-signal font-semibold">
                {file.file?.name || 'Unknown file'}
              </p>
              <input
                type="text"
                {...register(`perFileMetadata.${index}.title`)}
                placeholder="File title"
                readOnly={isSingleFile}
                className={cn(
                  'w-full px-3 py-2 rounded-sonar text-sm',
                  'bg-sonar-abyss/50 border',
                  'text-sonar-highlight-bright font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                  isSingleFile && 'cursor-not-allowed opacity-70',
                  errors.perFileMetadata?.[index]?.title
                    ? 'border-sonar-coral'
                    : 'border-sonar-blue/50'
                )}
              />
              <textarea
                {...register(`perFileMetadata.${index}.description`)}
                placeholder="File description"
                rows={2}
                readOnly={isSingleFile}
                className={cn(
                  'w-full px-3 py-2 rounded-sonar text-sm',
                  'bg-sonar-abyss/50 border resize-none',
                  'text-sonar-highlight-bright font-mono',
                  'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                  isSingleFile && 'cursor-not-allowed opacity-70',
                  errors.perFileMetadata?.[index]?.description
                    ? 'border-sonar-coral'
                    : 'border-sonar-blue/50'
                )}
              />
            </div>
          ))}
        </div>
      </SectionCollapsible>

      {/* AUDIO QUALITY SECTION */}
      <SectionCollapsible
        title="Audio Quality (Optional - +10% Points Bonus)"
        isExpanded={expandedSections.audioQuality}
        onToggle={() => toggleSection('audioQuality')}
      >
        <div className="p-3 rounded-sonar bg-sonar-signal/5 border border-sonar-signal/20 mb-3">
          <p className="text-xs font-mono text-sonar-signal mb-1">💡 Accurate technical details help improve your rarity score</p>
          <p className="text-xs text-sonar-highlight/70">
            If you don't know these values, you can skip this section. Leave fields blank to indicate unknown values.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Sample Rate (Hz)
            </label>
            <select
              {...register('audioQuality.sampleRate', { valueAsNumber: true })}
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                errors.audioQuality?.sampleRate
                  ? 'border-sonar-coral'
                  : 'border-sonar-blue/50'
              )}
            >
              {SAMPLE_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} Hz
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Channels
            </label>
            <input
              type="number"
              min="1"
              {...register('audioQuality.channels', { valueAsNumber: true })}
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                errors.audioQuality?.channels
                  ? 'border-sonar-coral'
                  : 'border-sonar-blue/50'
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Codec
            </label>
            <input
              type="text"
              {...register('audioQuality.codec')}
              placeholder="e.g., MP3, AAC, FLAC"
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                errors.audioQuality?.codec
                  ? 'border-sonar-coral'
                  : 'border-sonar-blue/50'
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Bit Depth (optional)
            </label>
            <input
              type="number"
              {...register('audioQuality.bitDepth', { valueAsNumber: true })}
              placeholder="e.g., 16, 24, 32"
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                'border-sonar-blue/50'
              )}
            />
          </div>
        </div>

        <div className="space-y-2 mt-3">
          <label className="text-sm font-mono font-semibold text-sonar-highlight-bright">
            Recording Quality
          </label>
          <div className="grid grid-cols-2 gap-2">
            {RECORDING_QUALITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'p-2 rounded-sonar text-sm font-mono cursor-pointer',
                  'border transition-all duration-200',
                  watch('audioQuality.recordingQuality') === option.value
                    ? 'bg-sonar-signal/20 border-sonar-signal text-sonar-highlight-bright'
                    : 'bg-transparent border-sonar-blue/50 text-sonar-highlight/70 hover:border-sonar-signal/50'
                )}
              >
                <input
                  type="radio"
                  {...register('audioQuality.recordingQuality')}
                  value={option.value}
                  className="mr-2"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </SectionCollapsible>

      {/* SPEAKER INFORMATION SECTION */}
      <SectionCollapsible
        title="Speaker Information (Optional - +15% Points Bonus)"
        isExpanded={expandedSections.speakers}
        onToggle={() => toggleSection('speakers')}
      >
        <div className="p-3 rounded-sonar bg-sonar-signal/5 border border-sonar-signal/20 mb-3">
          <p className="text-xs font-mono text-sonar-signal mb-1">💡 Speaker demographics make your data more valuable for ML training</p>
          <p className="text-xs text-sonar-highlight/70">
            Fill in what you know. All fields are optional. Select "Unknown" if you prefer not to specify.
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Number of Speakers (1-20)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              {...register('speakers.speakerCount', { valueAsNumber: true })}
              onChange={(e) => updateSpeakerCount(parseInt(e.target.value) || 1)}
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                errors.speakers?.speakerCount
                  ? 'border-sonar-coral'
                  : 'border-sonar-blue/50'
              )}
            />
          </div>

          <div className="space-y-2">
            {speakers && Array.isArray(speakers) && speakers.length > 0 && speakers.map((speaker, idx) => (
              <div key={speaker.id} className="p-3 bg-sonar-abyss/30 rounded-sonar border border-sonar-blue/20 space-y-2">
                <p className="text-xs font-mono text-sonar-signal font-semibold">Speaker {idx + 1}</p>
                <input
                  type="text"
                  {...register(`speakers.speakers.${idx}.role`)}
                  placeholder="Role (e.g., host, guest, interviewer)"
                  className={cn(
                    'w-full px-3 py-2 rounded-sonar text-sm',
                    'bg-sonar-abyss/50 border border-sonar-blue/50',
                    'text-sonar-highlight-bright font-mono',
                    'focus:outline-none focus:ring-2 focus:ring-sonar-signal'
                  )}
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    {...register(`speakers.speakers.${idx}.ageRange`)}
                    className={cn(
                      'px-3 py-2 rounded-sonar text-sm',
                      'bg-sonar-abyss/50 border border-sonar-blue/50',
                      'text-sonar-highlight-bright font-mono',
                      'focus:outline-none focus:ring-2 focus:ring-sonar-signal'
                    )}
                  >
                    <option value="">Age range</option>
                    {AGE_RANGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <select
                    {...register(`speakers.speakers.${idx}.gender`)}
                    className={cn(
                      'px-3 py-2 rounded-sonar text-sm',
                      'bg-sonar-abyss/50 border border-sonar-blue/50',
                      'text-sonar-highlight-bright font-mono',
                      'focus:outline-none focus:ring-2 focus:ring-sonar-signal'
                    )}
                  >
                    <option value="">Gender</option>
                    {GENDER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <select
                    {...register(`speakers.speakers.${idx}.accent`)}
                    className={cn(
                      'px-3 py-2 rounded-sonar text-sm',
                      'bg-sonar-abyss/50 border border-sonar-blue/50',
                      'text-sonar-highlight-bright font-mono',
                      'focus:outline-none focus:ring-2 focus:ring-sonar-signal'
                    )}
                  >
                    <option value="">Accent</option>
                    {ACCENT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCollapsible>

      {/* CONTENT CATEGORIZATION SECTION */}
      <SectionCollapsible
        title="Content Categorization"
        isExpanded={expandedSections.categorization}
        onToggle={() => toggleSection('categorization')}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Use Case (optional)
            </label>
            <select
              {...register('categorization.useCase')}
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                errors.categorization?.useCase
                  ? 'border-sonar-coral'
                  : 'border-sonar-blue/50'
              )}
            >
              <option value="">Select use case...</option>
              {USE_CASE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Content Type (optional)
            </label>
            <select
              {...register('categorization.contentType')}
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                errors.categorization?.contentType
                  ? 'border-sonar-coral'
                  : 'border-sonar-blue/50'
              )}
            >
              <option value="">Select content type...</option>
              {CONTENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-mono font-semibold text-sonar-highlight-bright">
              Domain (optional)
            </label>
            <select
              {...register('categorization.domain')}
              className={cn(
                'w-full px-3 py-2 rounded-sonar text-sm',
                'bg-sonar-abyss/50 border',
                'text-sonar-highlight-bright font-mono',
                'focus:outline-none focus:ring-2 focus:ring-sonar-signal',
                errors.categorization?.domain
                  ? 'border-sonar-coral'
                  : 'border-sonar-blue/50'
              )}
            >
              <option value="">Select domain...</option>
              {DOMAIN_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {errors.categorization?.domain && (
              <p className="text-sm text-sonar-coral font-mono">
                {errors.categorization.domain.message}
              </p>
            )}
          </div>
        </div>
      </SectionCollapsible>

      {/* CONSENT SECTION */}
      <GlassCard className={cn(
        'border-2',
        consentChecked
          ? 'bg-sonar-signal/5 border-sonar-signal/30'
          : 'bg-sonar-coral/5 border-sonar-coral/30'
      )}>
        <div className="flex items-start space-x-3">
          <input
            id="consent"
            type="checkbox"
            {...register('consent')}
            className={cn(
              'mt-1 w-5 h-5 rounded border-2 flex-shrink-0',
              'focus:ring-2 focus:ring-sonar-signal focus:ring-offset-2 focus:ring-offset-sonar-abyss',
              'cursor-pointer',
              consentChecked
                ? 'bg-sonar-signal border-sonar-signal'
                : 'bg-transparent border-sonar-coral/60'
            )}
          />
          <label
            htmlFor="consent"
            className="flex-1 text-sm text-sonar-highlight/80 cursor-pointer"
          >
            <span className={cn(
              'font-mono font-semibold block mb-1',
              consentChecked ? 'text-sonar-highlight-bright' : 'text-sonar-coral'
            )}>
              Consent & Rights Confirmation *
            </span>
            <span className="text-xs text-sonar-highlight/70">
              I confirm that I have the necessary rights and permissions to upload
              and distribute this audio dataset. I understand that this dataset
              will be encrypted and stored on Walrus, and published to the Sui
              blockchain.
            </span>
          </label>
        </div>
        {errors.consent && (
          <p className="text-sm text-sonar-coral font-mono mt-2 font-semibold">
            ⚠️ {errors.consent.message}
          </p>
        )}
      </GlassCard>

      {/* INFO BOX */}
      <GlassCard className="bg-sonar-signal/5">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-sonar-signal mt-0.5 flex-shrink-0" />
          <div className="text-sm text-sonar-highlight/80 space-y-2">
            <p className="font-mono font-semibold text-sonar-signal">
              Enhanced Labeling for Better Data Quality
            </p>
            <p>
              Comprehensive metadata helps buyers find exactly what they need
              and improves your dataset's discoverability and value.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* VALIDATION SUMMARY - Show missing required fields */}
      {!isValid && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-4 rounded-sonar',
            'bg-sonar-signal/10 border border-sonar-signal/50',
            'text-sonar-signal font-mono text-sm'
          )}
        >
          <p className="font-semibold mb-2">⚠️ Please complete the following before continuing:</p>
          <ul className="space-y-1 text-xs">
            {errors.title && <li>• Title: {errors.title.message}</li>}
            {errors.description && <li>• Description: {errors.description.message}</li>}
            {errors.languages && <li>• Languages: {errors.languages.message}</li>}
            {errors.tags && <li>• Tags: {errors.tags.message}</li>}
            {errors.perFileMetadata && (
              <>
                {Array.isArray(errors.perFileMetadata) && errors.perFileMetadata.map((fileError, idx) => (
                  fileError && (
                    <li key={idx}>
                      • File {idx + 1}:{' '}
                      {fileError.title && `${fileError.title.message}`}
                      {fileError.title && fileError.description && ' | '}
                      {fileError.description && `${fileError.description.message}`}
                    </li>
                  )
                ))}
                {!Array.isArray(errors.perFileMetadata) && errors.perFileMetadata.root && (
                  <li>• Per-file metadata: {errors.perFileMetadata.root.message}</li>
                )}
                {!Array.isArray(errors.perFileMetadata) && !errors.perFileMetadata.root && (
                  <li>• Per-file metadata: Invalid or missing</li>
                )}
              </>
            )}
            {errors.categorization?.useCase && <li>• Use Case: {errors.categorization.useCase.message}</li>}
            {errors.categorization?.contentType && <li>• Content Type: {errors.categorization.contentType.message}</li>}
            {errors.categorization?.domain && <li>• Domain: {errors.categorization.domain.message}</li>}
            {errors.consent && <li>• Consent: {errors.consent.message}</li>}
          </ul>
        </motion.div>
      )}

      {/* ERROR MESSAGE */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-4 rounded-sonar',
            'bg-sonar-coral/10 border border-sonar-coral',
            'text-sonar-coral font-mono text-sm'
          )}
        >
          {error}
        </motion.div>
      )}

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

/**
 * SectionCollapsible Component
 * Reusable collapsible section header
 */
function SectionCollapsible({
  title,
  isExpanded,
  onToggle,
  children,
}: {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <GlassCard>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-0 text-left"
      >
        <h3 className="text-sm font-mono font-semibold text-sonar-highlight-bright">
          {title}
        </h3>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-sonar-signal transition-transform duration-200',
            isExpanded ? 'transform rotate-180' : ''
          )}
        />
      </button>
      {isExpanded && <div className="mt-4 space-y-3">{children}</div>}
    </GlassCard>
  );
}
