/**
 * Centralized environment configuration for SONAR backend.
 * Single source of truth for all environment variables with proper types and defaults.
 *
 * Usage:
 *   import { config } from '@/lib/config';
 *   console.log(config.sui.rpcUrl);
 */

// Helper to parse boolean env vars
const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
};

// Helper to parse number env vars
const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

// Helper to get required env var
const getRequired = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
};

// Helper to get optional env var with default
const getOptional = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

/**
 * Typed configuration object
 */
export const config = {
  // Application
  app: {
    nodeEnv: getOptional('NODE_ENV', 'development') as 'development' | 'production' | 'test',
    port: parseNumber(process.env.PORT, 3001),
    logLevel: getOptional('LOG_LEVEL', 'info'),
  },

  // Database
  database: {
    url: getRequired('DATABASE_URL'),
  },

  // Authentication
  auth: {
    jwtSecret: getRequired('JWT_SECRET'),
    jwtExpiresIn: getOptional('JWT_EXPIRES_IN', '24h'),
  },

  // Sui Blockchain
  sui: {
    rpcUrl: getRequired('SUI_RPC_URL'),
    packageId: getOptional('SONAR_PACKAGE_ID', '0x0'),
    marketplaceId: getOptional('SONAR_MARKETPLACE_ID', '0x0'),
  },

  // Walrus Storage
  walrus: {
    aggregatorUrl: getRequired('WALRUS_AGGREGATOR_URL'),
    publisherUrl: getRequired('WALRUS_PUBLISHER_URL'),
    mockMode: parseBoolean(process.env.MOCK_WALRUS, false),

    // Rate limiting configuration for aggregator
    aggregator: {
      maxRPS: parseNumber(process.env.WALRUS_AGG_MAX_RPS, 5),
      burst: parseNumber(process.env.WALRUS_AGG_BURST, 5),
      maxConcurrent: parseNumber(process.env.WALRUS_AGG_MAX_CONCURRENT, 3),
      requestTimeout: parseNumber(process.env.WALRUS_AGG_TIMEOUT, 30000),
    },

    // Rate limiting configuration for publisher
    publisher: {
      maxRPS: parseNumber(process.env.WALRUS_PUB_MAX_RPS, 1),
      burst: parseNumber(process.env.WALRUS_PUB_BURST, 2),
      maxConcurrent: parseNumber(process.env.WALRUS_PUB_MAX_CONCURRENT, 1),
      requestTimeout: parseNumber(process.env.WALRUS_PUB_TIMEOUT, 60000),
    },
  },

  // Seal Network
  seal: {
    networkUrl: getRequired('SEAL_NETWORK_URL'),
    mockMode: parseBoolean(process.env.MOCK_SEAL, false),
  },

  // CORS
  cors: {
    origin: getOptional('CORS_ORIGIN', 'http://localhost:3000,http://localhost:3001'),
  },

  // Optional features
  sentry: {
    dsn: getOptional('SENTRY_DSN', ''),
  },
} as const;

/**
 * Type export for use in other files
 */
export type Config = typeof config;

/**
 * Validate configuration on import.
 * This will throw immediately if required env vars are missing.
 */
(function validateConfig() {
  // Basic validation already happens in getRequired() calls above
  // Add any additional validation logic here if needed

  // Warn about default/mock values
  if (config.sui.packageId === '0x0') {
    console.warn('[CONFIG] SONAR_PACKAGE_ID not configured. Using default: 0x0');
  }

  if (config.sui.marketplaceId === '0x0') {
    console.warn('[CONFIG] SONAR_MARKETPLACE_ID not configured. Using default: 0x0');
  }

  if (config.walrus.mockMode) {
    console.warn('[CONFIG] MOCK_WALRUS is enabled. Using mock Walrus implementation.');
  }

  if (config.seal.mockMode) {
    console.warn('[CONFIG] MOCK_SEAL is enabled. Using mock Seal implementation.');
  }
})();
