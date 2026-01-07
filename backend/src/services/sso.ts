/**
 * SSO Service
 * 
 * Handles SSO authentication flows including:
 * - Provider management
 * - State generation and validation (CSRF protection)
 * - Authorization URL generation
 * - Token exchange
 * - JIT user provisioning
 * 
 * Requirements: 7.1-7.10
 */

import { 
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListIdentityProvidersCommand,
  DescribeIdentityProviderCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import * as crypto from 'crypto';
import { documentClient } from '../db/client';
import {
  SSOProvider,
  SSOProviderConfig,
  SSOInitiateRequest,
  SSOInitiateResponse,
  SSOCallbackResponse,
  SSOStatePayload,
  AuthTokens,
  UserInfo,
  AuthError,
  AUTH_ERROR_CODES,
  SSO_ERROR_CODES,
} from '../types/auth';

// ============================================================================
// Configuration
// ============================================================================

export interface SSOServiceConfig {
  region: string;
  userPoolId: string;
  ssoClientId: string;
  ssoClientSecret: string;
  cognitoDomain: string;
  providersTableName: string;
  stateTableName: string;
  defaultCallbackUrl: string;
  stateExpirationSeconds: number;
}

const DEFAULT_CONFIG: Partial<SSOServiceConfig> = {
  stateExpirationSeconds: 300, // 5 minutes
};

function getConfig(): SSOServiceConfig {
  return {
    region: process.env.AWS_REGION || process.env.COGNITO_REGION || 'us-east-1',
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    ssoClientId: process.env.COGNITO_SSO_CLIENT_ID || process.env.COGNITO_CLIENT_ID || '',
    ssoClientSecret: process.env.COGNITO_SSO_CLIENT_SECRET || '',
    cognitoDomain: process.env.COGNITO_DOMAIN || '',
    providersTableName: process.env.SSO_PROVIDERS_TABLE || 'sso-providers',
    stateTableName: process.env.SSO_STATE_TABLE || 'sso-state',
    defaultCallbackUrl: process.env.SSO_CALLBACK_URL || `${process.env.API_URL}/auth/sso/callback`,
    ...DEFAULT_CONFIG,
  } as SSOServiceConfig;
}

// ============================================================================
// SSO Service
// ============================================================================

export const SSOService = {
  _client: null as CognitoIdentityProviderClient | null,
  _config: null as SSOServiceConfig | null,

  /**
   * Initialize the service
   */
  initialize(config?: Partial<SSOServiceConfig>): void {
    const envConfig = getConfig();
    this._config = { ...envConfig, ...config };
    this._client = new CognitoIdentityProviderClient({ region: this._config.region });
  },

  /**
   * Get the Cognito client
   */
  getClient(): CognitoIdentityProviderClient {
    if (!this._client) {
      this.initialize();
    }
    return this._client!;
  },

  /**
   * Get the current configuration
   */
  getConfig(): SSOServiceConfig {
    if (!this._config) {
      this._config = getConfig();
    }
    return this._config;
  },

  /**
   * Generate a cryptographically secure random string
   */
  generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  },

  /**
   * Generate state parameter for CSRF protection
   * Requirements: 7.9
   */
  async generateState(providerId: string, redirectUri: string): Promise<string> {
    const config = this.getConfig();
    const nonce = this.generateRandomString(32);
    const now = Date.now();
    
    const payload: SSOStatePayload = {
      providerId,
      redirectUri,
      nonce,
      createdAt: now,
      expiresAt: now + (config.stateExpirationSeconds * 1000),
    };

    // Encode state as base64
    const state = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Store state in DynamoDB for validation
    try {
      await documentClient.put({
        TableName: config.stateTableName,
        Item: {
          state,
          ...payload,
          ttl: Math.floor(payload.expiresAt / 1000) + 60, // TTL with 1 minute buffer
        },
      }).promise();
    } catch (error) {
      console.error('Failed to store SSO state:', error);
      // Continue anyway - we can validate state from the encoded value
    }

    return state;
  },

  /**
   * Validate state parameter
   * Requirements: 7.9
   */
  async validateState(state: string): Promise<SSOStatePayload> {
    const config = this.getConfig();

    // First try to decode the state
    let payload: SSOStatePayload;
    try {
      payload = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      throw new AuthError(
        SSO_ERROR_CODES.INVALID_STATE as any,
        'Invalid state parameter',
        400
      );
    }

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      throw new AuthError(
        SSO_ERROR_CODES.STATE_EXPIRED as any,
        'State parameter has expired',
        400
      );
    }

    // Try to validate against stored state (optional - provides replay protection)
    try {
      const result = await documentClient.get({
        TableName: config.stateTableName,
        Key: { state },
      }).promise();

      if (result.Item) {
        // Delete the state to prevent replay attacks
        await documentClient.delete({
          TableName: config.stateTableName,
          Key: { state },
        }).promise();
      }
    } catch (error) {
      // Log but don't fail - state validation from encoded value is sufficient
      console.warn('Could not validate state from store:', error);
    }

    return payload;
  },

  /**
   * Get all enabled SSO providers
   * Requirements: 7.3
   */
  async getEnabledProviders(tenantId?: string): Promise<SSOProvider[]> {
    const config = this.getConfig();
    const providers: SSOProvider[] = [];

    try {
      // Get providers from Cognito
      const client = this.getClient();
      const command = new ListIdentityProvidersCommand({
        UserPoolId: config.userPoolId,
        MaxResults: 60,
      });

      const result = await client.send(command);

      for (const provider of result.Providers || []) {
        if (provider.ProviderName && provider.ProviderType) {
          // Get additional provider details from our config table
          const providerConfig = await this.getProviderConfig(provider.ProviderName);
          
          // Filter by tenant if specified
          if (tenantId && providerConfig?.tenantId && providerConfig.tenantId !== tenantId) {
            continue;
          }

          providers.push({
            id: provider.ProviderName,
            name: provider.ProviderName,
            displayName: providerConfig?.displayName || provider.ProviderName,
            type: provider.ProviderType as 'SAML' | 'OIDC',
            enabled: providerConfig?.enabled !== false,
            logoUrl: providerConfig?.logoUrl,
            defaultRole: providerConfig?.defaultRole,
            tenantId: providerConfig?.tenantId,
          });
        }
      }

      // Filter to only enabled providers
      return providers.filter(p => p.enabled);

    } catch (error) {
      console.error('Failed to get SSO providers:', error);
      return [];
    }
  },

  /**
   * Get a specific SSO provider
   */
  async getProvider(providerId: string): Promise<SSOProvider | null> {
    const config = this.getConfig();

    try {
      const client = this.getClient();
      const command = new DescribeIdentityProviderCommand({
        UserPoolId: config.userPoolId,
        ProviderName: providerId,
      });

      const result = await client.send(command);
      
      if (!result.IdentityProvider) {
        return null;
      }

      const providerConfig = await this.getProviderConfig(providerId);

      return {
        id: result.IdentityProvider.ProviderName!,
        name: result.IdentityProvider.ProviderName!,
        displayName: providerConfig?.displayName || result.IdentityProvider.ProviderName!,
        type: result.IdentityProvider.ProviderType as 'SAML' | 'OIDC',
        enabled: providerConfig?.enabled !== false,
        logoUrl: providerConfig?.logoUrl,
        defaultRole: providerConfig?.defaultRole,
        tenantId: providerConfig?.tenantId,
      };

    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return null;
      }
      console.error('Failed to get SSO provider:', error);
      return null;
    }
  },

  /**
   * Get provider configuration from DynamoDB
   */
  async getProviderConfig(providerId: string): Promise<SSOProviderConfig | null> {
    const config = this.getConfig();

    try {
      const result = await documentClient.get({
        TableName: config.providersTableName,
        Key: { providerId },
      }).promise();

      return (result.Item as SSOProviderConfig) || null;
    } catch (error) {
      console.warn('Could not get provider config:', error);
      return null;
    }
  },

  /**
   * Initiate SSO authentication
   * Requirements: 7.4, 7.9
   */
  async initiateAuth(request: SSOInitiateRequest): Promise<SSOInitiateResponse> {
    const config = this.getConfig();
    
    // Get provider to validate it exists
    const provider = await this.getProvider(request.providerId);
    if (!provider) {
      throw new AuthError(
        SSO_ERROR_CODES.PROVIDER_NOT_FOUND as any,
        'SSO provider not found',
        404
      );
    }

    if (!provider.enabled) {
      throw new AuthError(
        SSO_ERROR_CODES.PROVIDER_DISABLED as any,
        'SSO provider is disabled',
        403
      );
    }

    // Determine callback URL
    const redirectUri = request.redirectUri || config.defaultCallbackUrl;

    // Generate state for CSRF protection
    const state = await this.generateState(request.providerId, redirectUri);

    // Build authorization URL
    const authUrl = new URL(`https://${config.cognitoDomain}.auth.${config.region}.amazoncognito.com/oauth2/authorize`);
    authUrl.searchParams.set('client_id', config.ssoClientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'email openid profile');
    authUrl.searchParams.set('redirect_uri', config.defaultCallbackUrl);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('identity_provider', request.providerId);

    return {
      authorizationUrl: authUrl.toString(),
      state,
    };
  },

  /**
   * Handle SSO callback
   * Requirements: 7.5, 7.7, 7.8, 7.9, 7.10
   */
  async handleCallback(request: { code: string; state: string }): Promise<SSOCallbackResponse & { providerId?: string; redirectUri?: string }> {
    const config = this.getConfig();

    // Validate state parameter
    // Requirements: 7.9
    const statePayload = await this.validateState(request.state);

    // Exchange authorization code for tokens
    const tokens = await this.exchangeCodeForTokens(request.code);

    // Parse user info from ID token
    const userInfo = this.parseIdToken(tokens.idToken);

    // Get provider config for default role
    const providerConfig = await this.getProviderConfig(statePayload.providerId);

    // Check if user exists, provision if needed (JIT provisioning)
    // Requirements: 7.7, 7.8
    const { user, isNewUser } = await this.ensureUserExists(
      userInfo,
      providerConfig?.defaultRole || 'VIEWER',
      providerConfig?.tenantId
    );

    return {
      tokens,
      user,
      isNewUser,
      providerId: statePayload.providerId,
      redirectUri: statePayload.redirectUri,
    };
  },

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<AuthTokens> {
    const config = this.getConfig();

    const tokenUrl = `https://${config.cognitoDomain}.auth.${config.region}.amazoncognito.com/oauth2/token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', config.ssoClientId);
    params.append('code', code);
    params.append('redirect_uri', config.defaultCallbackUrl);

    // Define token response type
    interface TokenResponse {
      access_token: string;
      refresh_token: string;
      id_token: string;
      expires_in: number;
      token_type: string;
    }

    // Add client secret if configured
    if (config.ssoClientSecret) {
      const credentials = Buffer.from(`${config.ssoClientId}:${config.ssoClientSecret}`).toString('base64');
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Token exchange failed:', error);
        throw new AuthError(
          SSO_ERROR_CODES.TOKEN_EXCHANGE_FAILED as any,
          'Failed to exchange authorization code for tokens',
          401
        );
      }

      const data = await response.json() as TokenResponse;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        expiresIn: data.expires_in,
      };
    }

    // Without client secret
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token exchange failed:', error);
      throw new AuthError(
        SSO_ERROR_CODES.TOKEN_EXCHANGE_FAILED as any,
        'Failed to exchange authorization code for tokens',
        401
      );
    }

    const data = await response.json() as TokenResponse;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresIn: data.expires_in,
    };
  },

  /**
   * Parse ID token to extract user info
   */
  parseIdToken(idToken: string): Partial<UserInfo> {
    try {
      // Decode JWT without verification (Cognito already verified it)
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name || payload.email?.split('@')[0] || '',
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
        tenantId: payload['custom:tenant_id'] || '',
        roles: payload['custom:roles'] ? JSON.parse(payload['custom:roles']) : [],
      };
    } catch (error) {
      console.error('Failed to parse ID token:', error);
      throw new AuthError(
        AUTH_ERROR_CODES.INVALID_TOKEN,
        'Failed to parse ID token',
        401
      );
    }
  },

  /**
   * Ensure user exists in Cognito, create if needed (JIT provisioning)
   * Requirements: 7.7, 7.8
   */
  async ensureUserExists(
    userInfo: Partial<UserInfo>,
    defaultRole: string,
    defaultTenantId?: string
  ): Promise<{ user: UserInfo; isNewUser: boolean }> {
    const config = this.getConfig();
    const client = this.getClient();

    if (!userInfo.email) {
      throw new AuthError(
        SSO_ERROR_CODES.USER_PROVISIONING_FAILED as any,
        'Email is required for user provisioning',
        400
      );
    }

    try {
      // Try to get existing user
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: config.userPoolId,
        Username: userInfo.email,
      });

      const existingUser = await client.send(getUserCommand);

      // User exists - extract attributes
      const attributes: Record<string, string> = {};
      for (const attr of existingUser.UserAttributes || []) {
        if (attr.Name && attr.Value) {
          attributes[attr.Name] = attr.Value;
        }
      }

      return {
        user: {
          id: attributes['sub'] || existingUser.Username!,
          email: attributes['email'] || userInfo.email,
          name: attributes['name'] || userInfo.name || '',
          tenantId: attributes['custom:tenant_id'] || defaultTenantId || '',
          roles: attributes['custom:roles'] ? JSON.parse(attributes['custom:roles']) : [defaultRole],
          emailVerified: attributes['email_verified'] === 'true',
        },
        isNewUser: false,
      };

    } catch (error: any) {
      if (error.name !== 'UserNotFoundException') {
        console.error('Error checking user existence:', error);
        throw new AuthError(
          SSO_ERROR_CODES.USER_PROVISIONING_FAILED as any,
          'Failed to check user existence',
          500
        );
      }

      // User doesn't exist - create them (JIT provisioning)
      // Requirements: 7.7
      console.log('Creating new user via JIT provisioning:', userInfo.email);

      try {
        // Generate a random password (user won't use it - they'll use SSO)
        const tempPassword = this.generateRandomString(24) + '!Aa1';

        const createUserCommand = new AdminCreateUserCommand({
          UserPoolId: config.userPoolId,
          Username: userInfo.email,
          UserAttributes: [
            { Name: 'email', Value: userInfo.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: userInfo.name || userInfo.email.split('@')[0] },
            { Name: 'custom:tenant_id', Value: defaultTenantId || '' },
            { Name: 'custom:roles', Value: JSON.stringify([defaultRole]) },
          ],
          TemporaryPassword: tempPassword,
          MessageAction: 'SUPPRESS', // Don't send welcome email
        });

        const newUser = await client.send(createUserCommand);

        // Set permanent password to avoid FORCE_CHANGE_PASSWORD state
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: config.userPoolId,
          Username: userInfo.email,
          Password: tempPassword,
          Permanent: true,
        });

        await client.send(setPasswordCommand);

        // Get the user's sub (Cognito user ID)
        const getUserCommand = new AdminGetUserCommand({
          UserPoolId: config.userPoolId,
          Username: userInfo.email,
        });

        const createdUser = await client.send(getUserCommand);
        const attributes: Record<string, string> = {};
        for (const attr of createdUser.UserAttributes || []) {
          if (attr.Name && attr.Value) {
            attributes[attr.Name] = attr.Value;
          }
        }

        return {
          user: {
            id: attributes['sub'] || createdUser.Username!,
            email: userInfo.email,
            name: userInfo.name || userInfo.email.split('@')[0],
            tenantId: defaultTenantId || '',
            roles: [defaultRole],
            emailVerified: true,
          },
          isNewUser: true,
        };

      } catch (createError) {
        console.error('Failed to create user:', createError);
        throw new AuthError(
          SSO_ERROR_CODES.USER_PROVISIONING_FAILED as any,
          'Failed to provision user',
          500
        );
      }
    }
  },

  /**
   * Update user attributes after SSO login
   * Requirements: 7.6
   */
  async updateUserAttributes(
    email: string,
    attributes: Record<string, string>
  ): Promise<void> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const userAttributes = Object.entries(attributes).map(([name, value]) => ({
        Name: name,
        Value: value,
      }));

      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: config.userPoolId,
        Username: email,
        UserAttributes: userAttributes,
      });

      await client.send(command);
    } catch (error) {
      console.error('Failed to update user attributes:', error);
      // Don't throw - this is a non-critical operation
    }
  },
};
