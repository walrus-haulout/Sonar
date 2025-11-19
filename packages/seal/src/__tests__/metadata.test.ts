/**
 * Unit Tests for Metadata Verification
 * Tests hash-based integrity checking and metadata validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashMetadata,
  verifyMetadataHash,
  addHashToMetadata,
  createEncryptionMetadata,
  validateMetadata,
  hexToBuffer,
  type EncryptionMetadata,
} from '../metadata';
import * as fc from 'fast-check';

describe('Metadata Verification', () => {
  describe('hashMetadata', () => {
    it('should generate SHA-256 hash', async () => {
      const metadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: Math.floor(Date.now() / 1000),
      };

      const hash = await hashMetadata(metadata);

      // SHA-256 produces 64 character hex string
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same metadata', async () => {
      const metadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const hash1 = await hashMetadata(metadata);
      const hash2 = await hashMetadata(metadata);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different metadata', async () => {
      const metadata1 = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const metadata2 = {
        sealPolicyId: 'policy-2',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const hash1 = await hashMetadata(metadata1);
      const hash2 = await hashMetadata(metadata2);

      expect(hash1).not.toBe(hash2);
    });

    it('should be sensitive to all fields', async () => {
      const baseMetadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const baseHash = await hashMetadata(baseMetadata);

      // Test each field
      const changes = [
        { ...baseMetadata, sealPolicyId: 'policy-2' },
        { ...baseMetadata, packageId: 'package-2' },
        { ...baseMetadata, identity: 'user-2' },
        { ...baseMetadata, originalSize: 2000 },
        { ...baseMetadata, encryptedSize: 3000 },
        { ...baseMetadata, encryptedAt: 9876543210 },
      ];

      for (const changed of changes) {
        const changedHash = await hashMetadata(changed);
        expect(changedHash).not.toBe(baseHash);
      }
    });

    it('should handle optional fields', async () => {
      const metadata1 = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
        mimeType: 'audio/mp3',
      };

      const metadata2 = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const hash1 = await hashMetadata(metadata1);
      const hash2 = await hashMetadata(metadata2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyMetadataHash', () => {
    it('should verify correct hash', async () => {
      const baseMetadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const metadataWithHash = await addHashToMetadata(baseMetadata);

      const isValid = await verifyMetadataHash(metadataWithHash);
      expect(isValid).toBe(true);
    });

    it('should reject tampered metadata', async () => {
      const baseMetadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const metadataWithHash = await addHashToMetadata(baseMetadata);

      // Tamper with data
      const tampered: EncryptionMetadata = {
        ...metadataWithHash,
        originalSize: 2000, // Changed
      };

      const isValid = await verifyMetadataHash(tampered);
      expect(isValid).toBe(false);
    });

    it('should return false if hash missing', async () => {
      const metadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      } as EncryptionMetadata;

      const isValid = await verifyMetadataHash(metadata);
      expect(isValid).toBe(false);
    });

    it('should reject corrupted hash', async () => {
      const baseMetadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const metadataWithHash = await addHashToMetadata(baseMetadata);

      // Corrupt hash
      const corrupted: EncryptionMetadata = {
        ...metadataWithHash,
        metadataHash: 'a'.repeat(64), // Wrong hash
      };

      const isValid = await verifyMetadataHash(corrupted);
      expect(isValid).toBe(false);
    });
  });

  describe('addHashToMetadata', () => {
    it('should add hash to metadata', async () => {
      const metadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        encryptedAt: 1234567890,
      };

      const withHash = await addHashToMetadata(metadata);

      expect(withHash.metadataHash).toBeDefined();
      expect(withHash.metadataHash).toMatch(/^[a-f0-9]{64}$/);
      expect(withHash.sealPolicyId).toBe(metadata.sealPolicyId);
    });

    it('should preserve all metadata fields', async () => {
      const metadata = {
        sealPolicyId: 'policy-1',
        packageId: 'package-1',
        identity: 'user-1',
        originalSize: 1000,
        encryptedSize: 2000,
        mimeType: 'audio/mp3',
        threshold: 3,
        encryptedAt: 1234567890,
      };

      const withHash = await addHashToMetadata(metadata);

      expect(withHash.sealPolicyId).toBe('policy-1');
      expect(withHash.packageId).toBe('package-1');
      expect(withHash.identity).toBe('user-1');
      expect(withHash.originalSize).toBe(1000);
      expect(withHash.encryptedSize).toBe(2000);
      expect(withHash.mimeType).toBe('audio/mp3');
      expect(withHash.threshold).toBe(3);
    });
  });

  describe('createEncryptionMetadata', () => {
    it('should create metadata with timestamp', async () => {
      const before = Math.floor(Date.now() / 1000);

      const metadata = await createEncryptionMetadata(
        'policy-1',
        'package-1',
        'user-1',
        1000,
        2000
      );

      const after = Math.floor(Date.now() / 1000);

      expect(metadata.sealPolicyId).toBe('policy-1');
      expect(metadata.packageId).toBe('package-1');
      expect(metadata.identity).toBe('user-1');
      expect(metadata.originalSize).toBe(1000);
      expect(metadata.encryptedSize).toBe(2000);
      expect(metadata.encryptedAt).toBeGreaterThanOrEqual(before);
      expect(metadata.encryptedAt).toBeLessThanOrEqual(after);
      expect(metadata.metadataHash).toBeDefined();
    });

    it('should include optional mimeType', async () => {
      const metadata = await createEncryptionMetadata(
        'policy-1',
        'package-1',
        'user-1',
        1000,
        2000,
        { mimeType: 'audio/mp3' }
      );

      expect(metadata.mimeType).toBe('audio/mp3');
    });

    it('should include optional threshold', async () => {
      const metadata = await createEncryptionMetadata(
        'policy-1',
        'package-1',
        'user-1',
        1000,
        2000,
        { threshold: 3 }
      );

      expect(metadata.threshold).toBe(3);
    });

    it('should create verifiable metadata', async () => {
      const metadata = await createEncryptionMetadata(
        'policy-1',
        'package-1',
        'user-1',
        1000,
        2000
      );

      const isValid = await verifyMetadataHash(metadata);
      expect(isValid).toBe(true);
    });
  });

  describe('validateMetadata', () => {
    let metadata: EncryptionMetadata;

    beforeEach(async () => {
      metadata = await createEncryptionMetadata(
        'policy-1',
        'package-1',
        'user-1',
        1000,
        2000
      );
    });

    it('should accept valid metadata', async () => {
      const result = await validateMetadata(metadata, 2000);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject if hash verification fails', async () => {
      const tampered: EncryptionMetadata = {
        ...metadata,
        originalSize: 2000,
      };

      const result = await validateMetadata(tampered, 2000);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Metadata hash verification failed');
    });

    it('should reject if blob size too small', async () => {
      const result = await validateMetadata(metadata, 1000);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Blob size mismatch'))).toBe(true);
    });

    it('should reject if timestamp in future', async () => {
      const futureMetadata: EncryptionMetadata = {
        ...metadata,
        encryptedAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour in future
      };

      // Recalculate hash for tampered metadata to pass hash check
      const { metadataHash, ...withoutHash } = futureMetadata;
      const correctHash = await hashMetadata(withoutHash);
      futureMetadata.metadataHash = correctHash;

      const result = await validateMetadata(futureMetadata, 2000);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('future'))).toBe(true);
    });

    it('should reject if metadata older than 1 day', async () => {
      const oldMetadata: EncryptionMetadata = {
        ...metadata,
        encryptedAt: Math.floor(Date.now() / 1000) - 86400 - 3600, // 1 day + 1 hour ago
      };

      // Recalculate hash
      const { metadataHash, ...withoutHash } = oldMetadata;
      const correctHash = await hashMetadata(withoutHash);
      oldMetadata.metadataHash = correctHash;

      const result = await validateMetadata(oldMetadata, 2000);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('older than 1 day'))).toBe(true);
    });

    it('should reject if sealPolicyId missing', async () => {
      const incomplete: EncryptionMetadata = {
        ...metadata,
        sealPolicyId: '',
      };

      const result = await validateMetadata(incomplete, 2000);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('seal policy ID'))).toBe(true);
    });

    it('should reject if packageId missing', async () => {
      const incomplete: EncryptionMetadata = {
        ...metadata,
        packageId: '',
      };

      const result = await validateMetadata(incomplete, 2000);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('package ID'))).toBe(true);
    });

    it('should reject if identity missing', async () => {
      const incomplete: EncryptionMetadata = {
        ...metadata,
        identity: '',
      };

      const result = await validateMetadata(incomplete, 2000);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('identity'))).toBe(true);
    });

    it('should accumulate multiple errors', async () => {
      const invalid: EncryptionMetadata = {
        ...metadata,
        sealPolicyId: '',
        packageId: '',
        originalSize: 5000, // Causes size mismatch
      };

      const result = await validateMetadata(invalid, 2000);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });
  });

  describe('hexToBuffer', () => {
    it('should convert hex string to Uint8Array', () => {
      const hex = 'deadbeef';
      const buffer = hexToBuffer(hex);

      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBe(4);
      expect(buffer[0]).toBe(0xde);
      expect(buffer[1]).toBe(0xad);
      expect(buffer[2]).toBe(0xbe);
      expect(buffer[3]).toBe(0xef);
    });

    it('should handle long hex strings', () => {
      const hex = 'a'.repeat(64); // 32 bytes
      const buffer = hexToBuffer(hex);

      expect(buffer.length).toBe(32);
      expect(buffer.every((b) => b === 0xaa)).toBe(true);
    });

    it('should handle single bytes', () => {
      const hex = 'ff';
      const buffer = hexToBuffer(hex);

      expect(buffer.length).toBe(1);
      expect(buffer[0]).toBe(255);
    });
  });

  describe('Metadata Property Tests', () => {
    it('should create metadata with consistent hashes', () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.integer({ min: 100, max: 100000 }),
          fc.integer({ min: 100, max: 100000 }),
          async (policyId, packageId, identity, origSize, encSize) => {
            const metadata = await createEncryptionMetadata(
              policyId,
              packageId,
              identity,
              origSize,
              encSize
            );

            return await verifyMetadataHash(metadata);
          }
        )
      );
    });

    it('should reject tampered metadata reliably', () => {
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 100000 }),
          async (originalSize) => {
            const metadata = await createEncryptionMetadata(
              'policy',
              'package',
              'user',
              originalSize,
              originalSize * 2
            );

            // Tamper
            const tampered: EncryptionMetadata = {
              ...metadata,
              originalSize: originalSize + 1,
            };

            const isValid = await verifyMetadataHash(tampered);
            return !isValid; // Should be invalid
          }
        )
      );
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle audio file metadata', async () => {
      const metadata = await createEncryptionMetadata(
        'audio-policy-v1',
        '0x1234567890abcdef1234567890abcdef',
        'user@example.com',
        3600000000, // 1 hour of audio
        3600000256, // With encryption overhead
        { mimeType: 'audio/mp3', threshold: 3 }
      );

      const isValid = await verifyMetadataHash(metadata);
      expect(isValid).toBe(true);
    });

    it('should handle very large file metadata', async () => {
      const metadata = await createEncryptionMetadata(
        'large-file-policy',
        'walrus-blob-id',
        'service-account',
        10737418240, // 10GB
        10737418356, // With overhead
        { mimeType: 'application/octet-stream' }
      );

      const isValid = await verifyMetadataHash(metadata);
      expect(isValid).toBe(true);

      const result = await validateMetadata(metadata, 10737418356);
      expect(result.valid).toBe(true);
    });

    it('should track policy rotation', async () => {
      const original = await createEncryptionMetadata(
        'policy-v1',
        'blob-id',
        'user-1',
        1000,
        2000
      );

      const rotated = await createEncryptionMetadata(
        'policy-v2',
        'blob-id-new',
        'user-1',
        1000,
        2000
      );

      // Both should be independently valid
      expect(await verifyMetadataHash(original)).toBe(true);
      expect(await verifyMetadataHash(rotated)).toBe(true);

      // But hashes should differ
      expect(original.metadataHash).not.toBe(rotated.metadataHash);
    });
  });
});
