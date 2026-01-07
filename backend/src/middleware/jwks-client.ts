/**
 * JWKS Client with caching for Cognito JWT validation.
 * Fetches and caches JSON Web Key Sets from Cognito for token signature verification.
 * 
 * Requirements: 4.2, 4.3
 * - Cache JWKS with 1-hour TTL to reduce latency
 * - Enable rate limiting to prevent abuse
 */

import jwksClient, { JwksClient, SigningKey } from 'jwks-rsa';

// Environment variables for Cognito configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';

// Cache configuration
const CACHE_MAX_AGE_MS = 3600000; // 1 hour in milliseconds
const CACHE_MAX_ENTRIES = 5; // Maximum number of keys to cache
const RATE_LIMIT_PER_MINUTE = 10; // Maximum JWKS requests per minute

/**
 * Constructs the JWKS URI for a Cognito User Pool.
 */
export function getJwksUri(region: string = AWS_REGION, userPoolId: string = COGNITO_USER_POOL_ID): string {
  if (!userPoolId) {
    throw new Error('COGNITO_USER_POOL_ID environment variable is not set');
  }
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
}

/**
 * Creates a configured JWKS client with caching and rate limiting.
 * 
 * Features:
 * - Caches signing keys for 1 hour to reduce latency
 * - Rate limits requests to prevent abuse
 * - Supports key rotation by fetching new keys when needed
 */
export function createJwksClient(
  jwksUri?: string,
  options?: {
    cacheMaxAge?: number;
    cacheMaxEntries?: number;
    rateLimit?: boolean;
    rateLimitPerMinute?: number;
  }
): JwksClient {
  const uri = jwksUri || getJwksUri();
  
  return jwksClient({
    jwksUri: uri,
    cache: true,
    cacheMaxAge: options?.cacheMaxAge ?? CACHE_MAX_AGE_MS,
    cacheMaxEntries: options?.cacheMaxEntries ?? CACHE_MAX_ENTRIES,
    rateLimit: options?.rateLimit ?? true,
    jwksRequestsPerMinute: options?.rateLimitPerMinute ?? RATE_LIMIT_PER_MINUTE,
  });
}

// Singleton instance of the JWKS client
let jwksClientInstance: JwksClient | null = null;

/**
 * Gets the singleton JWKS client instance.
 * Creates a new instance if one doesn't exist.
 */
export function getJwksClient(): JwksClient {
  if (!jwksClientInstance) {
    jwksClientInstance = createJwksClient();
  }
  return jwksClientInstance;
}

/**
 * Resets the JWKS client instance.
 * Useful for testing or when configuration changes.
 */
export function resetJwksClient(): void {
  jwksClientInstance = null;
}

/**
 * Gets a signing key by its key ID (kid).
 * Uses the cached JWKS client for efficient key retrieval.
 * 
 * @param kid - The key ID from the JWT header
 * @returns The signing key for verification
 * @throws Error if the key is not found or JWKS fetch fails
 */
export async function getSigningKey(kid: string): Promise<SigningKey> {
  const client = getJwksClient();
  return client.getSigningKey(kid);
}

/**
 * Gets the public key string for JWT verification.
 * 
 * @param kid - The key ID from the JWT header
 * @returns The public key as a string (PEM format)
 */
export async function getPublicKey(kid: string): Promise<string> {
  const signingKey = await getSigningKey(kid);
  return signingKey.getPublicKey();
}

/**
 * Callback-style key getter for use with jsonwebtoken library.
 * Compatible with jwt.verify() secretOrPublicKeyProvider parameter.
 */
export function getKeyCallback(
  header: { kid?: string },
  callback: (err: Error | null, key?: string) => void
): void {
  if (!header.kid) {
    callback(new Error('JWT header missing kid (key ID)'));
    return;
  }

  getPublicKey(header.kid)
    .then((key) => callback(null, key))
    .catch((err) => callback(err));
}
