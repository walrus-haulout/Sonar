/**
 * Retry a transaction query with exponential backoff
 * Handles cases where transaction isn't indexed immediately on mainnet
 */
export async function retryTransactionQuery<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastRetry = i === maxRetries - 1;
      const isNotFoundError = error?.message?.includes("Could not find");

      if (isLastRetry || !isNotFoundError) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, i);
      console.log(
        `[TransactionUtils] Transaction not found, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Retry limit exceeded");
}
