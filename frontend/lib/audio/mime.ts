const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/x-ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'webm',
  'audio/3gpp': '3gp',
  'audio/3gp': '3gp',
  'audio/amr': 'amr',
};

export function normalizeAudioMimeType(mime?: string | null): string | undefined {
  if (!mime) {
    return undefined;
  }

  return mime.split(';')[0].trim().toLowerCase() || undefined;
}

export function getExtensionForMime(mime?: string | null): string | undefined {
  const normalized = normalizeAudioMimeType(mime);
  if (!normalized) {
    return undefined;
  }

  return MIME_EXTENSION_MAP[normalized];
}

export function ensureMimeType(mime?: string | null, fallback: string = 'audio/mpeg'): string {
  return normalizeAudioMimeType(mime) ?? fallback;
}

