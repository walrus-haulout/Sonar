/**
 * Sui blockchain client using Dreamlit's walrus-sui-core SDK.
 * Provides transaction management with queueing, tracking, and retry logic.
 * Uses suiService for production-ready blockchain interactions with built-in
 * query executor for rate limiting and error handling.
 */

import { SuiClient } from '@mysten/sui.js/client';
import { suiService } from '@dreamlit/walrus-sui-core/node';
import { logger } from '../logger';

// Environment configuration
const SUI_RPC_URL = process.env.SUI_RPC_URL;

if (!SUI_RPC_URL) {
  throw new Error('SUI_RPC_URL environment variable is required');
}

// Initialize Dreamlit's suiService with SuiClient
// The suiService provides transaction management, queueing, and retry logic
logger.info({ rpcUrl: SUI_RPC_URL }, 'Initializing Dreamlit Sui service');
suiService.client = new SuiClient({ url: SUI_RPC_URL });

// Export suiService components for use throughout the application
// suiClient: Direct access to SuiClient for queries
// suiQueryExecutor: Managed query executor with rate limiting and retries
export const suiClient = suiService.client;
export const suiQueryExecutor = suiService.queryExecutor;

// SONAR smart contract configuration
export const SONAR_PACKAGE_ID = process.env.SONAR_PACKAGE_ID || '0x0';
export const SONAR_MARKETPLACE_ID = process.env.SONAR_MARKETPLACE_ID || '0x0';

// Validation and warnings
if (!process.env.SONAR_PACKAGE_ID || process.env.SONAR_PACKAGE_ID === '0x0') {
  logger.warn('SONAR_PACKAGE_ID not configured. Blockchain interactions will use mock behavior.');
}

if (!process.env.SONAR_MARKETPLACE_ID || process.env.SONAR_MARKETPLACE_ID === '0x0') {
  logger.warn('SONAR_MARKETPLACE_ID not configured. Kiosk state sync will be disabled.');
}

logger.info(
  {
    packageId: SONAR_PACKAGE_ID,
    marketplaceId: SONAR_MARKETPLACE_ID,
  },
  'Sui client initialized with Dreamlit SDK'
);
