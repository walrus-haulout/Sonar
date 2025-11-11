/**
 * useAuth hook (DEPRECATED)
 * This hook is deprecated - use wallet signatures directly instead
 *
 * @deprecated Backend authentication removed. Use wallet connection via @mysten/dapp-kit instead.
 */

'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * @deprecated Use useCurrentAccount() from @mysten/dapp-kit instead
 */
export function useAuth(_autoLoad = true) {
  const account = useCurrentAccount();

  // Return stub values for backward compatibility
  const authState: AuthState = {
    isAuthenticated: !!account,
    token: null, // No JWT tokens anymore
    isLoading: false,
    error: null,
  };

  return {
    ...authState,
    login: async () => {
      console.warn('[useAuth] Deprecated: Use wallet connection instead');
    },
    logout: () => {
      console.warn('[useAuth] Deprecated: Disconnect wallet instead');
    },
    isTokenValid: () => !!account, // Return true if wallet connected
    getAuthHeader: () => '', // No auth headers needed
  };
}
