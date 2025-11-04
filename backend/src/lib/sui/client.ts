import { SuiClient } from '@mysten/sui.js/client';
import { suiService } from '@dreamlit/walrus-sui-core/node';
import { logger } from '../logger';

const SUI_RPC_URL = process.env.SUI_RPC_URL;

if (!SUI_RPC_URL) {
  throw new Error('SUI_RPC_URL environment variable is required');
}

suiService.client = new SuiClient({ url: SUI_RPC_URL });

export const suiClient = suiService.client;
export const suiQueryExecutor = suiService.queryExecutor;

export const SONAR_PACKAGE_ID = process.env.SONAR_PACKAGE_ID || '0x0';
export const SONAR_MARKETPLACE_ID = process.env.SONAR_MARKETPLACE_ID || '0x0';

if (!process.env.SONAR_PACKAGE_ID || process.env.SONAR_PACKAGE_ID === '0x0') {
  logger.warn('SONAR_PACKAGE_ID not configured. Blockchain interactions will use mock behavior.');
}

if (!process.env.SONAR_MARKETPLACE_ID || process.env.SONAR_MARKETPLACE_ID === '0x0') {
  logger.warn('SONAR_MARKETPLACE_ID not configured. Kiosk state sync will be disabled.');
}
