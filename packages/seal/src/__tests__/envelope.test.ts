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
      const encryptedFile = new Uint8Array(1000);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedFile);

      // Check version byte (should be 1 for current version)
      expect(envelope[0]).toBe(1);

      // Check total size
      expect(envelope.length).toBe(1 + 4 + sealedKey.length + encryptedFile.length);
    });

    it('should include key length in bytes 1-4', () => {
      const sealedKey = new Uint8Array(624);
      const encryptedFile = new Uint8Array(500);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedFile);

      // Read key length (little-endian)
      const view = new DataView(envelope.buffer, 1, 4);
      const keyLength = view.getUint32(0, true);

      expect(keyLength).toBe(624);
    });

    it('should embed sealed key and encrypted file correctly', () => {
      const sealedKey = new Uint8Array([1, 2, 3, 4, 5]);
      const encryptedFile = new Uint8Array([10, 20, 30, 40]);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedFile);

      // Check sealed key at bytes 5+
      const keyStart = 5;
      for (let i = 0; i < sealedKey.length; i++) {
        expect(envelope[keyStart + i]).toBe(sealedKey[i]);
      }

      // Check encrypted file
      const fileStart = 5 + sealedKey.length;
      for (let i = 0; i < encryptedFile.length; i++) {
        expect(envelope[fileStart + i]).toBe(encryptedFile[i]);
      }
    });

    it('should build envelopes with valid sealed key sizes', () => {
      const encrypted = new Uint8Array(100);

      // Should not throw for valid sizes
      expect(() => buildEnvelopeWithVersion(new Uint8Array(150), encrypted)).not.toThrow();
      expect(() => buildEnvelopeWithVersion(new Uint8Array(300), encrypted)).not.toThrow();
      expect(() => buildEnvelopeWithVersion(new Uint8Array(800), encrypted)).not.toThrow();
    });
  });

  describe('parseEnvelopeWithVersion', () => {
    it('should parse versioned envelope correctly', () => {
      const sealedKey = new Uint8Array(300);
      sealedKey.fill(5);
      const encryptedFile = new Uint8Array(500);
      encryptedFile.fill(10);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedFile);
      const parsed = parseEnvelopeWithVersion(envelope);

      expect(parsed.version).toBe(1);
      expect(parsed.sealedKey).toEqual(sealedKey);
      expect(parsed.encryptedFile).toEqual(encryptedFile);
    });

    it('should handle different sealed key sizes', () => {
      const testSizes = [150, 300, 624, 700, 800];

      testSizes.forEach((size) => {
        const sealedKey = new Uint8Array(size);
        const encryptedFile = new Uint8Array(1000);

        const envelope = buildEnvelopeWithVersion(sealedKey, encryptedFile);
        const parsed = parseEnvelopeWithVersion(envelope);

        expect(parsed.sealedKey.length).toBe(size);
        expect(parsed.encryptedFile.length).toBe(1000);
      });
    });

    it('should throw on envelope < 9 bytes', () => {
      const tooSmall = new Uint8Array(5);
      expect(() => parseEnvelopeWithVersion(tooSmall)).toThrow();
    });

    it('should throw on invalid key length in envelope', () => {
      const envelope = new Uint8Array(20);
      const view = new DataView(envelope.buffer, 1, 4);
      // Set version byte first
      envelope[0] = 1;
      // Set invalid key length (> 800)
      view.setUint32(0, 1000, true);

      expect(() => parseEnvelopeWithVersion(envelope)).toThrow();
    });

    it('should throw on sealed key size outside 150-800 range', () => {
      const envelope = new Uint8Array(20);
      envelope[0] = 1; // Set version
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
      const envelope = new Uint8Array(400); // Large enough for version + keyLength + 300 byte key + data
      envelope[0] = 1; // Version 1

      // Set valid key length
      const view = new DataView(envelope.buffer, 1, 4);
      view.setUint32(0, 300, true);

      expect(isVersionedEnvelope(envelope)).toBe(true);
    });
  });

  describe('migrateToVersionedEnvelope', () => {
    it('should add version byte to old envelope format', () => {
      // Old format: [4 bytes key length][sealed key][encrypted file]
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

    it('should preserve sealed key and encrypted file during migration', () => {
      const sealedKey = new Uint8Array(300);
      sealedKey.fill(42);
      const encryptedFile = new Uint8Array(500);
      encryptedFile.fill(84);

      // Build old format envelope
      const oldEnvelope = new Uint8Array(804);
      const view = new DataView(oldEnvelope.buffer, 0, 4);
      view.setUint32(0, 300, true);
      oldEnvelope.set(sealedKey, 4);
      oldEnvelope.set(encryptedFile, 304);

      const migrated = migrateToVersionedEnvelope(oldEnvelope);
      const parsed = parseEnvelopeWithVersion(migrated);

      expect(parsed.sealedKey).toEqual(sealedKey);
      expect(parsed.encryptedFile).toEqual(encryptedFile);
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
      const oldEnvelope = new Uint8Array(1020);
      const view = new DataView(oldEnvelope.buffer, 0, 4);
      view.setUint32(0, 1000, true); // Invalid - too large

      expect(() => migrateToVersionedEnvelope(oldEnvelope)).toThrow();
    });
  });

  describe('Envelope Property Tests', () => {
    it('should roundtrip various sealed key sizes', () => {
      const testSizes = [150, 250, 400, 600, 800];

      testSizes.forEach((keyLength) => {
        const sealedKey = new Uint8Array(keyLength);
        const encryptedFile = new Uint8Array(1000);

        const envelope = buildEnvelopeWithVersion(sealedKey, encryptedFile);
        const parsed = parseEnvelopeWithVersion(envelope);

        expect(parsed.version).toBe(1);
        expect(parsed.sealedKey.length).toBe(keyLength);
        expect(parsed.encryptedFile.length).toBe(1000);
      });
    });

    it('should maintain data integrity through build-parse cycle', () => {
      const sealedKey = new Uint8Array(300);
      sealedKey.fill(42);

      const encryptedFile = new Uint8Array(500);
      encryptedFile.fill(84);

      const envelope = buildEnvelopeWithVersion(sealedKey, encryptedFile);
      const parsed = parseEnvelopeWithVersion(envelope);

      // Check lengths match
      expect(parsed.sealedKey.length).toBe(300);
      expect(parsed.encryptedFile.length).toBe(500);

      // Check sealed key data
      for (let i = 0; i < sealedKey.length; i++) {
        expect(parsed.sealedKey[i]).toBe(42);
      }

      // Check encrypted file data
      for (let i = 0; i < encryptedFile.length; i++) {
        expect(parsed.encryptedFile[i]).toBe(84);
      }
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
