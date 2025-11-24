/**
 * Toast notification utilities
 * Wrapper around Sonner for consistent toast behavior
 */

import { toast } from 'sonner';

/**
 * Show a success toast
 */
export function toastSuccess(message: string, description?: string): void {
  toast.success(message, {
    description,
  });
}

/**
 * Show an error toast
 */
export function toastError(message: string, description?: string): void {
  toast.error(message, {
    description,
  });
}

/**
 * Show a loading toast
 */
export function toastLoading(message: string, description?: string): string | number {
  return toast.loading(message, { description });
}

/**
 * Show a promise-based toast (auto-transitions from loading to success/error)
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: Error) => string);
  }
): Promise<T> {
  return toast.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: messages.error,
  }) as unknown as Promise<T>;
}

/**
 * Show an info toast
 */
export function toastInfo(message: string, description?: string): void {
  toast(message, {
    description,
  });
}

/**
 * Dismiss all toasts
 */
export function dismissAllToasts(): void {
  toast.dismiss();
}

/**
 * Dismiss a specific toast
 */
export function dismissToast(toastId: string | number): void {
  toast.dismiss(toastId);
}
