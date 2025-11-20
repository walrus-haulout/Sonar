import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'child_process';

describe('decrypt.ts bridge', () => {
    it('should validate input JSON', () => {
        const result = spawnSync('bun', ['run', 'decrypt.ts', 'invalid-json']);
        expect(result.status).toBe(1);
        expect(result.stderr.toString()).toContain('Invalid JSON input');
    });

    it('should validate schema', () => {
        const result = spawnSync('bun', ['run', 'decrypt.ts', '{}']);
        expect(result.status).toBe(1);
        // Zod error should be present
        expect(result.stderr.toString()).toContain('Required');
    });

    it('should validate SessionKey-based input', () => {
        const validInput = JSON.stringify({
            encrypted_object_hex: '000102', // Fake hex
            identity: '0x123abc', // Required for SessionKey flow
            session_key_data: '{"dummy":"data"}', // Will fail at import, but passes schema
            network: 'mainnet'
        });

        const result = spawnSync('bun', ['run', 'decrypt.ts', validInput]);
        // Schema validation passes, but SessionKey import will fail
        // (because we're passing dummy data, not real SessionKey)
        // Expect error on stderr about SessionKey import
        expect(result.status).toBe(1);
        expect(result.stderr.toString()).toContain('SessionKey');
    });
});
