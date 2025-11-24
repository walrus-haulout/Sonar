/**
 * Sui blockchain client
 * Provides basic Sui client for blockchain interactions
 */

import { SuiClient } from '@mysten/sui.js/client';
import { logger } from '../logger';
import { config } from '../config';

// Export configuration constants from centralized config
export const SUI_RPC_URL = config.sui.rpcUrl;
export const SONAR_PACKAGE_ID = config.sui.packageId;
export const SONAR_MARKETPLACE_ID = config.sui.marketplaceId;
export const DATASET_TYPE = SONAR_PACKAGE_ID
  ? `${SONAR_PACKAGE_ID}::marketplace::AudioSubmission`
  : '';

// Initialize standard SuiClient
logger.info({ rpcUrl: SUI_RPC_URL }, 'Initializing Sui client');
export const suiClient = new SuiClient({ url: SUI_RPC_URL });

// For compatibility, export the same client as queryExecutor
export const suiQueryExecutor = suiClient;

logger.info(
  {
    packageId: SONAR_PACKAGE_ID,
    marketplaceId: SONAR_MARKETPLACE_ID,
  },
  'Sui client initialized'
);
