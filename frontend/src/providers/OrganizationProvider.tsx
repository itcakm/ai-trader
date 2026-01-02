'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
} from 'react';
import type {
  OrganizationContextValue,
  UserAccount,
  Organization,
  OrganizationMember,
  Department,
  SignupInput,
  SignupResult,
  VerifyEmailInput,
  OrganizationUpgradeInput,
  MemberInviteInput,
  DepartmentInput,
  MemberActivity,
  MemberStatus,
} from '@/types/organization';
import { useAuth } from './AuthProvider';

// Storage keys
const ACCOUNT_STORAGE_KEY = 'crypto-trading-account';
const ORG_STORAGE_KEY = 'crypto-trading-organization';

// State
interface OrganizationState {
  account: UserAccount | null;
  organization: Organization | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: OrganizationState = {
  account: null,
  organization: null,
  isLoading: false,
  error: null,
};

// Actions
type OrganizationAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ACCOUNT'; payload: UserAccount | null }
  | { type: 'SET_ORGANIZATION'; payload: Organization | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_MEMBER'; payload: OrganizationMember }
  | { type: 'REMOVE_MEMBER'; payload: string }
  | { type: 'ADD_DEPARTMENT'; payload: Department }
  | { type: 'UPDATE_DEPARTMENT'; payload: Department }
  | { type: 'REMOVE_DEPARTMENT'; payload: string };

// Reducer
function organizationReducer(
  state: OrganizationState,
  action: OrganizationAction
): OrganizationState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ACCOUNT':
      return { ...state, account: action.payload, error: null };
    case 'SET_ORGANIZATION':
      return { ...state, organization: action.payload, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'UPDATE_MEMBER':
      if (!state.organization) return state;
      return {
        ...state,
        organization: {
          ...state.organization,
          members: state.organization.members.map((m) =>
            m.userId === action.payload.userId ? action.payload : m
          ),
        },
      };
    case 'REMOVE_MEMBER':
      if (!state.organization) return state;
      return {
        ...state,
        organization: {
          ...state.organization,
          members: state.organization.members.map((m) =>
            m.userId === action.payload ? { ...m, status: 'removed' as MemberStatus } : m
          ),
        },
      };
    case 'ADD_DEPARTMENT':
      if (!state.organization) return state;
      return {
        ...state,
        organization: {
          ...state.organization,
          departments: [...state.organization.departments, action.payload],
        },
      };
    case 'UPDATE_DEPARTMENT':
      if (!state.organization) return state;
      return {
        ...state,
        organization: {
          ...state.organization,
          departments: state.organization.departments.map((d) =>
            d.id === action.payload.id ? action.payload : d
          ),
        },
      };
    case 'REMOVE_DEPARTMENT':
      if (!state.organization) return state;
      return {
        ...state,
        organization: {
          ...state.organization,
          departments: state.organization.departments.filter(
            (d) => d.id !== action.payload
          ),
        },
      };
    default:
      return state;
  }
}

// Context
const OrganizationContext = createContext<OrganizationContextValue | undefined>(
  undefined
);

// Storage helpers
function saveAccount(account: UserAccount): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({
    ...account,
    createdAt: account.createdAt.toISOString(),
    lastLoginAt: account.lastLoginAt?.toISOString(),
  }));
}

function loadAccount(): UserAccount | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      lastLoginAt: parsed.lastLoginAt ? new Date(parsed.lastLoginAt) : undefined,
    };
  } catch {
    return null;
  }
}

function saveOrganization(org: Organization): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify({
    ...org,
    createdAt: org.createdAt.toISOString(),
    members: org.members.map((m) => ({
      ...m,
      invitedAt: m.invitedAt.toISOString(),
      joinedAt: m.joinedAt?.toISOString(),
    })),
    departments: org.departments.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    billing: {
      ...org.billing,
      nextBillingDate: org.billing.nextBillingDate?.toISOString(),
    },
  }));
}

