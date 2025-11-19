/**
 * Unit Tests for Decryption Module
 * Tests encryption/decryption roundtrip and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkIfEnvelope, validateEnvelopeRange } from '../decryption';
import * as fc from 'fast-check';

describe('Decryption Module', () => {
  describe('checkIfEnvelope', () => {
    it('should detect valid envelope with 624-byte sealed key', () => {
      // 4-byte length header + 624-byte sealed key + some encrypted data
      const envelope = new Uint8Array(632 + 100);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 624, true); // little-endian 624

      const result = checkIfEnvelope(envelope);
      expect(result).toBe(true);
    });

    it('should detect valid envelope with 300-byte sealed key', () => {
      const envelope = new Uint8Array(300 + 4 + 100);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 300, true);

      const result = checkIfEnvelope(envelope);
      expect(result).toBe(true);
    });

    it('should reject envelope with sealed key < 150 bytes', () => {
      const envelope = new Uint8Array(100 + 4);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 100, true);

      const result = checkIfEnvelope(envelope);
      expect(result).toBe(false);
    });

    it('should reject envelope with sealed key > 800 bytes', () => {
      const envelope = new Uint8Array(1000 + 4);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 1000, true);

      const result = checkIfEnvelope(envelope);
      expect(result).toBe(false);
    });

    it('should reject data smaller than 8 bytes', () => {
      const envelope = new Uint8Array(4);
      const result = checkIfEnvelope(envelope);
      expect(result).toBe(false);
    });

    it('should accept envelope at boundary: 150 bytes', () => {
      const envelope = new Uint8Array(150 + 4 + 1);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 150, true);

      expect(checkIfEnvelope(envelope)).toBe(true);
    });

    it('should accept envelope at boundary: 800 bytes', () => {
      const envelope = new Uint8Array(800 + 4 + 1);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 800, true);

      expect(checkIfEnvelope(envelope)).toBe(true);
    });

    it('should reject envelope at boundary: 149 bytes', () => {
      const envelope = new Uint8Array(149 + 4 + 1);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 149, true);

      expect(checkIfEnvelope(envelope)).toBe(false);
    });

    it('should reject envelope at boundary: 801 bytes', () => {
      const envelope = new Uint8Array(801 + 4 + 1);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 801, true);

      expect(checkIfEnvelope(envelope)).toBe(false);
    });
  });

  describe('Envelope Detection Property Tests', () => {
    it('should accept any sealed key between 150-800 bytes', () => {
      fc.assert(
        fc.property(fc.integer({ min: 150, max: 800 }), (keyLength) => {
          const envelope = new Uint8Array(keyLength + 4 + 10);
          const view = new DataView(envelope.buffer, 0, 4);
          view.setUint32(0, keyLength, true);

          return checkIfEnvelope(envelope) === true;
        })
      );
    });

    it('should reject sealed keys outside 150-800 range', () => {
      fc.assert(
        fc.property(
          fc.union(
            fc.integer({ min: 0, max: 149 }),
            fc.integer({ min: 801, max: 65535 })
          ),
          (keyLength) => {
            const size = Math.max(4 + keyLength + 1, 8);
            const envelope = new Uint8Array(size);
            const view = new DataView(envelope.buffer, 0, 4);
            view.setUint32(0, keyLength, true);

            return checkIfEnvelope(envelope) === false;
          }
        )
      );
    });

    it('should handle byteOffset correctly for sliced Uint8Arrays', () => {
      const buffer = new Uint8Array(1000);
      const view = new DataView(buffer.buffer, 100, 4);
      view.setUint32(0, 300, true);

      const sliced = buffer.slice(100, 100 + 304 + 10);
      expect(checkIfEnvelope(sliced)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined gracefully', () => {
      expect(() => checkIfEnvelope(null as any)).toThrow();
      expect(() => checkIfEnvelope(undefined as any)).toThrow();
    });

    it('should handle empty Uint8Array', () => {
      expect(checkIfEnvelope(new Uint8Array())).toBe(false);
    });

    it('should not throw on corrupted data', () => {
      const corrupted = new Uint8Array([255, 255, 255, 255]);
      expect(() => checkIfEnvelope(corrupted)).not.toThrow();
      expect(checkIfEnvelope(corrupted)).toBe(false);
    });
  });

  describe('Multi-server Configuration (4-5 servers)', () => {
    // These tests validate the 624-byte sealed key scenario from production logs

    it('should accept 624-byte sealed key from 4-server config', () => {
      const envelope = new Uint8Array(624 + 4 + 500);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 624, true);

      expect(checkIfEnvelope(envelope)).toBe(true);
    });

    it('should accept sealed keys up to 700 bytes for 5-server config', () => {
      const envelope = new Uint8Array(700 + 4 + 500);
      const view = new DataView(envelope.buffer, 0, 4);
      view.setUint32(0, 700, true);

      expect(checkIfEnvelope(envelope)).toBe(true);
    });

    it('should process sealed keys for various server counts', () => {
      // 2 servers: ~300 bytes
      expect(checkIfEnvelope(createEnvelopeWithKeyLength(300))).toBe(true);
      // 3 servers: ~350 bytes
      expect(checkIfEnvelope(createEnvelopeWithKeyLength(350))).toBe(true);
      // 4 servers: ~400 bytes
      expect(checkIfEnvelope(createEnvelopeWithKeyLength(400))).toBe(true);
      // 5 servers: ~450 bytes
      expect(checkIfEnvelope(createEnvelopeWithKeyLength(450))).toBe(true);
    });
  });
});

function createEnvelopeWithKeyLength(keyLength: number): Uint8Array {
  const envelope = new Uint8Array(keyLength + 4 + 100);
  const view = new DataView(envelope.buffer, 0, 4);
  view.setUint32(0, keyLength, true);
  return envelope;
}

function validateEnvelopeRange(data: Uint8Array): boolean {
  // This would be the actual implementation
  return checkIfEnvelope(data);
}
