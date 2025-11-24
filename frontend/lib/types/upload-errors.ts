/**
 * Structured error types for upload pipeline diagnostics
 * Helps distinguish between client validation, edge route validation, and Walrus errors
 */

export type UploadErrorType =
  | "validation_error" // Client or edge route validation failed
  | "walrus_error" // Walrus publisher rejected the request
  | "network_error" // Network timeout or connection issue
  | "authentication_error" // Blockberry API key or auth issue
  | "unknown"; // Unknown error

export type UploadErrorCode =
  // Client validation (100-199)
  | "FILE_MISSING"
  | "FILE_TOO_LARGE"
  | "SEAL_POLICY_MISSING"
  | "INVALID_METADATA"

  // Edge route validation (200-299)
  | "EDGE_NO_FILE"
  | "EDGE_INVALID_FILE_TYPE"
  | "EDGE_MISSING_SEAL_POLICY"
  | "EDGE_FILE_TOO_LARGE"

  // Walrus errors (300-399)
  | "WALRUS_INVALID_FORMAT"
  | "WALRUS_ENCODING_ERROR"
  | "WALRUS_STORAGE_ERROR"
  | "WALRUS_BAD_REQUEST"
  | "WALRUS_BLOB_NOT_AVAILABLE"

  // Authentication (400-499)
  | "AUTH_INVALID_KEY"
  | "AUTH_UNAUTHORIZED"

  // Network (500-599)
  | "NETWORK_TIMEOUT"
  | "NETWORK_CONNECTION_ERROR"

  // Unknown
  | "UNKNOWN";

export interface UploadError {
  /** Error classification */
  type: UploadErrorType;

  /** Machine-readable error code */
  code: UploadErrorCode;

  /** Human-readable error message */
  message: string;

  /** Additional error details (raw response, etc.) */
  details?: string;

  /** HTTP status code if applicable */
  httpStatus?: number;

  /** Whether the operation is retryable */
  retryable: boolean;

  /** Which attempt failed (if from retry logic) */
  attempt?: number;

  /** Maximum retry attempts (if from retry logic) */
  maxAttempts?: number;
}

/**
 * Parse a 400 error response and return structured error details
 */
export function parseUploadError(
  status: number,
  response: any,
  context: "client" | "edge" | "walrus",
): UploadError {
  const errorMessage = response?.error || response?.details || "Unknown error";
  const isRetryable = status >= 500 || status === 408 || status === 429; // Server errors, timeouts, rate limit

  switch (context) {
    case "client": {
      if (errorMessage.includes("File size exceeds 1GB")) {
        return {
          type: "validation_error",
          code: "FILE_TOO_LARGE",
          message: errorMessage,
          retryable: false,
        };
      }
      if (errorMessage.includes("seal_policy_id")) {
        return {
          type: "validation_error",
          code: "SEAL_POLICY_MISSING",
          message: "Seal policy ID is required for encryption",
          retryable: false,
        };
      }
      break;
    }

    case "edge": {
      if (errorMessage.includes("No file")) {
        return {
          type: "validation_error",
          code: "EDGE_NO_FILE",
          message: "File is required for upload",
          httpStatus: 400,
          retryable: false,
        };
      }
      if (errorMessage.includes("seal_policy_id")) {
        return {
          type: "validation_error",
          code: "EDGE_MISSING_SEAL_POLICY",
          message: "Seal policy ID is required in request",
          httpStatus: 400,
          retryable: false,
        };
      }
      if (errorMessage.includes("File too large")) {
        return {
          type: "validation_error",
          code: "EDGE_FILE_TOO_LARGE",
          message: errorMessage,
          httpStatus: 400,
          retryable: false,
        };
      }
      break;
    }

    case "walrus": {
      if (status === 400 || status === 422) {
        if (errorMessage.includes("encoding")) {
          return {
            type: "walrus_error",
            code: "WALRUS_ENCODING_ERROR",
            message: "Invalid blob encoding format",
            details: errorMessage,
            httpStatus: status,
            retryable: false,
          };
        }
        if (
          errorMessage.includes("storage") ||
          errorMessage.includes("persist")
        ) {
          return {
            type: "walrus_error",
            code: "WALRUS_STORAGE_ERROR",
            message: "Walrus storage error",
            details: errorMessage,
            httpStatus: status,
            retryable: true, // Might be transient
          };
        }
        return {
          type: "walrus_error",
          code: "WALRUS_BAD_REQUEST",
          message: "Walrus publisher rejected the request",
          details: errorMessage,
          httpStatus: 400,
          retryable: false,
        };
      }

      if (status === 401 || status === 403) {
        return {
          type: "authentication_error",
          code: "AUTH_UNAUTHORIZED",
          message: "Authentication failed with Walrus/Blockberry",
          details: "Check BLOCKBERRY_API_KEY configuration",
          httpStatus: status,
          retryable: false,
        };
      }

      if (status >= 500) {
        return {
          type: "walrus_error",
          code: "WALRUS_STORAGE_ERROR",
          message: "Walrus publisher error (server issue)",
          details: errorMessage,
          httpStatus: status,
          retryable: true,
        };
      }
      break;
    }
  }

  // Fallback for unknown errors
  return {
    type: "unknown",
    code: "UNKNOWN",
    message: errorMessage || "Unknown upload error",
    details: response?.details || JSON.stringify(response),
    httpStatus: status,
    retryable: isRetryable,
  };
}

/**
 * Format an UploadError for display to user
 */
export function formatUploadErrorForUser(error: UploadError): string {
  switch (error.code) {
    case "FILE_TOO_LARGE":
      return "File is too large. Maximum size is 1GB.";

    case "SEAL_POLICY_MISSING":
    case "EDGE_MISSING_SEAL_POLICY":
      return "Encryption setup incomplete. Please restart the upload.";

    case "WALRUS_ENCODING_ERROR":
      return "File format not supported by storage backend.";

    case "WALRUS_STORAGE_ERROR":
      return "Storage backend temporary issue. Please retry.";

    case "WALRUS_BLOB_NOT_AVAILABLE":
      return "Upload registered but blob not available on storage network. This may be a temporary issue - please retry or contact support if it persists.";

    case "AUTH_UNAUTHORIZED":
      return "Storage backend authentication failed. Please contact support.";

    case "NETWORK_TIMEOUT":
      return "Upload timed out. Please check your connection and retry.";

    case "NETWORK_CONNECTION_ERROR":
      return "Network connection failed. Please check your internet and retry.";

    default:
      return error.message || "Upload failed. Please try again.";
  }
}
