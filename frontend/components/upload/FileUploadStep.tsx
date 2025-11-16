'use client';

import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, File, X, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioFile } from '@/lib/types/upload';
import { SonarButton } from '@/components/ui/SonarButton';
import { GlassCard } from '@/components/ui/GlassCard';

interface FileUploadStepProps {
  audioFile: AudioFile | null; // Backwards compatibility (single file mode)
  audioFiles?: AudioFile[]; // Multi-file mode
  onFileSelected: (audioFile: AudioFile | null) => void; // Single file callback (null to clear)
  onFilesSelected?: (audioFiles: AudioFile[]) => void; // Multi-file callback
  onContinue?: () => void; // Explicit continue action for multi-file mode
  error: string | null;
  multiFile?: boolean; // Enable multi-file selection (default: true)
}

const MIME_FALLBACK_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  '3gp': 'audio/3gpp',
  '3gpp': 'audio/3gpp',
  amr: 'audio/amr',
};

function resolveMimeType(file: File): string {
  if (file.type) {
    return file.type.split(';')[0].toLowerCase();
  }

  const extensionMatch = /\.([a-z0-9]+)$/i.exec(file.name);
  if (extensionMatch) {
    const ext = extensionMatch[1].toLowerCase();
    if (MIME_FALLBACK_MAP[ext]) {
      return MIME_FALLBACK_MAP[ext];
    }
  }

  return 'application/octet-stream';
}

const SUPPORTED_FORMATS = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  'audio/x-ogg',
  'audio/opus',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/webm',
  'audio/3gpp',
  'audio/3gp',
  'audio/amr',
];

const ACCEPT_PATTERNS = [
  ...SUPPORTED_FORMATS,
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.flac',
  '.ogg',
  '.opus',
  '.webm',
  '.3gp',
  '.3gpp',
  '.amr',
];

const MAX_FILE_SIZE = 13 * 1024 * 1024 * 1024; // 13 GiB (Walrus maximum)
const MAX_FILES = 100; // From contract: maxFilesPerDataset
// No limit on total dataset size - only per-file and file count limits

/**
 * FileUploadStep Component
 * Drag-and-drop file upload with validation and preview
 */
