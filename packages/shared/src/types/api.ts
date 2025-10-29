/**
 * API request/response types
 */

/**
 * Standard API error response
 */
export interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard API success response
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  database: boolean;
  walrus: boolean;
}

/**
 * API error codes
 */
export enum ErrorCode {
  // Auth errors
  MISSING_AUTH = 'MISSING_AUTH',
  INVALID_TOKEN = 'INVALID_TOKEN',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  NONCE_EXPIRED = 'NONCE_EXPIRED',
  NONCE_INVALID = 'NONCE_INVALID',

  // Access control
  PURCHASE_REQUIRED = 'PURCHASE_REQUIRED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  ACCESS_DENIED = 'ACCESS_DENIED',

  // Data errors
  DATASET_NOT_FOUND = 'DATASET_NOT_FOUND',
  BLOB_NOT_FOUND = 'BLOB_NOT_FOUND',
  INVALID_REQUEST = 'INVALID_REQUEST',

  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  WALRUS_ERROR = 'WALRUS_ERROR',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * Map error codes to user-friendly messages
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.MISSING_AUTH]: 'Authentication required. Please connect your wallet.',
  [ErrorCode.INVALID_TOKEN]: 'Your session has expired. Please sign in again.',
  [ErrorCode.INVALID_SIGNATURE]: 'Invalid wallet signature. Please try again.',
  [ErrorCode.NONCE_EXPIRED]: 'Authentication challenge expired. Please request a new one.',
  [ErrorCode.NONCE_INVALID]: 'Invalid authentication challenge. Please request a new one.',
  [ErrorCode.PURCHASE_REQUIRED]: 'This dataset requires a purchase to access.',
  [ErrorCode.UNAUTHORIZED]: 'You do not have permission to access this resource.',
  [ErrorCode.ACCESS_DENIED]: 'Access denied.',
  [ErrorCode.DATASET_NOT_FOUND]: 'Dataset not found.',
  [ErrorCode.BLOB_NOT_FOUND]: 'Audio file not found in storage.',
  [ErrorCode.INVALID_REQUEST]: 'Invalid request. Please check your parameters.',
  [ErrorCode.INTERNAL_ERROR]: 'An error occurred on the server. Please try again later.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again later.',
  [ErrorCode.DATABASE_ERROR]: 'Database error. Please try again later.',
  [ErrorCode.WALRUS_ERROR]: 'Storage service error. Please try again later.',
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait before trying again.',
};
