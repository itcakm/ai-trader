/**
 * Cognito Client Service
 * 
 * Provides a wrapper around AWS Cognito Identity Provider operations.
 * All Cognito operations are proxied through this service for centralized
 * error handling, logging, and security controls.
 * 
 * Requirements: 3.1-3.12
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GlobalSignOutCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  RespondToAuthChallengeCommand,
  GetUserCommand,
  ChangePasswordCommand,
  AdminGetUserCommand,
  AuthFlowType,
  ChallengeNameType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  LoginRequest,
  LoginResponse,
  SignupRequest,
  SignupResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  MFASetupResponse,
  MFAVerifyResponse,
  MFAChallengeRequest,
  UserInfo,
  AuthError,
  AUTH_ERROR_CODES,
  TokenPayload,
} from '../types/auth';
import * as jwt from 'jsonwebtoken';

/**
 * Configuration for the Cognito Client Service
 */
export interface CognitoClientConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

/**
 * Get configuration from environment variables
 */
function getConfig(): CognitoClientConfig {
  const region = process.env.AWS_REGION || process.env.COGNITO_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!region || !userPoolId || !clientId) {
    throw new Error('Missing required Cognito configuration environment variables');
  }

  return { region, userPoolId, clientId };
}

/**
 * Create Cognito client instance
 */
function createClient(config: CognitoClientConfig): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({ region: config.region });
}

/**
 * Parse ID token to extract user information
 */
function parseIdToken(idToken: string): UserInfo {
  const decoded = jwt.decode(idToken) as TokenPayload;
  
  if (!decoded) {
    throw new AuthError(AUTH_ERROR_CODES.INVALID_TOKEN, 'Failed to decode ID token', 401);
  }

  return {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name || '',
    tenantId: decoded['custom:tenant_id'] || '',
    roles: decoded['custom:roles'] ? JSON.parse(decoded['custom:roles']) : [],
    emailVerified: decoded.email_verified,
  };
}

/**
 * Map Cognito errors to AuthError
 */
function mapCognitoError(error: any): AuthError {
  const errorName = error.name || error.code || '';
  const errorMessage = error.message || 'Authentication failed';

  switch (errorName) {
    case 'NotAuthorizedException':
      // Don't reveal if user exists or not
      return new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password', 401);
    
    case 'UserNotFoundException':
      // Don't reveal user existence
      return new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password', 401);
    
    case 'UserNotConfirmedException':
      return new AuthError(AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED, 'Please verify your email address', 403);
    
    case 'UsernameExistsException':
      return new AuthError(AUTH_ERROR_CODES.USER_EXISTS, 'An account with this email already exists', 409);
    
    case 'InvalidPasswordException':
      return new AuthError(AUTH_ERROR_CODES.WEAK_PASSWORD, 'Password does not meet requirements', 400);
    
    case 'CodeMismatchException':
      return new AuthError(AUTH_ERROR_CODES.INVALID_MFA_CODE, 'Invalid verification code', 401);
    
    case 'ExpiredCodeException':
      return new AuthError(AUTH_ERROR_CODES.CODE_EXPIRED, 'Verification code has expired', 401);
    
    case 'LimitExceededException':
      return new AuthError(AUTH_ERROR_CODES.TOO_MANY_REQUESTS, 'Too many requests, please try again later', 429, 60);
    
    case 'TooManyRequestsException':
      return new AuthError(AUTH_ERROR_CODES.TOO_MANY_REQUESTS, 'Too many requests, please try again later', 429, 60);
    
    case 'PasswordResetRequiredException':
      return new AuthError(AUTH_ERROR_CODES.PASSWORD_RESET_REQUIRED, 'Password reset required', 403);
    
    case 'UserLambdaValidationException':
      return new AuthError(AUTH_ERROR_CODES.AUTH_ERROR, 'Validation failed', 400);
    
    default:
      console.error('Unhandled Cognito error:', errorName, errorMessage);
      return new AuthError(AUTH_ERROR_CODES.AUTH_ERROR, 'Authentication failed', 500);
  }
}


/**
 * Cognito Client Service
 * 
 * Provides wrapper methods for all Cognito operations with centralized
 * error handling and logging.
 */
