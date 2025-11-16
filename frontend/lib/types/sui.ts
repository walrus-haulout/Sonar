/**
 * Sui Blockchain Types
 * Type definitions for Sui Move transactions and objects
 */

/**
 * Represents a Sui transaction effect object
 */
export interface SuiTransactionEffect {
  status: {
    status: 'success' | 'failure';
    error?: string;
  };
  gasUsed?: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
  };
  transactionDigest?: string;
  created?: SuiCreatedObject[];
  mutated?: SuiMutatedObject[];
  unchanged?: unknown[];
  deleted?: unknown[];
  wrapped?: unknown[];
  gasObject?: unknown;
  eventsDigest?: string;
}

/**
 * Represents a newly created Sui object
 */
export interface SuiCreatedObject {
  objectId: string;
  version: number;
  digest: string;
  owner?: {
    AddressOwner?: string;
    ObjectOwner?: string;
    Shared?: unknown;
    Immutable?: unknown;
  };
}

/**
 * Represents a mutated Sui object
 */
export interface SuiMutatedObject {
  objectId: string;
  version: number;
  digest: string;
  owner?: {
    AddressOwner?: string;
    ObjectOwner?: string;
    Shared?: unknown;
    Immutable?: unknown;
  };
}

/**
 * Represents a Sui object change event
 */
export interface SuiObjectChange {
  type: 'created' | 'mutated' | 'transferred' | 'deleted' | 'wrapped';
  sender?: string;
  owner?: {
    AddressOwner?: string;
    ObjectOwner?: string;
    Shared?: unknown;
    Immutable?: unknown;
  };
  objectType?: string;
  objectId?: string;
  version?: number;
  previousVersion?: number;
  digest?: string;
  previousDigest?: string;
}

/**
 * Represents parsed JSON from a Sui event
 */
export interface SuiEventParsedJson {
  [key: string]: unknown;
  dataset_id?: string;
  datasetId?: string;
}

/**
 * Represents a Sui transaction event
 */
export interface SuiTransactionEvent {
  id: {
    txDigest: string;
    eventSeq: string;
  };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson?: SuiEventParsedJson;
  bcs?: string;
  timestampMs?: string;
}

/**
 * Represents a Sui transaction response
 */
export interface SuiTransactionResponse {
  digest: string;
  transaction?: {
    data: {
      messageVersion: string;
      transaction: unknown[];
    };
  };
  rawTransaction?: string;
  effects?: SuiTransactionEffect;
  events?: SuiTransactionEvent[];
  confirmedLocalExecution?: boolean;
  objectChanges?: SuiObjectChange[];
}

/**
 * Type guard for SuiCreatedObject
 */
export function isSuiCreatedObject(obj: unknown): obj is SuiCreatedObject {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'objectId' in obj &&
    'version' in obj
  );
}

/**
 * Extract object ID from various Sui object structures
 */
export function extractObjectId(obj: unknown): string | undefined {
  if (typeof obj === 'object' && obj !== null) {
    if ('objectId' in obj) return String((obj as { objectId: unknown }).objectId);
    if ('reference' in obj && typeof (obj as { reference: unknown }).reference === 'object') {
      const ref = (obj as { reference: unknown }).reference as {
        objectId?: unknown;
      };
      if ('objectId' in ref) return String(ref.objectId);
    }
  }
  return undefined;
}