function loadOrganization(): Organization | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(ORG_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      members: parsed.members.map((m: Record<string, unknown>) => ({
        ...m,
        invitedAt: new Date(m.invitedAt as string),
        joinedAt: m.joinedAt ? new Date(m.joinedAt as string) : undefined,
      })),
      departments: parsed.departments.map((d: Record<string, unknown>) => ({
        ...d,
        createdAt: new Date(d.createdAt as string),
      })),
      billing: {
        ...parsed.billing,
        nextBillingDate: parsed.billing.nextBillingDate
          ? new Date(parsed.billing.nextBillingDate)
          : undefined,
      },
    };
  } catch {
    return null;
  }
}

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Provider Props
interface OrganizationProviderProps {
  children: React.ReactNode;
}

// Provider Component
export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const [state, dispatch] = useReducer(organizationReducer, initialState);
  const { session } = useAuth();

  // Load stored data on mount
  useEffect(() => {
    const account = loadAccount();
    const organization = loadOrganization();
    if (account) dispatch({ type: 'SET_ACCOUNT', payload: account });
    if (organization) dispatch({ type: 'SET_ORGANIZATION', payload: organization });
  }, []);

  // Sync with auth session
  useEffect(() => {
    if (session && state.account) {
      const updatedAccount: UserAccount = {
        ...state.account,
        lastLoginAt: new Date(),
      };
      dispatch({ type: 'SET_ACCOUNT', payload: updatedAccount });
      saveAccount(updatedAccount);
    }
  }, [session?.userId]);

  // Signup
  const signup = useCallback(async (input: SignupInput): Promise<SignupResult> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Validate input
      if (!input.email || !input.password || !input.name) {
        throw new Error('All fields are required');
      }
      if (input.password !== input.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (input.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      if (!input.acceptTerms) {
        throw new Error('You must accept the terms and conditions');
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      const newAccount: UserAccount = {
        id: generateId(),
        email: input.email,
        name: input.name,
        accountType: 'individual',
        status: 'pending',
        emailVerified: false,
        mfaEnabled: false,
        createdAt: new Date(),
      };

      dispatch({ type: 'SET_ACCOUNT', payload: newAccount });
      saveAccount(newAccount);
      dispatch({ type: 'SET_LOADING', payload: false });

      return {
        success: true,
        userId: newAccount.id,
        requiresVerification: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, requiresVerification: false, error: message };
    }
  }, []);

  // Verify Email
  const verifyEmail = useCallback(async (input: VerifyEmailInput): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Mock verification (accept any 6-digit code)
      if (!/^\d{6}$/.test(input.code)) {
        throw new Error('Invalid verification code');
      }

      if (state.account && state.account.email === input.email) {
        const updatedAccount: UserAccount = {
          ...state.account,
          emailVerified: true,
          status: 'active',
        };
        dispatch({ type: 'SET_ACCOUNT', payload: updatedAccount });
        saveAccount(updatedAccount);
      }

      dispatch({ type: 'SET_LOADING', payload: false });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      return false;
    }
  }, [state.account]);

  // Resend Verification
  const resendVerification = useCallback(async (email: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      dispatch({ type: 'SET_LOADING', payload: false });
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to resend verification' });
      return false;
    }
  }, []);

  // Update Account
  const updateAccount = useCallback(async (updates: Partial<UserAccount>): Promise<void> => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (state.account) {
        const updatedAccount: UserAccount = { ...state.account, ...updates };
        dispatch({ type: 'SET_ACCOUNT', payload: updatedAccount });
        saveAccount(updatedAccount);
      }

      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, [state.account]);

  // Upgrade to Organization
  const upgradeToOrganization = useCallback(
    async (input: OrganizationUpgradeInput): Promise<Organization> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.account) {
          throw new Error('No account found');
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

        const newOrg: Organization = {
          id: generateId(),
          name: input.organizationName,
          ownerId: state.account.id,
          members: [
            {
              userId: state.account.id,
              email: state.account.email,
              name: state.account.name,
              roles: [],
              invitedAt: new Date(),
              invitedBy: state.account.id,
              joinedAt: new Date(),
              status: 'active',
            },
          ],
          departments: [],
          settings: {
            allowMemberInvites: true,
            requireMFA: false,
            ssoEnabled: false,
            defaultRoleId: 'viewer',
            sessionTimeoutMinutes: 60,
          },
          usage: {
            totalMembers: 1,
            activeMembers: 1,
            strategiesCount: 0,
            ordersThisMonth: 0,
            apiCallsThisMonth: 0,
            storageUsedMB: 0,
          },
          billing: {
            plan: input.plan,
            billingEmail: input.billingEmail,
            currency: 'USD',
          },
          createdAt: new Date(),
          upgradedFromAccountId: state.account.id,
        };

        // Update account type
        const updatedAccount: UserAccount = {
          ...state.account,
          accountType: 'organization',
          organizationId: newOrg.id,
        };

        dispatch({ type: 'SET_ACCOUNT', payload: updatedAccount });
        dispatch({ type: 'SET_ORGANIZATION', payload: newOrg });
        saveAccount(updatedAccount);
        saveOrganization(newOrg);
        dispatch({ type: 'SET_LOADING', payload: false });

        return newOrg;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upgrade failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.account]
  );

  // Update Organization
  const updateOrganization = useCallback(
    async (updates: Partial<Organization>): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (state.organization) {
          const updated: Organization = { ...state.organization, ...updates };
          dispatch({ type: 'SET_ORGANIZATION', payload: updated });
          saveOrganization(updated);
        }

        dispatch({ type: 'SET_LOADING', payload: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Update failed';
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    },
    [state.organization]
  );

  // Update Organization Settings
  const updateOrganizationSettings = useCallback(
    async (settings: Partial<Organization['settings']>): Promise<void> => {
      if (state.organization) {
        await updateOrganization({
          settings: { ...state.organization.settings, ...settings },
        });
      }
    },
    [state.organization, updateOrganization]
  );

  // Invite Member
  const inviteMember = useCallback(
    async (input: MemberInviteInput): Promise<OrganizationMember> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.organization || !state.account) {
          throw new Error('No organization found');
        }

        // Check if member already exists
        const existing = state.organization.members.find(
          (m) => m.email === input.email && m.status !== 'removed'
        );
        if (existing) {
          throw new Error('Member already exists');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        const newMember: OrganizationMember = {
          userId: generateId(),
          email: input.email,
          name: input.name,
          roles: [],
          departmentId: input.departmentId,
          invitedAt: new Date(),
          invitedBy: state.account.id,
          status: 'pending',
        };

        const updatedOrg: Organization = {
          ...state.organization,
          members: [...state.organization.members, newMember],
          usage: {
            ...state.organization.usage,
            totalMembers: state.organization.usage.totalMembers + 1,
          },
        };

        dispatch({ type: 'SET_ORGANIZATION', payload: updatedOrg });
        saveOrganization(updatedOrg);
        dispatch({ type: 'SET_LOADING', payload: false });

        return newMember;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invite failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.organization, state.account]
  );

  // Remove Member
  const removeMember = useCallback(
    async (userId: string): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.organization) {
          throw new Error('No organization found');
        }

        // Cannot remove owner
        if (userId === state.organization.ownerId) {
          throw new Error('Cannot remove organization owner');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        dispatch({ type: 'REMOVE_MEMBER', payload: userId });

        // Update storage
        const updatedOrg = {
          ...state.organization,
          members: state.organization.members.map((m) =>
            m.userId === userId ? { ...m, status: 'removed' as MemberStatus } : m
          ),
          usage: {
            ...state.organization.usage,
            activeMembers: state.organization.usage.activeMembers - 1,
          },
        };
        saveOrganization(updatedOrg);

        dispatch({ type: 'SET_LOADING', payload: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Remove failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.organization]
  );

  // Update Member Roles
  const updateMemberRoles = useCallback(
    async (userId: string, roleIds: string[]): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.organization) {
          throw new Error('No organization found');
        }

        const member = state.organization.members.find((m) => m.userId === userId);
        if (!member) {
          throw new Error('Member not found');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        const updatedMember: OrganizationMember = {
          ...member,
          roles: roleIds.map((id) => ({
            id,
            name: id.toUpperCase(),
            description: '',
            permissions: [],
            isSystem: false,
          })),
        };

        dispatch({ type: 'UPDATE_MEMBER', payload: updatedMember });

        const updatedOrg = {
          ...state.organization,
          members: state.organization.members.map((m) =>
            m.userId === userId ? updatedMember : m
          ),
        };
        saveOrganization(updatedOrg);

        dispatch({ type: 'SET_LOADING', payload: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Update failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.organization]
  );

  // Resend Invitation
  const resendInvitation = useCallback(
    async (userId: string): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        dispatch({ type: 'SET_LOADING', payload: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Resend failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    []
  );

  // Create Department
  const createDepartment = useCallback(
    async (input: DepartmentInput): Promise<Department> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.organization) {
          throw new Error('No organization found');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        const newDept: Department = {
          id: generateId(),
          name: input.name,
          description: input.description,
          parentId: input.parentId,
          permissions: [],
          memberCount: 0,
          createdAt: new Date(),
        };

        dispatch({ type: 'ADD_DEPARTMENT', payload: newDept });

        const updatedOrg = {
          ...state.organization,
          departments: [...state.organization.departments, newDept],
        };
        saveOrganization(updatedOrg);

        dispatch({ type: 'SET_LOADING', payload: false });
        return newDept;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Create failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.organization]
  );

  // Update Department
  const updateDepartment = useCallback(
    async (id: string, updates: Partial<DepartmentInput>): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.organization) {
          throw new Error('No organization found');
        }

        const dept = state.organization.departments.find((d) => d.id === id);
        if (!dept) {
          throw new Error('Department not found');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        const updatedDept: Department = {
          ...dept,
          name: updates.name ?? dept.name,
          description: updates.description ?? dept.description,
          parentId: updates.parentId ?? dept.parentId,
        };

        dispatch({ type: 'UPDATE_DEPARTMENT', payload: updatedDept });

        const updatedOrg = {
          ...state.organization,
          departments: state.organization.departments.map((d) =>
            d.id === id ? updatedDept : d
          ),
        };
        saveOrganization(updatedOrg);

        dispatch({ type: 'SET_LOADING', payload: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Update failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.organization]
  );

  // Delete Department
  const deleteDepartment = useCallback(
    async (id: string): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.organization) {
          throw new Error('No organization found');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        dispatch({ type: 'REMOVE_DEPARTMENT', payload: id });

        const updatedOrg = {
          ...state.organization,
          departments: state.organization.departments.filter((d) => d.id !== id),
        };
        saveOrganization(updatedOrg);

        dispatch({ type: 'SET_LOADING', payload: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Delete failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.organization]
  );

  // Assign Member to Department
  const assignMemberToDepartment = useCallback(
    async (userId: string, departmentId: string): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        if (!state.organization) {
          throw new Error('No organization found');
        }

        const member = state.organization.members.find((m) => m.userId === userId);
        if (!member) {
          throw new Error('Member not found');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        const updatedMember: OrganizationMember = {
          ...member,
          departmentId,
        };

        dispatch({ type: 'UPDATE_MEMBER', payload: updatedMember });

        const updatedOrg = {
          ...state.organization,
          members: state.organization.members.map((m) =>
            m.userId === userId ? updatedMember : m
          ),
        };
        saveOrganization(updatedOrg);

        dispatch({ type: 'SET_LOADING', payload: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Assignment failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state.organization]
  );

  // Refresh Organization
  const refreshOrganization = useCallback(async (): Promise<void> => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      // In real implementation, fetch from API
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refresh failed';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, []);

  // Get Member Activity
  const getMemberActivity = useCallback(
    async (userId?: string): Promise<MemberActivity[]> => {
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Mock activity data
      const activities: MemberActivity[] = [
        {
          userId: userId || 'user-1',
          userName: 'John Doe',
          action: 'login',
          module: 'auth',
          timestamp: new Date(),
          details: 'Logged in from Chrome on macOS',
        },
        {
          userId: userId || 'user-1',
          userName: 'John Doe',
          action: 'view',
          module: 'strategy',
          timestamp: new Date(Date.now() - 3600000),
          details: 'Viewed strategy "BTC Momentum"',
        },
      ];

      return activities;
    },
    []
  );

  const value: OrganizationContextValue = {
    account: state.account,
    organization: state.organization,
    isLoading: state.isLoading,
    error: state.error,
    signup,
    verifyEmail,
    resendVerification,
    updateAccount,
    upgradeToOrganization,
    updateOrganization,
    updateOrganizationSettings,
    inviteMember,
    removeMember,
    updateMemberRoles,
    resendInvitation,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    assignMemberToDepartment,
    refreshOrganization,
    getMemberActivity,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

// Hook
export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

// Export for testing
export { ACCOUNT_STORAGE_KEY, ORG_STORAGE_KEY, loadAccount, loadOrganization, saveAccount, saveOrganization };
