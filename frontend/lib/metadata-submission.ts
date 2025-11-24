/**
 * Metadata submission utility with retry logic
 * Handles submitting dataset metadata to backend with authentication
 */

import type {
  DatasetMetadata,
  VerificationResult,
  WalrusUploadResult,
} from "@/lib/types/upload";
import { toastError, toastSuccess, toastLoading, dismissToast } from "@/lib/toast";

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds
  jitterFactor: 0.2,
};

/**
 * Calculate exponential backoff delay with jitter
 */
function getBackoffDelay(attempt: number): number {
  const exponential = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
  const capped = Math.min(exponential, RETRY_CONFIG.maxDelay);
  const jitter = capped * RETRY_CONFIG.jitterFactor * Math.random();
  return Math.floor(capped + jitter);
}

/**
 * Retry wrapper with exponential backoff and user feedback
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = RETRY_CONFIG.maxRetries,
  context?: string,
): Promise<T> {
  let lastError: Error | undefined;
  let toastId: string | number | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Show retry toast
        const contextMsg = context ? ` (${context})` : "";
        toastId = toastLoading("Retrying...", `Attempt ${attempt + 1}/${maxRetries}${contextMsg}`);
      }

      const result = await fn();

      // Dismiss retry toast on success
      if (toastId !== undefined) dismissToast(toastId);

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      console.error(
        `[MetadataSubmission] Attempt ${attempt + 1}/${maxRetries} failed:`,
        lastError.message,
      );

      if (attempt < maxRetries - 1) {
        const delay = getBackoffDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Dismiss retry toast on final failure
        if (toastId !== undefined) dismissToast(toastId);
      }
    }
  }

  throw lastError;
}

/**
 * Submit metadata to backend with authentication and retry
 */
export async function submitMetadataWithAuth(
  datasetId: string,
  metadata: {
    files: Array<{
      file_index: number;
      seal_policy_id: string;
      blob_id: string;
      preview_blob_id: string | null;
      duration_seconds: number;
      mime_type: string;
      preview_mime_type: string | null;
    }>;
    verification: {
      verification_id: string;
      quality_score: number;
      safety_passed: boolean;
      verified_at?: string;
      transcript?: string;
      detected_languages?: string[];
      analysis?: any;
      transcription_details?: any;
      quality_breakdown?: any;
    } | null;
    metadata: any;
  },
  getAuthHeader: () => string | null,
): Promise<void> {
  const toastId = toastLoading("Saving metadata...", "This may take a few seconds");

  try {
    await retryWithBackoff(
      async () => {
        const authHeader = getAuthHeader();
        if (!authHeader) {
          throw new Error("Not authenticated. Please reconnect your wallet.");
        }

        const response = await fetch(`/api/datasets/${datasetId}/seal-metadata`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(metadata),
        });

        if (!response.ok) {
          let errorMessage = "Metadata submission failed";
          try {
            const error = await response.json();
            errorMessage = error.message || error.error || errorMessage;
          } catch {
            errorMessage = `${errorMessage} (${response.status} ${response.statusText})`;
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log("[MetadataSubmission] Success:", result);
        return result;
      },
      RETRY_CONFIG.maxRetries,
      "metadata-submission",
    );

    if (toastId !== undefined) dismissToast(toastId);
    toastSuccess(
      "Metadata saved!",
      "Your dataset is now searchable on the marketplace",
    );
  } catch (error: any) {
    if (toastId !== undefined) dismissToast(toastId);
    console.error("[MetadataSubmission] Failed after retries:", error);
    toastError(
      "Failed to save metadata",
      error.message || "Please try again or contact support",
    );
    throw error;
  }
}

/**
 * Build metadata payload from upload result and verification
 * Note: This is a helper function - PublishStep handles its own payload construction
 */
export function buildMetadataPayload(params: {
  datasetId: string;
  walrusUpload: WalrusUploadResult;
  verification: VerificationResult;
  metadata: DatasetMetadata;
}) {
  const { walrusUpload, verification, metadata } = params;

  // Build files array from single or multi-file upload
  const files =
    walrusUpload.files && walrusUpload.files.length > 0
      ? walrusUpload.files.map((file) => ({
          file_index: file.file_index || 0,
          seal_policy_id: file.seal_policy_id,
          blob_id: file.blobId,
          preview_blob_id: file.previewBlobId || null,
          duration_seconds: Math.max(1, Math.floor(file.duration)),
          mime_type: file.mimeType || walrusUpload.mimeType || "audio/mpeg",
          preview_mime_type: file.previewMimeType || walrusUpload.previewMimeType || null,
        }))
      : [
          {
            file_index: 0,
            seal_policy_id: walrusUpload.seal_policy_id,
            blob_id: walrusUpload.blobId,
            preview_blob_id: walrusUpload.previewBlobId || null,
            duration_seconds: 60, // Fallback default
            mime_type: walrusUpload.mimeType || "audio/mpeg",
            preview_mime_type: walrusUpload.previewMimeType || null,
          },
        ];

  return {
    files,
    verification: {
      verification_id: verification.id,
      quality_score: verification.qualityScore,
      safety_passed: verification.safetyPassed,
      transcript: verification.transcript,
      detected_languages: verification.detectedLanguages,
      analysis: verification.analysis,
      transcription_details: verification.transcriptionDetails,
      quality_breakdown: verification.qualityBreakdown,
    },
    metadata,
  };
}
