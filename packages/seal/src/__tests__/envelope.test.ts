/**
 * Unit Tests for Envelope Versioning
 * Tests versioned envelope format, parsing, and backwards compatibility
 */

import { describe, it, expect } from 'vitest';
import {
  buildEnvelopeWithVersion,
  parseEnvelopeWithVersion,
  isVersionedEnvelope,
  migrateToVersionedEnvelope,
} from '../envelope';
import * as fc from 'fast-check';

describe('Envelope Versioning', () => {
  describe('buildEnvelopeWithVersion', () => {
    it('should build envelope with version byte', () => {
      const sealedKey = new Uint8Array(300);
      const encryptedData = new Uint8Array(1000);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedData);

      // Check version byte (should be 1 for current version)
      expect(envelope[0]).toBe(1);

      // Check total size
      expect(envelope.length).toBe(1 + 4 + sealedKey.length + encryptedData.length);
    });

    it('should include key length in bytes 1-4', () => {
      const sealedKey = new Uint8Array(624);
      const encryptedData = new Uint8Array(500);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedData);

      // Read key length (little-endian)
      const view = new DataView(envelope.buffer, 1, 4);
      const keyLength = view.getUint32(0, true);

      expect(keyLength).toBe(624);
    });

    it('should embed sealed key and encrypted data correctly', () => {
      const sealedKey = new Uint8Array([1, 2, 3, 4, 5]);
      const encryptedData = new Uint8Array([10, 20, 30, 40]);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedData);

      // Check sealed key at bytes 5+
      const keyStart = 5;
      for (let i = 0; i < sealedKey.length; i++) {
        expect(envelope[keyStart + i]).toBe(sealedKey[i]);
      }

      // Check encrypted data
      const dataStart = 5 + sealedKey.length;
      for (let i = 0; i < encryptedData.length; i++) {
        expect(envelope[dataStart + i]).toBe(encryptedData[i]);
      }
    });

    it('should reject sealed keys < 150 bytes', () => {
      const sealedKey = new Uint8Array(100);
      const encryptedData = new Uint8Array(500);

      expect(() => buildEnvelopeWithVersion(sealedKey, encryptedData)).toThrow();
    });

    it('should reject sealed keys > 800 bytes', () => {
      const sealedKey = new Uint8Array(1000);
      const encryptedData = new Uint8Array(500);

      expect(() => buildEnvelopeWithVersion(sealedKey, encryptedData)).toThrow();
    });

    it('should accept sealed keys at boundaries: 150 and 800', () => {
      const encrypted = new Uint8Array(100);

      expect(() => buildEnvelopeWithVersion(new Uint8Array(150), encrypted)).not.toThrow();
      expect(() => buildEnvelopeWithVersion(new Uint8Array(800), encrypted)).not.toThrow();
    });
  });

  describe('parseEnvelopeWithVersion', () => {
    it('should parse versioned envelope correctly', () => {
      const sealedKey = new Uint8Array(300);
      sealedKey.fill(5);
      const encryptedData = new Uint8Array(500);
      encryptedData.fill(10);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedData);
      const parsed = parseEnvelopeWithVersion(envelope);

      expect(parsed.version).toBe(1);
      expect(parsed.sealedKey).toEqual(sealedKey);
      expect(parsed.encryptedData).toEqual(encryptedData);
    });

    it('should handle different sealed key sizes', () => {
      const testSizes = [150, 300, 624, 700, 800];

      testSizes.forEach((size) => {
        const sealedKey = new Uint8Array(size);
        const encryptedData = new Uint8Array(1000);

        const envelope = buildEnvelopeWithVersion(sealedKey, encryptedData);
        const parsed = parseEnvelopeWithVersion(envelope);

        expect(parsed.sealedKey.length).toBe(size);
        expect(parsed.encryptedData.length).toBe(1000);
      });
    });

    it('should throw on envelope < 9 bytes', () => {
      const tooSmall = new Uint8Array(5);
      expect(() => parseEnvelopeWithVersion(tooSmall)).toThrow();
    });

    it('should throw on invalid key length in envelope', () => {
      const envelope = new Uint8Array(20);
      const view = new DataView(envelope.buffer, 1, 4);
      // Set invalid key length (> 800)
      view.setUint32(0, 1000, true);

      expect(() => parseEnvelopeWithVersion(envelope)).toThrow();
    });

    it('should throw on unsealed key size outside 150-800 range', () => {
      const envelope = new Uint8Array(20);
      const view = new DataView(envelope.buffer, 1, 4);

      // Test too small
      view.setUint32(0, 100, true);
      expect(() => parseEnvelopeWithVersion(envelope)).toThrow();

      // Test too large
      view.setUint32(0, 900, true);
      expect(() => parseEnvelopeWithVersion(envelope)).toThrow();
    });
  });

  describe('isVersionedEnvelope', () => {
    it('should detect versioned envelope', () => {
      const sealedKey = new Uint8Array(300);
      const encryptedData = new Uint8Array(500);
      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedData);

      expect(isVersionedEnvelope(envelope)).toBe(true);
    });

    it('should reject unversioned envelope (no version byte)', () => {
      const envelope = new Uint8Array(20);
      envelope[0] = 99; // Invalid version number

      expect(isVersionedEnvelope(envelope)).toBe(false);
    });

    it('should reject data too small to be versioned envelope', () => {
      expect(isVersionedEnvelope(new Uint8Array(4))).toBe(false);
    });

    it('should accept envelope with version 1', () => {
      const envelope = new Uint8Array(100);
      envelope[0] = 1; // Version 1

      // Set valid key length
      const view = new DataView(envelope.buffer, 1, 4);
      view.setUint32(0, 300, true);

      expect(isVersionedEnvelope(envelope)).toBe(true);
    });
  });

  describe('migrateToVersionedEnvelope', () => {
    it('should add version byte to old envelope format', () => {
      // Old format: [4 bytes key length][sealed key][encrypted data]
      const oldEnvelope = new Uint8Array(309);
      const view = new DataView(oldEnvelope.buffer, 0, 4);
      view.setUint32(0, 300, true);

      const migrated = migrateToVersionedEnvelope(oldEnvelope);

      expect(migrated[0]).toBe(1); // Version byte
      expect(migrated.length).toBe(oldEnvelope.length + 1);

      // Check key length moved to bytes 1-4
      const newView = new DataView(migrated.buffer, 1, 4);
      expect(newView.getUint32(0, true)).toBe(300);
    });

    it('should preserve sealed key and encrypted data during migration', () => {
      const sealedKey = new Uint8Array(300);
      sealedKey.fill(42);
      const encryptedData = new Uint8Array(500);
      encryptedData.fill(84);

      // Build old format envelope
      const oldEnvelope = new Uint8Array(309);
      const view = new DataView(oldEnvelope.buffer, 0, 4);
      view.setUint32(0, 300, true);
      oldEnvelope.set(sealedKey, 4);
      oldEnvelope.set(encryptedData, 304);

      const migrated = migrateToVersionedEnvelope(oldEnvelope);
      const parsed = parseEnvelopeWithVersion(migrated);

      expect(parsed.sealedKey).toEqual(sealedKey);
      expect(parsed.encryptedData).toEqual(encryptedData);
    });

    it('should handle old envelope with various sealed key sizes', () => {
      const testSizes = [150, 300, 624, 800];

      testSizes.forEach((size) => {
        const oldEnvelope = new Uint8Array(size + 4 + 100);
        const view = new DataView(oldEnvelope.buffer, 0, 4);
        view.setUint32(0, size, true);

        const migrated = migrateToVersionedEnvelope(oldEnvelope);

        expect(() => parseEnvelopeWithVersion(migrated)).not.toThrow();
        const parsed = parseEnvelopeWithVersion(migrated);
        expect(parsed.sealedKey.length).toBe(size);
      });
    });

    it('should reject old envelope with invalid key length', () => {
      const oldEnvelope = new Uint8Array(20);
      const view = new DataView(oldEnvelope.buffer, 0, 4);
      view.setUint32(0, 1000, true); // Invalid

      expect(() => migrateToVersionedEnvelope(oldEnvelope)).toThrow();
    });
  });

  describe('Envelope Property Tests', () => {
    it('should roundtrip any valid sealed key size', () => {
      fc.assert(
        fc.property(fc.integer({ min: 150, max: 800 }), (keyLength) => {
          const sealedKey = new Uint8Array(keyLength);
          const encryptedData = new Uint8Array(1000);

          const envelope = buildEnvelopeWithVersion(sealedKey, encryptedData);
          const parsed = parseEnvelopeWithVersion(envelope);

          return (
            parsed.version === 1 &&
            parsed.sealedKey.length === keyLength &&
            parsed.encryptedData.length === 1000
          );
        })
      );
    });

    it('should maintain data integrity through build-parse cycle', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 150, max: 800 }),
          fc.uint8Array({ minLength: 100, maxLength: 1000 })
        ),
          (keyLength, encryptedDataArray) => {
          const sealedKey = new Uint8Array(keyLength);
          sealedKey.fill(42);

          const envelope = buildEnvelopeWithVersion(sealedKey, encryptedDataArray);
          const parsed = parseEnvelopeWithVersion(envelope);

          // Check integrity
          return (
            parsed.sealedKey.every((b, i) => b === sealedKey[i]) &&
            parsed.encryptedData.every((b, i) => b === encryptedDataArray[i])
          );
        }
      );
    });
  });

  describe('Backwards Compatibility', () => {
    it('should detect and convert old envelope format', () => {
      const oldFormat = new Uint8Array(504);
      const view = new DataView(oldFormat.buffer, 0, 4);
      view.setUint32(0, 300, true);

      expect(isVersionedEnvelope(oldFormat)).toBe(false);

      const migrated = migrateToVersionedEnvelope(oldFormat);
      expect(isVersionedEnvelope(migrated)).toBe(true);
    });

    it('should support seamless version upgrades', () => {
      // Simulate receiving an old format from storage
      const oldEnvelope = new Uint8Array(404);
      const view = new DataView(oldEnvelope.buffer, 0, 4);
      view.setUint32(0, 300, true);

      // Upgrade to versioned format
      const upgraded = migrateToVersionedEnvelope(oldEnvelope);

      // Should now parse as versioned
      const parsed = parseEnvelopeWithVersion(upgraded);
      expect(parsed.version).toBe(1);
      expect(parsed.sealedKey.length).toBe(300);
    });
  });
});
