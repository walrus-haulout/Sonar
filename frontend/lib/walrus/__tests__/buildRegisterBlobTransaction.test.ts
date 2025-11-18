import { buildRegisterBlobTransaction } from '../buildRegisterBlobTransaction';
import { describe, it, expect } from 'bun:test';

// Mock environment variables
process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID = '0x123';
process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT = '0x456';

describe('buildRegisterBlobTransaction', () => {
    it('should build transaction with all blob metadata', () => {
        const blobId = 'AsnZ3ALiO0f2YFHpF1fa-PKhCNnzIwtpPOOKZgG9arA';

        const tx = buildRegisterBlobTransaction({
            blobId,
            size: 100,
            encodingType: 'RS2',
            storageId: '0xabcdef123456',
            deletable: true,
        });

        expect(tx).toBeDefined();
    });

    it('should handle missing optional parameters', () => {
        const blobId = 'AsnZ3ALiO0f2YFHpF1fa-PKhCNnzIwtpPOOKZgG9arA';

        const tx = buildRegisterBlobTransaction({
            blobId,
            size: 100,
        });

        expect(tx).toBeDefined();
    });

    it('should warn when root hash is not provided', () => {
        const consoleSpy = console.warn;
        let warnCalled = false;
        console.warn = () => {
            warnCalled = true;
        };

        const blobId = 'AsnZ3ALiO0f2YFHpF1fa-PKhCNnzIwtpPOOKZgG9arA';
        buildRegisterBlobTransaction({ blobId, size: 100 });

        console.warn = consoleSpy;
        expect(warnCalled).toBe(true);
    });
});
