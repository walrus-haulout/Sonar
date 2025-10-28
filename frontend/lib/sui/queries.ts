import { gql } from 'graphql-request';

/**
 * Fragment for common dataset fields
 */
export const DATASET_FRAGMENT = gql`
  fragment DatasetFields on MoveObject {
    address
    version
    digest
    owner {
      ... on AddressOwner {
        owner {
          address
        }
      }
      ... on Shared {
        initialSharedVersion
      }
    }
    asMoveObject {
      contents {
        type {
          repr
        }
        json
      }
    }
  }
`;

/**
 * Query all datasets from the marketplace
 */
export const GET_DATASETS = gql`
  ${DATASET_FRAGMENT}
  query GetDatasets($type: String!, $cursor: String) {
    objects(first: 50, after: $cursor, filter: { type: $type }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...DatasetFields
      }
    }
  }
`;

/**
 * Query a single dataset by ID
 */
export const GET_DATASET = gql`
  query GetDataset($id: SuiAddress!) {
    object(address: $id) {
      address
      version
      digest
      asMoveObject {
        contents {
          type {
            repr
          }
          json
        }
      }
    }
  }
`;

/**
 * Query protocol stats object
 */
export const GET_PROTOCOL_STATS = gql`
  query GetProtocolStats($statsObjectId: SuiAddress!) {
    object(address: $statsObjectId) {
      address
      asMoveObject {
        contents {
          json
        }
      }
    }
  }
`;

/**
 * Query user's SONAR token balance
 */
export const GET_USER_BALANCE = gql`
  query GetUserBalance($owner: SuiAddress!, $coinType: String!) {
    address(address: $owner) {
      balance(type: $coinType) {
        totalBalance
        coinObjectCount
      }
      coins(type: $coinType, first: 100) {
        nodes {
          coinBalance
          address
        }
      }
    }
  }
`;

/**
 * Query recent purchase events
 */
export const GET_PURCHASE_EVENTS = gql`
  query GetPurchaseEvents($eventType: String!, $cursor: String) {
    events(filter: { eventType: $eventType }, first: 20, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        json
        timestamp
        sender {
          address
        }
        txDigest
      }
    }
  }
`;

/**
 * Query datasets owned by a specific address
 */
export const GET_USER_DATASETS = gql`
  ${DATASET_FRAGMENT}
  query GetUserDatasets($owner: SuiAddress!, $type: String!, $cursor: String) {
    objects(
      first: 50
      after: $cursor
      filter: { type: $type, owner: $owner }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ...DatasetFields
      }
    }
  }
`;
