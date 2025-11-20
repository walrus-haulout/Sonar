'use client';

import { useEffect } from 'react';

export function DeploymentGuard() {
    useEffect(() => {
        // Check if we are in the browser
        if (typeof window === 'undefined') return;

        // Check for the 'dpl' query parameter which causes sticky sessions to stale deployments
        if (window.location.search.includes('dpl=')) {
            try {
                const url = new URL(window.location.href);
                // Delete the 'dpl' parameter
                url.searchParams.delete('dpl');

                console.log('[DeploymentGuard] Detected stale deployment parameter. Redirecting to clean URL:', url.toString());

                // Force a hard replace to clear any sticky session state
                window.location.replace(url.toString());
            } catch (e) {
                console.error('[DeploymentGuard] Failed to sanitize URL:', e);
            }
        }
    }, []);

    return null;
}
