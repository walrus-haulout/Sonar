/**
 * API Request/Response Types
 * Type definitions for all API calls in the upload flow
 */

import {
  DatasetMetadata,
  VerificationStage,
  AudioQualityMetadata,
} from './upload';

// Verification API Types

export interface VerifyAudioRequest {
  metadata: DatasetMetadata;
  transcript?: string;
}

export interface VerificationStatusResponse {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage: VerificationStage['name'];
  stages: VerificationStage[];
  progress: number;
  transcript?: string;
  qualityScore?: number;
  safetyPassed?: boolean;
  insights?: string[];
  errors?: string[];
  approved?: boolean;
  updatedAt: number;
}

// Storage API Types

export interface FileUploadMetadata {
  file_index: number;
  seal_policy_id: string;
  blob_id: string;
  preview_blob_id: string | null;
  duration_seconds: number;
  mime_type: string;
  preview_mime_type: string | null;
}

export interface VerificationStorageData {
  verification_id: string;
  quality_score?: number;
  safety_passed?: boolean;
  verified_at: string;
}

export interface StoreSealMetadataRequest {
  files: FileUploadMetadata[];
  verification: VerificationStorageData | null;
  metadata: DatasetMetadata;
}

export interface StoreSealMetadataResponse {
  success: boolean;
  datasetId?: string;
  message?: string;
  error?: string;
}

// Analysis API Types

export interface AnalysisRequest {
  metadata: DatasetMetadata;
  transcript: string;
  audioMetadata?: {
    duration: number;
    fileSize: number;
    format: string;
  };
}

export interface AnalysisResponse {
  approved: boolean;
  qualityScore: number;
  safetyPassed: boolean;
  insights: string[];
  suggestedTags?: string[];
  suggestedLanguages?: string[];
}

// Error Response Type

export interface ApiErrorResponse {
  error: string;
  details?: string;
  code?: string;
}