export function FileUploadStep({
  audioFile,
  audioFiles = [],
  onFileSelected,
  onFilesSelected,
  onContinue,
  error,
  multiFile = true,
}: FileUploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<AudioFile[]>(audioFiles);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const mimeType = resolveMimeType(file);
    const hasKnownMime = mimeType && mimeType !== 'application/octet-stream';

    const isSupported =
      (hasKnownMime && SUPPORTED_FORMATS.includes(mimeType)) ||
      (!hasKnownMime && /\.(mp3|m4a|aac|wav|flac|ogg|webm|opus|3gp|3gpp|amr)$/i.test(file.name));

    if (!isSupported) {
      const supportedList = [
        'MP3',
        'M4A/AAC',
        'MP4 audio',
        'WAV',
        'FLAC',
        'OGG/Opus',
        'WebM',
        '3GPP/3GP',
        'AMR',
      ].join(', ');
      return `Unsupported audio format. Supported formats: ${supportedList}`;
    }

    if (file.size > MAX_FILE_SIZE) {
      const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
      return `File too large (${fileSizeGB} GiB). Maximum size is 13 GiB (Walrus limit)`;
    }

    return null;
  }, []);

  const validateMultipleFiles = useCallback((files: File[], existingFiles: AudioFile[] = []): string | null => {
    const totalFiles = files.length + existingFiles.length;

    if (totalFiles > MAX_FILES) {
      return `Too many files. Maximum is ${MAX_FILES} files per dataset`;
    }

    // No total size limit - only per-file limits (13 GiB each) and file count (100 max)
    return null;
  }, []);

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);

      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        resolve(audio.duration);
      });

      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load audio metadata'));
      });

      audio.src = url;
    });
  };

  const extractAudioQuality = async (file: File): Promise<{
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
    codec?: string;
  }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext not supported in this browser');
      }
      const audioContext = new AudioContextClass();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Extract codec from MIME type
      const mimeType = resolveMimeType(file);
      let codec = 'unknown';
      if (mimeType.includes('mp3') || mimeType.includes('mpeg')) codec = 'MP3';
      else if (mimeType.includes('mp4') || mimeType.includes('aac')) codec = 'AAC';
      else if (mimeType.includes('flac')) codec = 'FLAC';
      else if (mimeType.includes('wav')) codec = 'WAV';
      else if (mimeType.includes('ogg')) codec = 'OGG';
      else if (mimeType.includes('webm')) codec = 'WebM';
      else if (mimeType.includes('3gp')) codec = '3GPP';
      else if (mimeType.includes('amr')) codec = 'AMR';

      return {
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        codec,
      };
    } catch (err) {
      console.warn('[FileUploadStep] Could not extract audio quality:', err);
      return { codec: resolveMimeType(file).split('/')[1] || 'unknown' };
    }
  };

  const processFiles = useCallback(async (files: File[]) => {
    console.log('[FileUploadStep] Processing files:', files.length);
    setValidationError(null);
    setIsProcessing(true);

    try {
      // Validate in multi-file mode
      if (multiFile) {
        const multiValidation = validateMultipleFiles(files, selectedFiles);
        if (multiValidation) {
          console.error('[FileUploadStep] Validation error:', multiValidation);
          setValidationError(multiValidation);
          setIsProcessing(false);
          return;
        }
      }

      // Process each file
      const processedFiles: AudioFile[] = [];
      for (const file of files) {
        // Validate individual file
        const validationResult = validateFile(file);
        if (validationResult) {
          setValidationError(`${file.name}: ${validationResult}`);
          setIsProcessing(false);
          return;
        }

        try {
          const resolvedMimeType = resolveMimeType(file);

          // Get audio duration and quality metadata in parallel
          const [duration, quality] = await Promise.all([
            getAudioDuration(file),
            extractAudioQuality(file),
          ]);

          // Create preview URL
          const preview = URL.createObjectURL(file);

          const audioFile: AudioFile = {
            id: `${Date.now()}-${Math.random().toString(36)}`,
            file,
            duration,
            preview,
            mimeType: resolvedMimeType !== 'application/octet-stream' ? resolvedMimeType : '',
            extractedQuality: quality,
          };

          processedFiles.push(audioFile);
        } catch (err) {
          setValidationError(
            `${file.name}: ${err instanceof Error ? err.message : 'Failed to process audio file'}`
          );
          setIsProcessing(false);
          return;
        }
      }

      // Update state
      if (multiFile && onFilesSelected) {
        const newFiles = [...selectedFiles, ...processedFiles];
        console.log('[FileUploadStep] Files processed successfully:', newFiles.length);
        setSelectedFiles(newFiles);
        onFilesSelected(newFiles);
      } else if (!multiFile && processedFiles.length > 0) {
        // Single file mode - backwards compatibility
        console.log('[FileUploadStep] Single file processed successfully:', processedFiles[0].file.name);
        onFileSelected(processedFiles[0]);
      }
    } catch (err) {
      console.error('[FileUploadStep] Error processing files:', err);
      setValidationError(
        err instanceof Error ? err.message : 'Failed to process audio files'
      );
    } finally {
      setIsProcessing(false);
    }
  }, [multiFile, validateMultipleFiles, validateFile, selectedFiles, onFilesSelected, onFileSelected]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        processFiles(multiFile ? files : [files[0]]);
      }
    },
    [multiFile, processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(Array.from(files));
      }
      // Clear input value to allow file picker to open again
      e.target.value = '';
    },
    [processFiles]
  );

  const handleBrowseClick = () => {
    console.log('[FileUploadStep] Add More button clicked');
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (fileId: string) => {
    console.log('[FileUploadStep] Removing file:', fileId);
    const fileToRemove = selectedFiles.find((f) => f.id === fileId);
    if (fileToRemove?.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    const newFiles = selectedFiles.filter((f) => f.id !== fileId);
    console.log('[FileUploadStep] Files after removal:', newFiles.length);
    setSelectedFiles(newFiles);
    if (onFilesSelected) {
      onFilesSelected(newFiles);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const estimateUploadTime = (bytes: number): string => {
    // Estimate based on typical broadband speed (100 Mbps = 12.5 MB/s)
    const speedMBps = 12.5; // MB per second
    const sizeMB = bytes / (1024 * 1024);
    const seconds = sizeMB / speedMBps;

    if (seconds < 60) {
      return `~${Math.ceil(seconds)} seconds`;
    } else if (seconds < 3600) {
      return `~${Math.ceil(seconds / 60)} minutes`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.ceil((seconds % 3600) / 60);
      return `~${hours}h ${mins}m`;
    }
  };

  // Calculate aggregate stats for multi-file
  const totalSize = selectedFiles.reduce((sum, f) => sum + f.file.size, 0);
  const totalDuration = selectedFiles.reduce((sum, f) => sum + f.duration, 0);
  const hasLargeFiles = selectedFiles.some(f => f.file.size > 5 * 1024 * 1024 * 1024); // >5GB

  const showDropZone = multiFile ? selectedFiles.length === 0 : !audioFile;
  const displayFiles = multiFile ? selectedFiles : (audioFile ? [audioFile] : []);

  return (
    <div className="space-y-6">
      {/* Hidden file input - kept at root level so ref persists when files are added */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_PATTERNS.join(',')}
        onChange={handleFileSelect}
        multiple={multiFile}
        className="hidden"
        aria-label={multiFile ? "Upload audio files" : "Upload audio file"}
      />

      {/* Drop Zone */}
      {showDropZone && (
        <motion.div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'relative border-2 border-dashed rounded-sonar p-12',
            'transition-all duration-300 cursor-pointer',
            isDragging
              ? 'border-sonar-signal bg-sonar-signal/10'
              : 'border-sonar-blue/50 hover:border-sonar-signal/50 hover:bg-sonar-signal/5',
            'focus-within:ring-2 focus-within:ring-sonar-signal focus-within:ring-offset-2 focus-within:ring-offset-sonar-abyss'
          )}
          onClick={handleBrowseClick}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >

          <div className="flex flex-col items-center justify-center space-y-4">
            <motion.div
              animate={
                isDragging
                  ? { scale: 1.1, rotate: 5 }
                  : { scale: 1, rotate: 0 }
              }
              className="p-6 rounded-full bg-sonar-signal/10"
            >
              <Upload className="w-12 h-12 text-sonar-signal" />
            </motion.div>

            <div className="text-center">
              <p className="text-lg font-mono text-sonar-highlight-bright mb-2">
                {multiFile ? 'Drop your audio files here' : 'Drop your audio file here'}
              </p>
              <p className="text-sm text-sonar-highlight/70">
                or click to browse
              </p>
            </div>

            <div className="text-xs text-sonar-highlight/50 font-mono space-y-1 text-center">
              <p>Supported formats: MP3, WAV, FLAC, OGG, M4A</p>
              <p>Maximum file size: 13 GiB{multiFile ? ' per file' : ''} (Walrus limit)</p>
              {multiFile && (
                <>
                  <p>Maximum files: {MAX_FILES} per dataset</p>
                  <p className="text-sonar-signal">No limit on total dataset size</p>
                </>
              )}
              <p className="text-sonar-blue mt-2">💡 Tip: FLAC recommended for quality + smaller size</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Large File Warning */}
      {hasLargeFiles && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-4 rounded-sonar',
            'bg-sonar-signal/10 border border-sonar-signal',
            'text-sonar-signal font-mono text-sm'
          )}
        >
          <div className="flex items-start space-x-3">
            <Upload className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">Large Files Detected</p>
              <p className="text-xs text-sonar-highlight/80">
                Estimated upload + encryption time: {estimateUploadTime(totalSize)}
              </p>
              <p className="text-xs text-sonar-highlight/60 mt-1">
                Consider using FLAC compression to reduce file size without losing quality.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Multi-File Preview */}
      {multiFile && selectedFiles.length > 0 && (
        <>
          {/* Aggregate Stats */}
          <GlassCard className="bg-sonar-signal/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 rounded-sonar bg-sonar-signal/10">
                  <File className="w-6 h-6 text-sonar-signal" />
                </div>
                <div>
                  <h3 className="font-mono text-lg text-sonar-highlight-bright">
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                  </h3>
                  <div className="flex items-center space-x-4 text-sm text-sonar-highlight/70 font-mono">
                    <span>Total: {formatFileSize(totalSize)}</span>
                    <span>•</span>
                    <span>Duration: {formatDuration(totalDuration)}</span>
                  </div>
                </div>
              </div>
              <SonarButton
                variant="secondary"
                onClick={handleBrowseClick}
                className="text-sm"
              >
                Add More
              </SonarButton>
            </div>
          </GlassCard>

          {/* File List */}
          <div className="space-y-2">
            {selectedFiles.map((file) => (
              <GlassCard key={file.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="p-2 rounded-sonar bg-sonar-blue/10">
                      <Volume2 className="w-5 h-5 text-sonar-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-mono text-sm text-sonar-highlight-bright truncate">
                        {file.file.name}
                      </h4>
                      <div className="flex items-center space-x-3 text-xs text-sonar-highlight/70 font-mono">
                        <span>{formatFileSize(file.file.size)}</span>
                        <span>•</span>
                        <span>{formatDuration(file.duration)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(file.id!)}
                    className={cn(
                      'text-sonar-highlight/50 hover:text-sonar-coral',
                      'transition-colors p-2 rounded-sonar',
                      'focus:outline-none focus:ring-2 focus:ring-sonar-coral ml-2'
                    )}
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Continue Button */}
          {onContinue && selectedFiles.length > 0 && (
            <div className="flex justify-end mt-4">
              <SonarButton
                variant="primary"
                onClick={() => {
                  console.log('[FileUploadStep] Continue button clicked with', selectedFiles.length, 'files');
                  onContinue();
                }}
                disabled={isProcessing}
              >
                Continue with {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
              </SonarButton>
            </div>
          )}
        </>
      )}

      {/* Single File Preview (Backwards Compatibility) */}
      {!multiFile && audioFile && (
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-3 rounded-sonar bg-sonar-signal/10">
                  <Volume2 className="w-6 h-6 text-sonar-signal" />
                </div>

                <div className="flex-1">
                  <h3 className="font-mono text-lg text-sonar-highlight-bright mb-1">
                    {audioFile.file.name}
                  </h3>
                  <div className="flex items-center space-x-4 text-sm text-sonar-highlight/70 font-mono">
                    <span>{formatFileSize(audioFile.file.size)}</span>
                    <span>•</span>
                    <span>{formatDuration(audioFile.duration)}</span>
                    <span>•</span>
                    <span className="uppercase">
                      {audioFile.file.type.split('/')[1]}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  if (audioFile.preview) {
                    URL.revokeObjectURL(audioFile.preview);
                  }
                  onFileSelected(null);
                }}
                className={cn(
                  'text-sonar-highlight/50 hover:text-sonar-coral',
                  'transition-colors p-2 rounded-sonar',
                  'focus:outline-none focus:ring-2 focus:ring-sonar-coral'
                )}
                aria-label="Remove file"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Audio Player */}
            {audioFile.preview && (
              <audio
                controls
                src={audioFile.preview}
                className="w-full rounded-sonar"
                style={{
                  filter: 'hue-rotate(180deg) saturate(3)',
                }}
              />
            )}
          </div>
        </GlassCard>
      )}

      {/* Validation Error */}
      {validationError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-4 rounded-sonar',
            'bg-sonar-coral/10 border border-sonar-coral',
            'text-sonar-coral font-mono text-sm'
          )}
        >
          {validationError}
        </motion.div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sonar-highlight/70 font-mono"
        >
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-sonar-signal mb-2" />
          <p>Processing audio file...</p>
        </motion.div>
      )}

      {/* Info Box */}
      <GlassCard className="bg-sonar-blue/5">
        <div className="flex items-start space-x-3">
          <File className="w-5 h-5 text-sonar-blue mt-0.5 flex-shrink-0" />
          <div className="text-sm text-sonar-highlight/80 space-y-2">
            <p className="font-mono font-semibold text-sonar-blue">
              Privacy & Security
            </p>
            <p>
              Your audio will be encrypted client-side using Mysten Seal before
              upload. Only you and authorized buyers will have access to the
              full dataset.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* High-Quality Audio Guidance */}
      {multiFile && displayFiles.length === 0 && (
        <GlassCard className="bg-sonar-signal/5">
          <div className="flex items-start space-x-3">
            <Volume2 className="w-5 h-5 text-sonar-signal mt-0.5 flex-shrink-0" />
            <div className="text-sm text-sonar-highlight/80 space-y-2">
              <p className="font-mono font-semibold text-sonar-signal">
                High-Quality Audio Support
              </p>
              <p>
                We support studio-quality audio up to 13 GiB per file. This includes:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Uncompressed WAV at any sample rate (44.1kHz - 192kHz)</li>
                <li>24-bit and 32-bit float recordings</li>
                <li>FLAC lossless compression (recommended for faster uploads)</li>
                <li>No limit on total dataset size - upload as many files as needed</li>
              </ul>
              <p className="text-xs text-sonar-highlight/60 mt-2">
                ⏱️ Note: Large files (5GB+) may take 10-20 minutes to upload and encrypt.
              </p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
