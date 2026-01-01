'use client';

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import type { SSOProvider as SSOProviderConfig, AuthSession, Role } from '@/types/auth';
import { mergePermissions } from './AuthProvider';

// SSO Configuration
export interface SSOConfig {
  cognitoDomain: string;
  clientId: string;
  redirectUri: string;
  providers: SSOProviderConfig[];
}

// SSO Context Value
export interface SSOContextValue {
  providers: SSOProviderConfig[];
  getEnabledProviders: () => SSOProviderConfig[];
  initiateSSO: (providerId: string) => void;
  handleSSOCallback: (code: string, state: string) => Promise<AuthSession>;
  getSSOLoginUrl: (providerId: string) => string;
}

// Context
const SSOContext = createContext<SSOContextValue | undefined>(undefined);

// Generate state for CSRF protection
function generateState(): string {
  const array = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Store state for verification
const SSO_STATE_KEY = 'crypto-trading-sso-state';

function storeState(state: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SSO_STATE_KEY, state);
}

function verifyState(state: string): boolean {
  if (typeof window === 'undefined') return false;
  const storedState = sessionStorage.getItem(SSO_STATE_KEY);
  sessionStorage.removeItem(SSO_STATE_KEY);
  return storedState === state;
}


// Build SSO authorization URL
function buildSSOAuthUrl(
  config: SSOConfig,
  provider: SSOProviderConfig,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: state,
    scope: 'openid email profile',
  });

  // Add identity provider hint based on provider type
  if (provider.type === 'SAML') {
    params.set('identity_provider', provider.id);
  } else if (provider.type === 'OIDC') {
    params.set('identity_provider', provider.id);
  }

  return `https://${config.cognitoDomain}/oauth2/authorize?${params.toString()}`;
}

// Exchange authorization code for tokens (mock implementation)
async function exchangeCodeForTokens(
  config: SSOConfig,
  code: string
): Promise<AuthSession> {
  // In production, this would call the Cognito token endpoint
  await new Promise((resolve) => setTimeout(resolve, 500));

  const mockRoles: Role[] = [
    {
      id: 'role-sso-1',
      name: 'SSO_USER',
      description: 'SSO authenticated user',
      permissions: [
        { id: 'p1', resource: 'strategy', action: 'read' },
        { id: 'p2', resource: 'order', action: 'read' },
        { id: 'p3', resource: 'position', action: 'read' },
        { id: 'p4', resource: 'report', action: 'read' },
      ],
      isSystem: true,
    },
  ];

  return {
    userId: 'sso-user-' + Date.now(),
    email: 'sso-user@enterprise.com',
    name: 'SSO User',
    organizationId: 'org-enterprise',
    roles: mockRoles,
    permissions: mergePermissions(mockRoles),
    accessToken: 'sso-access-token-' + Date.now(),
    refreshToken: 'sso-refresh-token-' + Date.now(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    mfaVerified: true, // SSO typically handles MFA at IdP level
  };
}


// Provider Props
interface SSOProviderProps {
  children: React.ReactNode;
  config: SSOConfig;
}

// Provider Component
export function SSOProvider({ children, config }: SSOProviderProps) {
  // Get enabled providers
  const getEnabledProviders = useCallback((): SSOProviderConfig[] => {
    return config.providers.filter((p) => p.enabled);
  }, [config.providers]);

  // Get SSO login URL for a provider
  const getSSOLoginUrl = useCallback(
    (providerId: string): string => {
      const provider = config.providers.find((p) => p.id === providerId);
      if (!provider) {
        throw new Error(`SSO provider ${providerId} not found`);
      }
      if (!provider.enabled) {
        throw new Error(`SSO provider ${providerId} is not enabled`);
      }

      const state = generateState();
      storeState(state);
      return buildSSOAuthUrl(config, provider, state);
    },
    [config]
  );

  // Initiate SSO login (redirect to IdP)
  const initiateSSO = useCallback(
    (providerId: string): void => {
      const url = getSSOLoginUrl(providerId);
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    },
    [getSSOLoginUrl]
  );

  // Handle SSO callback (exchange code for tokens)
  const handleSSOCallback = useCallback(
    async (code: string, state: string): Promise<AuthSession> => {
      // Verify state to prevent CSRF
      if (!verifyState(state)) {
        throw new Error('Invalid SSO state. Please try logging in again.');
      }

      // Exchange code for tokens
      return exchangeCodeForTokens(config, code);
    },
    [config]
  );

  const value: SSOContextValue = useMemo(
    () => ({
      providers: config.providers,
      getEnabledProviders,
      initiateSSO,
      handleSSOCallback,
      getSSOLoginUrl,
    }),
    [config.providers, getEnabledProviders, initiateSSO, handleSSOCallback, getSSOLoginUrl]
  );

  return <SSOContext.Provider value={value}>{children}</SSOContext.Provider>;
}

// Hook
export function useSSO(): SSOContextValue {
  const context = useContext(SSOContext);
  if (context === undefined) {
    throw new Error('useSSO must be used within an SSOProvider');
  }
  return context;
}

// Export for testing
export {
  SSO_STATE_KEY,
  generateState,
  storeState,
  verifyState,
  buildSSOAuthUrl,
  exchangeCodeForTokens,
};
