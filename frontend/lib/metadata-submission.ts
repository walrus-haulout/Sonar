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
        toastId = toastLoading(
          `Retrying...`,
          `Attempt ${attempt + 1}/${maxRetries}${contextMsg}`,
        );
      }

      const result = await fn();

      // Dismiss retry toast on success
      if (toastId) dismissToast(toastId);

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
        if (toastId) dismissToast(toastId);
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
      preview_blob_id: string;
      duration_seconds: number;
      mime_type: string;
      preview_mime_type?: string;
    }>;
    verification: {
      verification_id: string;
      quality_score: number;
      safety_passed: boolean;
      transcript?: string;
      detected_languages?: string[];
      analysis?: any;
      transcription_details?: any;
      quality_breakdown?: any;
    };
    metadata: DatasetMetadata;
  },
  getAuthHeader: () => string | null,
): Promise<void> {
  const toastId = toastLoading(
    "Saving metadata...",
    "This may take a few seconds",
  );

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

    dismissToast(toastId);
    toastSuccess(
      "Metadata saved!",
      "Your dataset is now searchable on the marketplace",
    );
  } catch (error: any) {
    dismissToast(toastId);
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
 */
export function buildMetadataPayload(params: {
  datasetId: string;
  walrusUploads: WalrusUploadResult[];
  verification: VerificationResult;
  metadata: DatasetMetadata;
}) {
  const { walrusUploads, verification, metadata } = params;

  return {
    files: walrusUploads.map((upload, index) => ({
      file_index: index,
      seal_policy_id: upload.seal_policy_id,
      blob_id: upload.blobId,
      preview_blob_id: upload.previewBlobId,
      duration_seconds: upload.durationSeconds,
      mime_type: upload.mimeType,
      preview_mime_type: upload.previewMimeType,
    })),
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
