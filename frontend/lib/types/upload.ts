/**
 * Upload Wizard Types
 * Type definitions for the dataset upload flow
 */

export type UploadStep =
  | "file-upload"
  | "metadata"
  | "encryption"
  | "verification"
  | "publish"
  | "success";

export interface AudioFile {
  file: File;
  id?: string; // Unique ID for tracking individual files in multi-file uploads
  duration: number;
  waveform?: number[];
  preview?: string;
  mimeType: string;
  // Auto-extracted quality metadata
  extractedQuality?: {
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
    codec?: string;
  };
}

export interface PerFileMetadata {
  fileId: string; // Link to AudioFile
  title?: string; // Individual file title (optional)
  description?: string; // Individual file description (optional)
}

export interface AudioQualityMetadata {
  sampleRate?: number; // Optional - Hz (e.g., 44100, 48000)
  bitDepth?: number; // Optional - bits (16, 24, 32)
  channels?: number; // Optional - 1 (mono), 2 (stereo), etc.
  codec?: string; // Optional - MP3, AAC, FLAC, etc.
  recordingQuality?: "professional" | "high" | "medium" | "low" | "unknown"; // Optional - with 'unknown' option
}

export interface SpeakerInfo {
  id: string;
  role?: string; // host, guest, interviewer, etc.
  ageRange?: string; // 18-25, 26-35, 36-50, 50+
  gender?: string; // male, female, non-binary, prefer-not-to-say
  accent?: string; // native, regional, international
}

export interface SpeakerMetadata {
  speakerCount?: number; // Optional - 1-20
  speakers?: SpeakerInfo[]; // Optional
}

export interface ContentCategorization {
  useCase?: string; // training-data, podcast, music, ambient, interview, lecture, etc.
  contentType?: string; // speech/dialogue, monologue, music, vocals, environmental, sound-effects, field-recording, ambient, mixed
  domain?: string; // technology, healthcare, education, entertainment, etc.
}

export interface DatasetMetadata {
  title: string;
  description: string;
  languages?: string[];
  tags?: string[];
  consent: boolean;
  // Labeling fields - quality/speakers optional
  perFileMetadata?: PerFileMetadata[];
  audioQuality?: AudioQualityMetadata; // Optional - but earns +10% points bonus
  speakers?: SpeakerMetadata; // Optional - but earns +15% points bonus
  categorization?: ContentCategorization;
}

export interface EncryptionResult {
  encryptedBlob: Blob;
  seal_policy_id: string; // Seal identity (hex string) for decryption
  encryptedObjectBcsHex?: string; // BCS-serialized encrypted object (hex) for verifier
  previewBlob?: Blob;
  mimeType?: string;
  previewMimeType?: string;
  metadata: {
    threshold: number;
    packageId?: string; // Optional for encryption, required for decryption
    accessPolicy: string;
    demType: string;
    timestamp: number;
    originalSize: number;
    encryptedSize: number;
    isEnvelope: boolean;
  };
}

// Per-file upload result for multi-file datasets
export interface FileUploadResult {
  file_index: number; // Index within dataset (0, 1, 2, ...) for database storage
  fileId: string; // Matches AudioFile.id
  blobId: string;
  previewBlobId?: string;
  seal_policy_id: string;
  encryptedObjectBcsHex?: string; // BCS-serialized encrypted object (hex) for verifier
  duration: number;
  mimeType?: string;
  previewMimeType?: string;
}

