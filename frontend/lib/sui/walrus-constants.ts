/**
 * Walrus Protocol Constants
 * Mainnet deployment configuration
 */

// Walrus Package ID (Mainnet)
export const WALRUS_PACKAGE_ID =
  process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID ||
  "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77";

// WAL Token Package ID
export const WAL_TOKEN_PACKAGE =
  process.env.NEXT_PUBLIC_WAL_TOKEN_PACKAGE ||
  "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59";

// WAL Token Coin Type
export const WAL_COIN_TYPE = `${WAL_TOKEN_PACKAGE}::wal::WAL`;

// Walrus System Object (shared object for registration)
// This is the shared System object that manages all blob registrations
export const WALRUS_SYSTEM_OBJECT_ID =
  process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT ||
  "0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2";

// Default storage duration (in epochs)
// 1 epoch ≈ 1 day on Walrus
export const DEFAULT_STORAGE_EPOCHS = 26; // ~26 days

// Encoding type constants
export const ENCODING_TYPE = {
  RED_STUFF_RAPTOR: 0, // RaptorQ erasure coding
  RS2: 1, // Reed-Solomon erasure coding (recommended)
} as const;

// Storage size multiplier for encoding
// RS2 encoding creates ~2x the original size
export const ENCODING_SIZE_MULTIPLIER: Record<number, number> = {
  [ENCODING_TYPE.RED_STUFF_RAPTOR]: 2.0,
  [ENCODING_TYPE.RS2]: 2.0,
};

// WAL cost estimation (approximate values - may vary)
// These are rough estimates for mainnet
export const WAL_COST_PER_MB_PER_EPOCH = 0.001; // ~0.001 WAL per MB per epoch
export const WAL_WRITE_FEE_PER_BLOB = 0.05; // ~0.05 WAL per blob write

/**
 * Calculate approximate WAL cost for storage
 */
export function estimateWalCost(
  sizeBytes: number,
  epochs: number = DEFAULT_STORAGE_EPOCHS,
  encodingType: number = ENCODING_TYPE.RS2,
): {
  storageCost: number;
  writeFee: number;
  total: number;
} {
  const sizeMB = sizeBytes / (1024 * 1024);
  const multiplier = ENCODING_SIZE_MULTIPLIER[encodingType] || 2.0;
  const encodedSizeMB = sizeMB * multiplier;

  const storageCost = encodedSizeMB * epochs * WAL_COST_PER_MB_PER_EPOCH;
  const writeFee = WAL_WRITE_FEE_PER_BLOB;
  const total = storageCost + writeFee;

  return {
    storageCost,
    writeFee,
    total,
  };
}

/**
 * Calculate encoded blob size
 */
export function calculateEncodedSize(
  unencodedSize: number,
  encodingType: number = ENCODING_TYPE.RS2,
): number {
  const multiplier = ENCODING_SIZE_MULTIPLIER[encodingType] || 2.0;
  return Math.ceil(unencodedSize * multiplier);
}

/**
 * Convert WAL amount to MIST (WAL uses 9 decimals like SUI)
 */
export function walToMist(wal: number): bigint {
  return BigInt(Math.floor(wal * 1_000_000_000));
}

/**
 * Convert MIST to WAL
 */
export function mistToWal(mist: bigint): number {
  return Number(mist) / 1_000_000_000;
}
