import { GraphQLClient } from 'graphql-request';
import { logger } from '@/lib/logger';

/**
 * GraphQL Endpoint Configuration
 *
 * Sui provides multiple GraphQL endpoints for redundancy:
 * - Beta endpoint: New high-performance GraphQL service (https://graphql.{network}.sui.io)
 * - Legacy endpoint: Original MystenLabs GraphQL service (https://sui-{network}.mystenlabs.com)
 *
 * The beta endpoint is preferred as primary due to better performance and reliability,
 * with legacy endpoint as a proven fallback option.
 */

export interface GraphQLEndpoint {
  url: string;
  name: string;
  timeout: number;
}

/**
 * Validate that an endpoint object has all required properties
 * Used for runtime validation to catch configuration issues early
 *
 * @param endpoint - Object to validate
 * @returns true if endpoint is valid, false otherwise
 */
export function isValidEndpoint(endpoint: any): endpoint is GraphQLEndpoint {
  if (!endpoint || typeof endpoint !== 'object') {
    return false;
  }

  return (
    typeof endpoint.url === 'string' &&
    endpoint.url.length > 0 &&
    typeof endpoint.name === 'string' &&
    endpoint.name.length > 0 &&
    typeof endpoint.timeout === 'number' &&
    endpoint.timeout > 0
  );
}

/**
 * Validate that a GraphQL client configuration object is valid
 *
 * @param config - Object to validate
 * @returns true if config is valid, false otherwise
 */
export function isValidGraphQLConfig(config: any): config is { client: GraphQLClient; endpoint: GraphQLEndpoint } {
  if (!config || typeof config !== 'object') {
    return false;
  }

  return (
    config.client instanceof GraphQLClient &&
    isValidEndpoint(config.endpoint)
  );
}

/**
 * Get GraphQL endpoints for the current network
 * Priority order: beta (primary) → legacy (fallback)
 */
export function getGraphQLEndpoints(network: string = 'testnet'): GraphQLEndpoint[] {
  const endpoints: GraphQLEndpoint[] = [
    {
      url: `https://graphql.${network}.sui.io/graphql`,
      name: 'beta',
      timeout: 30000, // 30 seconds
    },
    {
      url: `https://sui-${network}.mystenlabs.com/graphql`,
      name: 'legacy',
      timeout: 30000, // 30 seconds
    },
  ];

  // Allow environment variable override for custom GraphQL URL
  // Only use if it's a custom URL (not matching the default pattern)
  const customUrl = process.env.NEXT_PUBLIC_GRAPHQL_URL;
  if (customUrl) {
    const isDefault = endpoints.some(e => e.url === customUrl);
    const isDefaultPattern =
      customUrl.includes(`graphql.${network}.sui.io`) ||
      customUrl.includes(`sui-${network}.mystenlabs.com`);

    // Only add as custom if it's truly a non-default URL
    if (!isDefault && !isDefaultPattern) {
      endpoints.unshift({
        url: customUrl,
        name: 'custom',
        timeout: 30000,
      });
    }
  }

  return endpoints;
}

/**
 * Create configured GraphQL clients for all available endpoints
 * Each client has timeout and request headers configured
 *
 * @param network - Sui network (testnet, mainnet, devnet)
 * @returns Array of GraphQLClient instances with endpoint metadata
 */
export function createGraphQLClients(network: string = 'testnet'): Array<{
  client: GraphQLClient;
  endpoint: GraphQLEndpoint;
}> {
  const endpoints = getGraphQLEndpoints(network);
  const clients: Array<{ client: GraphQLClient; endpoint: GraphQLEndpoint }> = [];

  for (const endpoint of endpoints) {
    try {
      // Validate endpoint configuration first
      if (!isValidEndpoint(endpoint)) {
        const endpointAny = endpoint as any;
        logger.warn(`Invalid GraphQL endpoint configuration`, {
          endpoint,
          network,
          hasUrl: !!endpointAny?.url,
          hasName: !!endpointAny?.name,
          hasTimeout: !!endpointAny?.timeout,
        });
        continue;
      }

      const client = new GraphQLClient(endpoint.url, {
        headers: {
          'User-Agent': 'SONAR-Marketplace/1.0',
          'X-Client-Version': '1.0.0',
        },
        // Note: graphql-request doesn't support timeout in constructor
        // Timeout is handled by the underlying fetch implementation
        // For custom timeout, use AbortController with signal
      });

      // Validate client was created successfully
      if (!client) {
        logger.warn(`Failed to create GraphQL client for endpoint: ${endpoint.name}`, {
          url: endpoint.url,
          network,
        });
        continue;
      }

      // Final validation of the complete configuration
      const config = { client, endpoint };
      if (!isValidGraphQLConfig(config)) {
        logger.warn(`Invalid GraphQL client configuration created`, {
          endpointName: endpoint.name,
          network,
        });
        continue;
      }

      clients.push(config);
      logger.debug(`GraphQL client created for ${endpoint.name}`, {
        url: endpoint.url,
        network,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error creating GraphQL client for endpoint: ${endpoint.name}`, err, {
        url: endpoint.url,
        network,
      });
      // Continue to next endpoint rather than failing completely
      continue;
    }
  }

  // Validate we have at least one valid client
  if (clients.length === 0) {
    const fallbackEndpoint = endpoints[0];
    logger.warn('No valid GraphQL clients created, using fallback with error handling', {
      network,
      attemptedEndpoints: endpoints.length,
    });

    try {
      const fallbackClient = new GraphQLClient(fallbackEndpoint.url, {
        headers: {
          'User-Agent': 'SONAR-Marketplace/1.0',
          'X-Client-Version': '1.0.0',
        },
      });
      clients.push({ client: fallbackClient, endpoint: fallbackEndpoint });
    } catch (error) {
      logger.error('Critical: Unable to create even fallback GraphQL client',
        error instanceof Error ? error : new Error(String(error)),
        { network }
      );
    }
  }

  logger.info(`GraphQL clients initialized`, {
    network,
    totalEndpoints: endpoints.length,
    validClients: clients.length,
    endpoints: endpoints.map(e => ({ name: e.name, url: e.url })),
  });

  return clients;
}

/**
 * Create a single GraphQL client for backwards compatibility
 * Uses the first endpoint (highest priority)
 *
 * @param network - Sui network (testnet, mainnet, devnet)
 * @returns Configured GraphQLClient instance
 */
export function createGraphQLClient(network: string = 'testnet'): GraphQLClient {
  const endpoints = getGraphQLEndpoints(network);
  const primaryEndpoint = endpoints[0];

  return new GraphQLClient(primaryEndpoint.url, {
    headers: {
      'User-Agent': 'SONAR-Marketplace/1.0',
      'X-Client-Version': '1.0.0',
    },
    // Note: graphql-request doesn't support timeout in constructor
    // Timeout is handled by the underlying fetch implementation
  });
}
