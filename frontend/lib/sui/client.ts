import { SuiClient } from '@mysten/sui/client';
import { createGraphQLClient, createGraphQLClients } from './graphql-clients';
import testnetDeployment from '../../../contracts/deployments/testnet.json';
import mainnetDeployment from '../../../contracts/deployments/mainnet.json';

const MAINNET_PACKAGE_ID = '0x1084073ffefdb80fac657daae2d60895fac976ab6b85196c0ce86bcbce51edf6';
const MAINNET_MARKETPLACE_ID = '0xb1c467213d96d3b2de78124cf10deebcefe7e19093cbbaac3b368b604112e5b4';

const determineNetwork = (): 'mainnet' | 'testnet' | 'devnet' => {
  const candidates: Array<[string, string | undefined]> = [
    ['NEXT_PUBLIC_NETWORK', process.env.NEXT_PUBLIC_NETWORK],
    ['NEXT_PUBLIC_SUI_NETWORK', process.env.NEXT_PUBLIC_SUI_NETWORK],
    ['NEXT_PUBLIC_CHAIN_NETWORK', process.env.NEXT_PUBLIC_CHAIN_NETWORK],
  ];

  let warned = false;
  for (const [key, rawValue] of candidates) {
    if (!rawValue) continue;

    const normalized = rawValue.trim().toLowerCase();
    if (normalized === 'mainnet' || normalized === 'testnet' || normalized === 'devnet') {
      return normalized;
    }

    if (!warned) {
      console.warn(`[sui/client] Ignoring ${key}="${rawValue}" (expected mainnet, testnet, or devnet).`);
      warned = true;
    }
  }

  const pkg = process.env.NEXT_PUBLIC_PACKAGE_ID?.trim().toLowerCase();
  const marketplace = process.env.NEXT_PUBLIC_MARKETPLACE_ID?.trim().toLowerCase();
  if (pkg === MAINNET_PACKAGE_ID || marketplace === MAINNET_MARKETPLACE_ID) {
    return 'mainnet';
  }

  return 'testnet';
};

// Network configuration
export const NETWORK = determineNetwork();

// Separate RPC and GraphQL endpoints
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || `https://fullnode.${NETWORK}.sui.io`;

/**
 * Legacy GRAPHQL_URL export for backwards compatibility
 * New code should use graphqlClients for multi-endpoint support
 */
export const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL || `https://graphql.${NETWORK}.sui.io/graphql`;

// Create Sui client for RPC calls
export const suiClient = new SuiClient({ url: RPC_URL });

/**
 * Single GraphQL client for backwards compatibility
 * Uses the highest priority endpoint (beta by default)
 *
 * @deprecated Use graphqlClients for multi-endpoint resilience
 */
export const graphqlClient = createGraphQLClient(NETWORK);

/**
 * Array of GraphQL clients for multi-endpoint resilience
 * Priority order: beta → legacy → custom (if provided via env)
 * Use this for new code that needs automatic fallback between endpoints
 */
export const graphqlClients = createGraphQLClients(NETWORK);

type DeploymentJson = {
  packageId?: string | null;
  objects?: Record<string, string | null>;
};

const STATIC_FALLBACKS: Record<string, DeploymentJson> = {
  mainnet: {
    packageId: MAINNET_PACKAGE_ID,
    objects: {
      marketplace: MAINNET_MARKETPLACE_ID,
    },
  },
};

const deploymentDefaultsByNetwork: Record<string, DeploymentJson> = {
  testnet: testnetDeployment as DeploymentJson,
  mainnet: {
    ...mainnetDeployment,
    ...STATIC_FALLBACKS.mainnet,
    objects: {
      ...(mainnetDeployment.objects || {}),
      ...(STATIC_FALLBACKS.mainnet?.objects || {}),
    },
  },
};

const OBJECT_ID_REGEX = /^0x[0-9a-fA-F]{64}$/;

const normalizeObjectId = (value: string | null | undefined, label: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();

  if (trimmed === '' || trimmed === '0x0') {
    return undefined;
  }

  if (!OBJECT_ID_REGEX.test(trimmed)) {
    console.warn(`[sui/client] Ignoring invalid ${label}: ${trimmed}`);
    return undefined;
  }

  return trimmed;
};

