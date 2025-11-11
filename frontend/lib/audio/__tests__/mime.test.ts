import { describe, it, expect } from 'bun:test';
import { normalizeAudioMimeType, getExtensionForMime, ensureMimeType } from '../mime';

describe('audio mime helpers', () => {
  it('normalizes mime types by stripping params and casing', () => {
    expect(normalizeAudioMimeType('Audio/MPEG')).toBe('audio/mpeg');
    expect(normalizeAudioMimeType('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(normalizeAudioMimeType(undefined)).toBeUndefined();
  });

  it('maps known mime types to file extensions', () => {
    expect(getExtensionForMime('audio/mpeg')).toBe('mp3');
    expect(getExtensionForMime('audio/mp4')).toBe('m4a');
    expect(getExtensionForMime('audio/webm')).toBe('webm');
  });

  it('ensures a fallback mime type when missing', () => {
    expect(ensureMimeType('audio/flac')).toBe('audio/flac');
    expect(ensureMimeType(undefined, 'audio/mp4')).toBe('audio/mp4');
    expect(ensureMimeType('')).toBe('audio/mpeg');
  });
});