export const CognitoClientService = {
  _client: null as CognitoIdentityProviderClient | null,
  _config: null as CognitoClientConfig | null,

  /**
   * Initialize the service with configuration
   */
  initialize(config?: Partial<CognitoClientConfig>): void {
    const envConfig = getConfig();
    this._config = { ...envConfig, ...config };
    this._client = createClient(this._config);
  },

  /**
   * Get the Cognito client, initializing if needed
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
  getConfig(): CognitoClientConfig {
    if (!this._config) {
      this._config = getConfig();
    }
    return this._config;
  },

  /**
   * Sign up a new user
   * Requirements: 3.1
   */
  async signUp(request: SignupRequest): Promise<SignupResponse> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new SignUpCommand({
        ClientId: config.clientId,
        Username: request.email,
        Password: request.password,
        UserAttributes: [
          { Name: 'email', Value: request.email },
          { Name: 'name', Value: request.name },
          ...(request.tenantId ? [{ Name: 'custom:tenant_id', Value: request.tenantId }] : []),
        ],
      });

      const result = await client.send(command);

      return {
        userId: result.UserSub!,
        userConfirmed: result.UserConfirmed || false,
        codeDeliveryDetails: result.CodeDeliveryDetails ? {
          destination: result.CodeDeliveryDetails.Destination || '',
          deliveryMedium: result.CodeDeliveryDetails.DeliveryMedium as 'EMAIL' | 'SMS',
          attributeName: result.CodeDeliveryDetails.AttributeName || '',
        } : undefined,
      };
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Authenticate a user with email and password
   * Requirements: 3.2
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: config.clientId,
        AuthParameters: {
          USERNAME: request.email,
          PASSWORD: request.password,
        },
      });

      const result = await client.send(command);

      // Handle MFA challenge
      if (result.ChallengeName === ChallengeNameType.SOFTWARE_TOKEN_MFA) {
        return {
          challengeType: 'MFA',
          session: result.Session,
        };
      }

      // Handle new password required
      if (result.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED) {
        return {
          challengeType: 'NEW_PASSWORD_REQUIRED',
          session: result.Session,
        };
      }

      // Successful authentication
      if (result.AuthenticationResult) {
        const tokens = {
          accessToken: result.AuthenticationResult.AccessToken!,
          refreshToken: result.AuthenticationResult.RefreshToken!,
          idToken: result.AuthenticationResult.IdToken!,
          expiresIn: result.AuthenticationResult.ExpiresIn!,
        };

        const user = parseIdToken(tokens.idToken);

        return { tokens, user };
      }

      throw new AuthError(AUTH_ERROR_CODES.AUTH_ERROR, 'Unexpected authentication response', 500);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw mapCognitoError(error);
    }
  },

  /**
   * Sign out a user globally (invalidate all tokens)
   * Requirements: 3.3
   */
  async logout(accessToken: string): Promise<void> {
    const client = this.getClient();

    try {
      const command = new GlobalSignOutCommand({
        AccessToken: accessToken,
      });

      await client.send(command);
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Refresh access token using refresh token
   * Requirements: 3.4
   */
  async refreshToken(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: config.clientId,
        AuthParameters: {
          REFRESH_TOKEN: request.refreshToken,
        },
      });

      const result = await client.send(command);

      if (!result.AuthenticationResult) {
        throw new AuthError(AUTH_ERROR_CODES.TOKEN_REFRESH_FAILED, 'Failed to refresh token', 401);
      }

      return {
        accessToken: result.AuthenticationResult.AccessToken!,
        idToken: result.AuthenticationResult.IdToken!,
        expiresIn: result.AuthenticationResult.ExpiresIn!,
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw mapCognitoError(error);
    }
  },

  /**
   * Confirm user signup with verification code
   * Requirements: 3.5
   */
  async confirmSignUp(email: string, code: string): Promise<void> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new ConfirmSignUpCommand({
        ClientId: config.clientId,
        Username: email,
        ConfirmationCode: code,
      });

      await client.send(command);
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Resend confirmation code
   * Requirements: 3.6
   */
  async resendConfirmationCode(email: string): Promise<void> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new ResendConfirmationCodeCommand({
        ClientId: config.clientId,
        Username: email,
      });

      await client.send(command);
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Initiate forgot password flow
   * Requirements: 3.7
   */
  async forgotPassword(email: string): Promise<void> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new ForgotPasswordCommand({
        ClientId: config.clientId,
        Username: email,
      });

      await client.send(command);
    } catch (error) {
      // Don't reveal if user exists
      if ((error as any).name === 'UserNotFoundException') {
        return; // Silently succeed
      }
      throw mapCognitoError(error);
    }
  },

  /**
   * Confirm forgot password with code and new password
   * Requirements: 3.8
   */
  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new ConfirmForgotPasswordCommand({
        ClientId: config.clientId,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      });

      await client.send(command);
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Associate software token for MFA setup
   * Requirements: 3.9
   */
  async setupMFA(accessToken: string): Promise<MFASetupResponse> {
    const client = this.getClient();

    try {
      const command = new AssociateSoftwareTokenCommand({
        AccessToken: accessToken,
      });

      const result = await client.send(command);

      return {
        secretCode: result.SecretCode!,
        session: result.Session || '',
      };
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Verify software token for MFA setup
   * Requirements: 3.10
   */
  async verifyMFASetup(
    accessToken: string,
    code: string,
    friendlyDeviceName?: string
  ): Promise<MFAVerifyResponse> {
    const client = this.getClient();

    try {
      const command = new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: code,
        FriendlyDeviceName: friendlyDeviceName,
      });

      const result = await client.send(command);

      return {
        status: result.Status === 'SUCCESS' ? 'SUCCESS' : 'ERROR',
      };
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Respond to MFA challenge during login
   * Requirements: 3.11
   */
  async respondToMFAChallenge(request: MFAChallengeRequest): Promise<LoginResponse> {
    const config = this.getConfig();
    const client = this.getClient();

    try {
      const command = new RespondToAuthChallengeCommand({
        ClientId: config.clientId,
        ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
        Session: request.session,
        ChallengeResponses: {
          SOFTWARE_TOKEN_MFA_CODE: request.code,
          USERNAME: '', // Will be populated from session
        },
      });

      const result = await client.send(command);

      if (!result.AuthenticationResult) {
        throw new AuthError(AUTH_ERROR_CODES.INVALID_MFA_CODE, 'Invalid MFA code', 401);
      }

      const tokens = {
        accessToken: result.AuthenticationResult.AccessToken!,
        refreshToken: result.AuthenticationResult.RefreshToken!,
        idToken: result.AuthenticationResult.IdToken!,
        expiresIn: result.AuthenticationResult.ExpiresIn!,
      };

      const user = parseIdToken(tokens.idToken);

      return { tokens, user };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw mapCognitoError(error);
    }
  },

  /**
   * Get current user profile from access token
   * Requirements: 3.12
   */
  async getCurrentUser(accessToken: string): Promise<UserInfo> {
    const client = this.getClient();

    try {
      const command = new GetUserCommand({
        AccessToken: accessToken,
      });

      const result = await client.send(command);

      const attributes: Record<string, string> = {};
      for (const attr of result.UserAttributes || []) {
        if (attr.Name && attr.Value) {
          attributes[attr.Name] = attr.Value;
        }
      }

      return {
        id: attributes['sub'] || result.Username!,
        email: attributes['email'] || '',
        name: attributes['name'] || '',
        tenantId: attributes['custom:tenant_id'] || '',
        roles: attributes['custom:roles'] ? JSON.parse(attributes['custom:roles']) : [],
        emailVerified: attributes['email_verified'] === 'true',
      };
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Change user password
   */
  async changePassword(
    accessToken: string,
    previousPassword: string,
    proposedPassword: string
  ): Promise<void> {
    const client = this.getClient();

    try {
      const command = new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: previousPassword,
        ProposedPassword: proposedPassword,
      });

      await client.send(command);
    } catch (error) {
      throw mapCognitoError(error);
    }
  },

  /**
   * Parse ID token to extract user info (utility method)
   */
  parseIdToken,
};

export { parseIdToken, mapCognitoError };