const pickObjectId = (label: string, candidates: Array<string | null | undefined>): string | undefined => {
  for (const candidate of candidates) {
    const normalized = normalizeObjectId(candidate, label);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
};

const deploymentDefaults = deploymentDefaultsByNetwork[NETWORK] ?? {};

const packageIdInternal = pickObjectId('PACKAGE_ID', [
  process.env.NEXT_PUBLIC_PACKAGE_ID,
  deploymentDefaults.packageId,
  STATIC_FALLBACKS[NETWORK]?.packageId,
]);

const marketplaceFallbackForPackage =
  packageIdInternal === MAINNET_PACKAGE_ID ? MAINNET_MARKETPLACE_ID : STATIC_FALLBACKS[NETWORK]?.objects?.marketplace;

const marketplaceIdInternal = pickObjectId('MARKETPLACE_ID', [
  process.env.NEXT_PUBLIC_MARKETPLACE_ID,
  deploymentDefaults.objects?.marketplace,
  marketplaceFallbackForPackage,
]);

const statsObjectIdInternal = pickObjectId('STATS_OBJECT_ID', [
  process.env.NEXT_PUBLIC_STATS_OBJECT_ID,
  deploymentDefaults.objects?.marketplace,
  marketplaceFallbackForPackage,
]);

const rewardPoolIdInternal = pickObjectId('REWARD_POOL_ID', [
  process.env.NEXT_PUBLIC_REWARD_POOL_ID,
  deploymentDefaults.objects?.rewardPool,
]);

const missingConfig: string[] = [];

if (!packageIdInternal) missingConfig.push('PACKAGE_ID');
if (!marketplaceIdInternal) missingConfig.push('MARKETPLACE_ID');

if (missingConfig.length > 0) {
  console.warn(
    `[sui/client] Blockchain config incomplete: ${missingConfig.join(', ')}. ` +
    'Set NEXT_PUBLIC_* env vars or update contracts/deployments JSON.'
  );
}

export const CHAIN_CONFIG = {
  packageId: packageIdInternal ?? null,
  marketplaceId: marketplaceIdInternal ?? null,
  statsObjectId: statsObjectIdInternal ?? null,
  rewardPoolId: rewardPoolIdInternal ?? null,
  configured: missingConfig.length === 0,
  missingKeys: missingConfig,
} as const;

// Contract addresses (fall back to empty string when missing for backwards compatibility)
export const PACKAGE_ID = CHAIN_CONFIG.packageId ?? '';
export const STATS_OBJECT_ID = CHAIN_CONFIG.statsObjectId ?? '';
export const MARKETPLACE_ID = CHAIN_CONFIG.marketplaceId ?? '';
export const REWARD_POOL_ID = CHAIN_CONFIG.rewardPoolId ?? '';

// Coin type for SONAR token
export const SONAR_COIN_TYPE = CHAIN_CONFIG.packageId ? `${CHAIN_CONFIG.packageId}::sonar::SONAR` : '';

// Type definitions for on-chain objects
export const DATASET_TYPE = CHAIN_CONFIG.packageId
  ? `${CHAIN_CONFIG.packageId}::marketplace::AudioSubmission`
  : '';
export const PROTOCOL_STATS_TYPE = CHAIN_CONFIG.packageId
  ? `${CHAIN_CONFIG.packageId}::marketplace::QualityMarketplace`
  : '';

// Feature flags
export const USE_BLOCKCHAIN = process.env.NEXT_PUBLIC_USE_BLOCKCHAIN === 'true';

// Explorer URLs
export const getExplorerUrl = (type: 'tx' | 'object' | 'address', id: string) => {
  const baseUrl = NETWORK === 'mainnet'
    ? 'https://suiscan.xyz/mainnet'
    : `https://suiscan.xyz/${NETWORK}`;

  return `${baseUrl}/${type}/${id}`;
};

export const getTxExplorerUrl = (digest: string) => getExplorerUrl('tx', digest);
export const getObjectExplorerUrl = (objectId: string) => getExplorerUrl('object', objectId);
export const getAddressExplorerUrl = (address: string) => getExplorerUrl('address', address);
