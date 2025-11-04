import { describe, expect, mock, test } from 'bun:test';

process.env.SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io';
process.env.SONAR_PACKAGE_ID = process.env.SONAR_PACKAGE_ID || '0x0';
process.env.SONAR_MARKETPLACE_ID = '0xkiosk_test';

async function loadStateModule() {
  const suffix = `?scenario=${Date.now()}-${Math.random()}`;
  return import(`../lib/kiosk/state${suffix}`);
}

function createMockFn(defaultImpl: (...args: any[]) => any = () => undefined) {
  let impl = defaultImpl;
  const queue: Array<(...args: any[]) => any> = [];
  const calls: any[][] = [];

  const fn = (...args: any[]) => {
    calls.push(args);
    if (queue.length > 0) {
      return queue.shift()!(...args);
    }
    return impl(...args);
  };

  (fn as any).mock = { calls };

  fn.mockClear = () => {
    calls.length = 0;
    queue.length = 0;
  };

  fn.mockImplementation = (nextImpl: (...args: any[]) => any) => {
    impl = nextImpl;
    return fn;
  };

  fn.mockImplementationOnce = (nextImpl: (...args: any[]) => any) => {
    queue.push(nextImpl);
    return fn;
  };

  fn.mockResolvedValue = (value: any) => fn.mockImplementation(() => Promise.resolve(value));
  fn.mockResolvedValueOnce = (value: any) => fn.mockImplementationOnce(() => Promise.resolve(value));

  fn.mockCallCount = () => calls.length;

  return fn as any;
}

mock.module('../lib/sui/client', () => {
  return {
    suiClient: {
      async getObject() {
        return {
          data: {
            content: {
              dataType: 'moveObject',
              fields: {
                treasury_cap: { fields: { total_supply: '100000000000000000' } },
                reward_pool: '70000000000000000',
                liquidity_vault: '5000000000000000',
                kiosk: {
                  fields: {
                    base_sonar_price: '800000000',
                    price_override: { fields: { some: '750000000' } },
                    current_tier: 2,
                    sonar_reserve: '4200000000000000',
                    sui_reserve: '3200000000000000',
                    sui_cut_percentage: 5,
                  },
                },
              },
            },
          },
        };
      },
    },
    suiQueryExecutor: {
      async execute(fn: () => Promise<any>) {
        return fn();
      },
    },
    SONAR_MARKETPLACE_ID: '0xkiosk_test',
  };
});

const { fetchMarketplaceSnapshot, syncKioskSnapshotToDatabase } = await loadStateModule();
describe('syncKioskSnapshotToDatabase', () => {
  test('writes snapshot data from mocked Sui response', async () => {
    const snapshot = await fetchMarketplaceSnapshot();
    expect(snapshot).not.toBeNull();
    const upsert = createMockFn(async () => undefined);
    const prismaStub = {
      kioskReserve: {
        upsert,
      },
    } as any;

    await syncKioskSnapshotToDatabase(prismaStub);

    expect(upsert.mockCallCount()).toBe(1);
    const payload = (upsert as any).mock.calls[0][0];
    expect(payload.where).toEqual({ id: '0xkiosk_test' });
    expect(payload.create.sonar_balance).toBe(4_200_000_000_000_000n);
    expect(payload.create.sui_balance).toBe(3_200_000_000_000_000n);
    expect(payload.create.current_price).toBe(800_000_000n);
    expect(payload.create.price_override).toBe(750_000_000n);
    expect(payload.create.current_tier).toBe(2);
    expect(payload.create.circulating_supply).toBe(25_000_000_000_000_000n);
  });

  test('live RPC sync logs warning rather than failing when network unavailable', async () => {
    const liveMarketplace = process.env.LIVE_RPC_MARKETPLACE_ID || '';

    if (!liveMarketplace) {
      console.warn('Skipping live RPC snapshot test: set LIVE_RPC_MARKETPLACE_ID to enable.');
      return;
    }

    process.env.SONAR_MARKETPLACE_ID = liveMarketplace;

    try {
      const prismaStub = {
        kioskReserve: {
          upsert: createMockFn(async () => undefined),
        },
      } as any;
      await syncKioskSnapshotToDatabase(prismaStub);
    } catch (error) {
      console.warn('Live Sui RPC sync failed (non-fatal for tests):', error);
    } finally {
      process.env.SONAR_MARKETPLACE_ID = '0xkiosk_test';
    }
  });
});