// Legacy single-file upload result (backwards compatible)
export interface WalrusUploadResult {
  blobId: string;
  previewBlobId?: string;
  seal_policy_id: string; // Seal identity for decryption
  encryptedObjectBcsHex?: string; // BCS-serialized encrypted object (hex) for verifier
  // Multi-file dataset support
  files?: FileUploadResult[]; // For multi-file datasets
  bundleDiscountBps?: number; // Basis points (e.g., 2000 = 20%)
  mimeType?: string;
  previewMimeType?: string;
  // User-paid registration support
  txDigest?: string;
  strategy?: "user-paid" | "blockberry";
  // Preview metadata for batch registration
  previewStorageId?: string;
  previewSize?: number;
  previewEncodingType?: string;
  previewDeletable?: boolean;
  // Prototype metadata for legacy support
  prototypeMetadata?: {
    walletCount: number;
    chunkCount: number;
    estimatedChunkSize: number;
  };
}

export interface VerificationStage {
  name:
    | "decryption"
    | "quality"
    | "copyright"
    | "transcription"
    | "analysis"
    | "safety"
    | "finalizing"
    | "completed";
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number; // 0-100
  message?: string;
}

// AI Analysis Output Types
export interface QualityComponent {
  score: number; // 0-1 scale
  reasoning: string; // Explanation of the score
}

export interface QualityAnalysis {
  clarity: QualityComponent;
  contentValue: QualityComponent;
  metadataAccuracy: QualityComponent;
  completeness: QualityComponent;
}

export interface PriceAnalysis {
  basePrice: number; // Base price in SUI (typically 3)
  qualityMultiplier: number; // Quality-based multiplier (e.g., 1.4)
  rarityMultiplier: number; // Rarity-based multiplier (e.g., 1.0)
  finalPrice: number; // Final suggested price (3-10 SUI)
  breakdown: string; // Step-by-step explanation of pricing calculation
}

export interface FileAnalysis {
  fileIndex: number;
  title: string;
  score: number; // 0-1 scale for individual file quality
  summary: string; // One-sentence assessment
  strengths: string[];
  concerns: string[];
  recommendations: string[];
}

export interface CategorizedRecommendations {
  critical?: string[]; // High-priority improvements
  suggested?: string[]; // Recommended improvements
  optional?: string[]; // Nice-to-have enhancements
}

export interface AnalysisOutput {
  qualityScore: number; // Overall quality (0-1 scale)
  suggestedPrice: number; // Suggested price in SUI (3-10)
  safetyPassed: boolean;
  overallSummary?: string; // 2-3 sentence narrative about audio quality
  qualityAnalysis?: QualityAnalysis; // Detailed breakdown of quality components
  priceAnalysis?: PriceAnalysis; // Transparent pricing breakdown
  insights: string[]; // Key insights about the dataset
  concerns?: string[]; // Quality concerns
  recommendations?: CategorizedRecommendations | string[]; // Categorized or flat recommendations
  fileAnalyses?: FileAnalysis[]; // Per-file insights if multi-file dataset
}

export interface VerificationSession {
  stage: VerificationStage["name"];
  progress: number;
  state: "pending" | "processing" | "completed" | "failed";
  approved?: boolean;
  qualityScore?: number;
  safetyPassed?: boolean;
  analysis?: { insights?: string[] };
  errors?: string[];
}

export interface VerificationResult {
  id: string;
  state: "pending" | "processing" | "completed" | "failed";
  currentStage: VerificationStage["name"];
  stages: VerificationStage[];
  transcript?: string;
  qualityScore?: number;
  suggestedPrice?: number; // AI-suggested price in SUI (3-10 range)
  safetyPassed?: boolean;
  insights?: string[];
  analysis?: AnalysisOutput; // Full enhanced AI analysis output
  error?: string;
  updatedAt: number;
}

export interface PublishResult {
  txDigest: string;
  datasetId: string;
  confirmed: boolean;
}

export interface UploadWizardState {
  step: UploadStep;
  audioFile: AudioFile | null; // Kept for backwards compatibility (single file)
  audioFiles: AudioFile[]; // Multi-file support
  metadata: DatasetMetadata | null;
  encryption: EncryptionResult | null;
  walrusUpload: WalrusUploadResult | null;
  verification: VerificationResult | null;
  publish: PublishResult | null;
  error: string | null;
}
