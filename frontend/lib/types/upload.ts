/**
 * Upload Wizard Types
 * Type definitions for the dataset upload flow
 */

export type UploadStep =
  | 'file-upload'
  | 'metadata'
  | 'encryption'
  | 'verification'
  | 'publish'
  | 'success';

export interface AudioFile {
  file: File;
  duration: number;
  waveform?: number[];
  preview?: string;
  id?: string; // Unique ID for tracking individual files in multi-file uploads
}

export interface DatasetMetadata {
  title: string;
  description: string;
  languages: string[];
  tags: string[];
  consent: boolean;
}

export interface EncryptionResult {
  encryptedBlob: Blob;
  seal_policy_id: string; // Seal identity (hex string) for decryption
  previewBlob?: Blob;
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
  duration: number;
}

// Legacy single-file upload result (backwards compatible)
export interface WalrusUploadResult {
  blobId: string;
  previewBlobId?: string;
  seal_policy_id: string; // Seal identity for decryption
  // Multi-file dataset support
  files?: FileUploadResult[]; // For multi-file datasets
  bundleDiscountBps?: number; // Basis points (e.g., 2000 = 20%)
}

export interface VerificationStage {
  name: 'transcription' | 'analysis' | 'safety';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  message?: string;
}

export interface VerificationResult {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage: VerificationStage['name'];
  stages: VerificationStage[];
  transcript?: string;
  qualityScore?: number;
  safetyPassed?: boolean;
  insights?: string[];
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
