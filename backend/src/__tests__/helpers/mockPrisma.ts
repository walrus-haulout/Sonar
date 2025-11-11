import { mock } from 'bun:test';

type AnyFn = (...args: any[]) => any;

export function createMockFn(defaultImpl: AnyFn = () => undefined) {
  let impl = defaultImpl;
  const queue: AnyFn[] = [];
  const calls: any[][] = [];

  const fn: AnyFn & {
    mock: { calls: any[][] };
    mockClear: () => void;
    mockImplementation: (nextImpl: AnyFn) => typeof fn;
    mockImplementationOnce: (nextImpl: AnyFn) => typeof fn;
    mockResolvedValue: (value: any) => typeof fn;
    mockResolvedValueOnce: (value: any) => typeof fn;
    mockCallCount: () => number;
  } = ((...args: any[]) => {
    calls.push(args);
    if (queue.length > 0) {
      return queue.shift()!(...args);
    }
    return impl(...args);
  }) as any;

  fn.mock = { calls };

  fn.mockClear = () => {
    calls.length = 0;
    queue.length = 0;
  };

  fn.mockImplementation = (nextImpl: AnyFn) => {
    impl = nextImpl;
    return fn;
  };

  fn.mockImplementationOnce = (nextImpl: AnyFn) => {
    queue.push(nextImpl);
    return fn;
  };

  fn.mockResolvedValue = (value: any) => fn.mockImplementation(() => Promise.resolve(value));
  fn.mockResolvedValueOnce = (value: any) => fn.mockImplementationOnce(() => Promise.resolve(value));

  fn.mockCallCount = () => calls.length;

  return fn;
}

const priceHistoryFindMany = createMockFn(async () => []);
const datasetFindUnique = createMockFn(async () => null);
const accessLogCreate = createMockFn(async () => undefined);

export const prismaMock = {
  priceHistory: {
    findMany: priceHistoryFindMany,
  },
  dataset: {
    findUnique: datasetFindUnique,
  },
  accessLog: {
    create: accessLogCreate,
  },
};

export const prismaFns = {
  priceHistoryFindMany,
  datasetFindUnique,
  accessLogCreate,
};

export function resetPrismaMock() {
  Object.values(prismaFns).forEach((fn) => fn.mockClear());
}

const installedSpecs = new Set<string>();

export function ensurePrismaMock(specifier: string) {
  if (installedSpecs.has(specifier)) return;
  mock.module(specifier, () => ({ prisma: prismaMock }));
  installedSpecs.add(specifier);
}
