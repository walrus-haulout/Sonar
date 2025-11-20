const FALLBACK_VERIFIER_BASE = 'https://audio-verifier.projectsonar.xyz/';
const PLACEHOLDER_PATTERN = /\$\{\{.*\}\}/;

const resolveVerifierBase = () => {
  const candidate = process.env.AUDIO_VERIFIER_URL?.trim();

  if (candidate && !PLACEHOLDER_PATTERN.test(candidate)) {
    try {
      let urlString = candidate;
      if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = `https://${urlString}`;
      }

      const url = new URL(urlString);

      // Ensure trailing slash so relative paths append correctly
      if (!url.pathname.endsWith('/')) {
        url.pathname = `${url.pathname}/`;
      }

      return url.toString();
    } catch (error) {
      console.warn(
        `[verifier] Invalid AUDIO_VERIFIER_URL "${candidate}", falling back to default`,
        error
      );
    }
  }

  return FALLBACK_VERIFIER_BASE;
};

const VERIFIER_BASE_URL = resolveVerifierBase();

export const getVerifierBaseUrl = () => VERIFIER_BASE_URL;

export const buildVerifierUrl = (path: string) => new URL(path, VERIFIER_BASE_URL).toString();

