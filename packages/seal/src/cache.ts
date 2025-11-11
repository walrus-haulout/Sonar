/**
 * @sonar/seal - Cache Implementation
 * IndexedDB and memory cache strategies for session keys and decryption keys
 */

import type { CacheStrategy } from './types';
import {
  INDEXEDDB_NAME,
  INDEXEDDB_VERSION,
  INDEXEDDB_STORES,
  SESSION_CACHE_TTL_MS,
  KEY_CACHE_TTL_MS,
  HAS_INDEXEDDB,
} from './constants';
import { SessionError } from './errors';
import { SealErrorCode } from './types';

/**
 * IndexedDB cache implementation
 */
export class IndexedDBCache implements CacheStrategy {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    if (HAS_INDEXEDDB) {
      this.initPromise = this.initialize();
    }
  }

  /**
   * Initialize IndexedDB
   */
  private async initialize(): Promise<void> {
    if (!HAS_INDEXEDDB) {
      throw new SessionError(
        SealErrorCode.CACHE_ERROR,
        'IndexedDB not available in this environment'
      );
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

      request.onerror = () => {
        reject(new SessionError(
          SealErrorCode.CACHE_ERROR,
          'Failed to open IndexedDB',
          request.error || undefined
        ));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create sessions store
        if (!db.objectStoreNames.contains(INDEXEDDB_STORES.SESSIONS)) {
          const sessionStore = db.createObjectStore(INDEXEDDB_STORES.SESSIONS, {
            keyPath: 'packageId',
          });
          sessionStore.createIndex('address', 'address', { unique: false });
          sessionStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        }

        // Create keys store
        if (!db.objectStoreNames.contains(INDEXEDDB_STORES.KEYS)) {
          const keyStore = db.createObjectStore(INDEXEDDB_STORES.KEYS, {
            keyPath: 'key',
          });
          keyStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };
    });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.db) {
      throw new SessionError(
        SealErrorCode.CACHE_ERROR,
        'IndexedDB not initialized'
      );
    }
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<any | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [INDEXEDDB_STORES.SESSIONS, INDEXEDDB_STORES.KEYS],
        'readonly'
      );

      // Try sessions store first
      const sessionRequest = transaction
        .objectStore(INDEXEDDB_STORES.SESSIONS)
        .get(key);

      sessionRequest.onsuccess = () => {
        if (sessionRequest.result) {
          // Check if expired
          if (sessionRequest.result.expiresAt < Date.now()) {
            // Delete expired entry
            this.delete(key).catch(console.error);
            resolve(null);
          } else {
            resolve(sessionRequest.result);
          }
        } else {
          // Try keys store
          const keyRequest = transaction
            .objectStore(INDEXEDDB_STORES.KEYS)
            .get(key);

          keyRequest.onsuccess = () => {
            if (keyRequest.result) {
              // Check if expired
              const expiresAt = keyRequest.result.cachedAt + KEY_CACHE_TTL_MS;
              if (expiresAt < Date.now()) {
                this.delete(key).catch(console.error);
                resolve(null);
              } else {
                resolve(keyRequest.result);
              }
            } else {
              resolve(null);
            }
          };

          keyRequest.onerror = () => reject(keyRequest.error);
        }
      };

      sessionRequest.onerror = () => reject(sessionRequest.error);
    });
  }

  /**
   * Set value in cache
   */
  async set(_key: string, value: any, _ttl?: number): Promise<void> {
    await this.ensureInitialized();

    // Determine which store to use based on value structure
    const storeName = value.data && value.address
      ? INDEXEDDB_STORES.SESSIONS
      : INDEXEDDB_STORES.KEYS;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const request = store.put(value);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [INDEXEDDB_STORES.SESSIONS, INDEXEDDB_STORES.KEYS],
        'readwrite'
      );

      // Delete from both stores
      const sessionStore = transaction.objectStore(INDEXEDDB_STORES.SESSIONS);
      const keyStore = transaction.objectStore(INDEXEDDB_STORES.KEYS);

      sessionStore.delete(key);
      keyStore.delete(key);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Clear all cached values
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [INDEXEDDB_STORES.SESSIONS, INDEXEDDB_STORES.KEYS],
        'readwrite'
      );

      transaction.objectStore(INDEXEDDB_STORES.SESSIONS).clear();
      transaction.objectStore(INDEXEDDB_STORES.KEYS).clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<void> {
    await this.ensureInitialized();

    const now = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [INDEXEDDB_STORES.SESSIONS, INDEXEDDB_STORES.KEYS],
        'readwrite'
      );

      // Clean sessions
      const sessionStore = transaction.objectStore(INDEXEDDB_STORES.SESSIONS);
      const sessionIndex = sessionStore.index('expiresAt');
      const sessionRange = IDBKeyRange.upperBound(now);
      const sessionRequest = sessionIndex.openCursor(sessionRange);

      sessionRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Clean keys
      const keyStore = transaction.objectStore(INDEXEDDB_STORES.KEYS);
      const keyIndex = keyStore.index('cachedAt');
      const keyRange = IDBKeyRange.upperBound(now - KEY_CACHE_TTL_MS);
      const keyRequest = keyIndex.openCursor(keyRange);

      keyRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

/**
 * Memory cache implementation (fallback for non-browser environments)
 */
export class MemoryCache implements CacheStrategy {
  private cache = new Map<string, { value: any; expiresAt: number }>();

  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: any, ttl: number = SESSION_CACHE_TTL_MS): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * No-op cache (disables caching)
 */
export class NoCache implements CacheStrategy {
  async get(_key: string): Promise<any | null> {
    return null;
  }

  async set(_key: string, _value: any, _ttl?: number): Promise<void> {
    // No-op
  }

  async delete(_key: string): Promise<void> {
    // No-op
  }

  async clear(): Promise<void> {
    // No-op
  }

  async has(_key: string): Promise<boolean> {
    return false;
  }
}

/**
 * Create cache instance based on strategy
 */
export function createCache(strategy: 'indexeddb' | 'memory' | 'none' = 'indexeddb'): CacheStrategy {
  switch (strategy) {
    case 'indexeddb':
      return HAS_INDEXEDDB ? new IndexedDBCache() : new MemoryCache();
    case 'memory':
      return new MemoryCache();
    case 'none':
      return new NoCache();
    default:
      throw new SessionError(
        SealErrorCode.CACHE_ERROR,
        `Unknown cache strategy: ${strategy}`
      );
  }
}

/**
 * Global cache instance
 */
let globalCache: CacheStrategy | null = null;

/**
 * Get global cache instance
 */
export function getCache(): CacheStrategy {
  if (!globalCache) {
    globalCache = createCache();
  }
  return globalCache;
}

/**
 * Set global cache instance
 */
export function setCache(cache: CacheStrategy): void {
  globalCache = cache;
}
