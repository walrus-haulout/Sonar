import type { PrismaClient } from '@prisma/client';
import { logger } from '../logger';
import { SONAR_MARKETPLACE_ID, suiClient, suiQueryExecutor } from '../sui/client';

export interface MarketplaceSnapshot {
  marketplaceId: string;
  totalSupply: bigint;
  rewardPool: bigint;
  liquidityVault: bigint;
  circulatingSupply: bigint;
  kiosk: {
    basePrice: bigint;
    priceOverride: bigint | null;
    currentTier: number;
    sonarReserve: bigint;
    suiReserve: bigint;
    suiCutPercentage: number;
  };
}

export async function fetchMarketplaceSnapshot(marketplaceId = SONAR_MARKETPLACE_ID): Promise<MarketplaceSnapshot | null> {
  if (!marketplaceId || marketplaceId === '0x0') {
    return null;
  }

  try {
    const response = await suiQueryExecutor.execute(async () =>
      suiClient.getObject({
        id: marketplaceId,
        options: { showContent: true },
      })
    );

    const content = response.data?.content;

    if (!content || content.dataType !== 'moveObject') {
      logger.warn({ marketplaceId }, 'Marketplace object content missing');
      return null;
    }

    const fields = content.fields as Record<string, any>;

    const treasuryCap = fields?.treasury_cap;
    const rewardPool = fields?.reward_pool;
    const liquidityVault = fields?.liquidity_vault;
    const kiosk = fields?.kiosk;

    if (!treasuryCap || !rewardPool || !liquidityVault || !kiosk) {
      logger.warn({ marketplaceId }, 'Marketplace object missing required fields');
      return null;
    }

    const totalSupply = extractBigInt(treasuryCap?.fields?.total_supply);
    const rewardPoolValue = extractBigInt(rewardPool);
    const liquidityVaultValue = extractBigInt(liquidityVault);

    const circulatingSupply = totalSupply - rewardPoolValue - liquidityVaultValue;

    const kioskFields = kiosk.fields ?? {};
    const basePrice = extractBigInt(kioskFields.base_sonar_price);
    const priceOverride = extractOptionBigInt(kioskFields.price_override);
    const currentTier = safeNumber(kioskFields.current_tier, 1);
    const sonarReserve = extractBigInt(kioskFields.sonar_reserve);
    const suiReserve = extractBigInt(kioskFields.sui_reserve);
    const suiCutPercentage = safeNumber(kioskFields.sui_cut_percentage, 0);

    return {
      marketplaceId,
      totalSupply,
      rewardPool: rewardPoolValue,
      liquidityVault: liquidityVaultValue,
      circulatingSupply,
      kiosk: {
        basePrice,
        priceOverride,
        currentTier,
        sonarReserve,
        suiReserve,
        suiCutPercentage,
      },
    };
  } catch (error) {
    logger.error({ error, marketplaceId }, 'Failed to fetch marketplace snapshot');
    return null;
  }
}

export async function syncKioskSnapshotToDatabase(prisma: PrismaClient): Promise<void> {
  const snapshot = await fetchMarketplaceSnapshot();

  if (!snapshot) {
    return;
  }

  await prisma.kioskReserve.upsert({
    where: { id: snapshot.marketplaceId },
    create: {
      id: snapshot.marketplaceId,
      sonar_balance: snapshot.kiosk.sonarReserve,
      sui_balance: snapshot.kiosk.suiReserve,
      current_price: snapshot.kiosk.basePrice,
      price_override: snapshot.kiosk.priceOverride ?? undefined,
      current_tier: snapshot.kiosk.currentTier,
      circulating_supply: snapshot.circulatingSupply,
      last_synced_at: new Date(),
    },
    update: {
      sonar_balance: snapshot.kiosk.sonarReserve,
      sui_balance: snapshot.kiosk.suiReserve,
      current_price: snapshot.kiosk.basePrice,
      price_override: snapshot.kiosk.priceOverride ?? undefined,
      current_tier: snapshot.kiosk.currentTier,
      circulating_supply: snapshot.circulatingSupply,
      last_synced_at: new Date(),
    },
  });
}

function extractBigInt(value: any): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return BigInt(value);
  }

  if (typeof value === 'object') {
    if ('fields' in value) {
      const fields = value.fields as Record<string, any>;

      if ('value' in fields) {
        return extractBigInt(fields.value);
      }

      if ('some' in fields) {
        return extractBigInt(fields.some);
      }

      if ('vec' in fields && Array.isArray(fields.vec) && fields.vec.length > 0) {
        return extractBigInt(fields.vec[0]);
      }
    }

    if ('Some' in value) {
      return extractBigInt(value.Some);
    }

    if ('value' in value) {
      return extractBigInt(value.value);
    }
  }

  return 0n;
}

function extractOptionBigInt(value: any): bigint | null {
  if (!value) {
    return null;
  }

  if (typeof value !== 'object') {
    return extractBigInt(value);
  }

  if ('fields' in value) {
    const fields = value.fields as Record<string, any>;

    if ('some' in fields) {
      return extractBigInt(fields.some);
    }

    if ('value' in fields) {
      return extractBigInt(fields.value);
    }

    if ('none' in fields) {
      return null;
    }
  }

  if ('Some' in value) {
    return extractBigInt(value.Some);
  }

  if ('None' in value) {
    return null;
  }

  return null;
}

function safeNumber(value: any, fallback: number): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return fallback;
}
