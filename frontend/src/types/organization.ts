/**
 * Organization types for the AI-Assisted Crypto Trading System
 * Supports individual accounts, organization upgrades, and member management
 */

import type { Role, Permission } from './auth';

// Account types
export type AccountType = 'individual' | 'organization';
export type AccountStatus = 'pending' | 'active' | 'suspended';
export type MemberStatus = 'pending' | 'active' | 'removed';

// Individual User Account
export interface UserAccount {
  id: string;
  email: string;
  name: string;
  accountType: AccountType;
  organizationId?: string;
  status: AccountStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

// Organization
export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  members: OrganizationMember[];
  departments: Department[];
  settings: OrganizationSettings;
  usage: OrganizationUsage;
  billing: BillingInfo;
  createdAt: Date;
  upgradedFromAccountId?: string;
}

// Organization Member
export interface OrganizationMember {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
  departmentId?: string;
  invitedAt: Date;
  invitedBy: string;
  joinedAt?: Date;
  status: MemberStatus;
}

// Department/Team hierarchy
export interface Department {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  permissions: Permission[];
  memberCount: number;
  createdAt: Date;
}

// Organization Settings
export interface OrganizationSettings {
  allowMemberInvites: boolean;
  requireMFA: boolean;
  ssoEnabled: boolean;
  ssoProviderId?: string;
  defaultRoleId: string;
  sessionTimeoutMinutes: number;
}

// Organization Usage
export interface OrganizationUsage {
  totalMembers: number;
  activeMembers: number;
  strategiesCount: number;
  ordersThisMonth: number;
  apiCallsThisMonth: number;
  storageUsedMB: number;
}

// Billing Information
export interface BillingInfo {
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  billingEmail: string;
  nextBillingDate?: Date;
  monthlyAmount?: number;
  currency: string;
}

// Member Activity
export interface MemberActivity {
  userId: string;
  userName: string;
  action: string;
  module: string;
  timestamp: Date;
  details?: string;
}

// Signup Input
export interface SignupInput {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  acceptTerms: boolean;
}

// Signup Result
export interface SignupResult {
  success: boolean;
  userId?: string;
  requiresVerification: boolean;
  error?: string;
}

// Email Verification Input
export interface VerifyEmailInput {
  email: string;
  code: string;
}

// Organization Upgrade Input
export interface OrganizationUpgradeInput {
  organizationName: string;
  billingEmail: string;
  plan: BillingInfo['plan'];
}

// Member Invitation Input
export interface MemberInviteInput {
  email: string;
  name: string;
  roleIds: string[];
  departmentId?: string;
}

// Department Input
export interface DepartmentInput {
  name: string;
  description?: string;
  parentId?: string;
  permissionIds?: string[];
}

// Organization Context Value
export interface OrganizationContextValue {
  // Current account state
  account: UserAccount | null;
  organization: Organization | null;
  isLoading: boolean;
  error: string | null;

  // Account operations
  signup: (input: SignupInput) => Promise<SignupResult>;
  verifyEmail: (input: VerifyEmailInput) => Promise<boolean>;
  resendVerification: (email: string) => Promise<boolean>;
  updateAccount: (updates: Partial<UserAccount>) => Promise<void>;

  // Organization operations
  upgradeToOrganization: (input: OrganizationUpgradeInput) => Promise<Organization>;
  updateOrganization: (updates: Partial<Organization>) => Promise<void>;
  updateOrganizationSettings: (settings: Partial<OrganizationSettings>) => Promise<void>;

  // Member operations
  inviteMember: (input: MemberInviteInput) => Promise<OrganizationMember>;
  removeMember: (userId: string) => Promise<void>;
  updateMemberRoles: (userId: string, roleIds: string[]) => Promise<void>;
  resendInvitation: (userId: string) => Promise<void>;

  // Department operations
  createDepartment: (input: DepartmentInput) => Promise<Department>;
  updateDepartment: (id: string, updates: Partial<DepartmentInput>) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
  assignMemberToDepartment: (userId: string, departmentId: string) => Promise<void>;

  // Data fetching
  refreshOrganization: () => Promise<void>;
  getMemberActivity: (userId?: string) => Promise<MemberActivity[]>;
}
