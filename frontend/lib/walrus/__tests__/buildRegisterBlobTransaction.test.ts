import { buildRegisterBlobTransaction } from '../buildRegisterBlobTransaction';
import { describe, it, expect } from 'bun:test';

// Mock environment variables
process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID = '0x123';
process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT = '0x456';

describe('buildRegisterBlobTransaction', () => {
    it('should handle base64url blobId without throwing', () => {
        const blobId = 'AsnZ3ALiO0f2YFHpF1fa-PKhCNnzIwtpPOOKZgG9arA';

        // This should not throw now
        const tx = buildRegisterBlobTransaction({
            blobId,
            size: 100,
            epochs: 1,
            ownerAddress: '0x789',
        });

        expect(tx).toBeDefined();
    });
});
