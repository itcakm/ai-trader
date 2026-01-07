# Implementation Plan: Production Authentication System

## Overview

This implementation plan provides step-by-step tasks for implementing a production-ready authentication system using AWS Cognito, with all auth traffic proxied through the backend API Gateway for WAF protection. The implementation covers infrastructure (Terraform), backend (Lambda handlers and middleware), and frontend (React components and providers).

## Tasks

- [x] 1. Create Cognito Infrastructure Module
  - [x] 1.1 Create Cognito Terraform module structure
    - Create `infrastructure/modules/cognito/` directory
    - Create `main.tf` with User Pool resource
    - Create `variables.tf` with configurable inputs
    - Create `outputs.tf` with User Pool ID, ARN, App Client ID
    - Create `versions.tf` with provider requirements
    - _Requirements: 1.1, 1.2, 1.3, 1.10_

  - [x] 1.2 Configure User Pool password and security policies
    - Set password policy: min 12 chars, uppercase, lowercase, numbers, symbols
    - Configure MFA as OPTIONAL with SOFTWARE_TOKEN_MFA enabled
    - Enable advanced security features (ENFORCED mode)
    - Configure account recovery via verified email
    - Set temporary password validity to 7 days
    - _Requirements: 1.1, 1.2, 1.6_

  - [x] 1.3 Configure User Pool attributes schema
    - Add email attribute (required, verified)
    - Add name attribute (required)
    - Add custom:tenant_id attribute (string, mutable)
    - Add custom:roles attribute (string, mutable, for JSON array)
    - _Requirements: 1.7_

  - [x] 1.4 Create App Client configuration
    - Enable USER_PASSWORD_AUTH and REFRESH_TOKEN_AUTH flows
    - Disable hosted UI and OAuth flows
    - Set token validity: access 1hr, refresh 30 days, ID 1hr
    - Enable token revocation
    - Enable prevent_user_existence_errors
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 1.5 Configure email delivery
    - Use Cognito default for test environment
    - Configure SES for production environment
    - Set from address as noreply@{domain}
    - _Requirements: 1.9_

  - [x] 1.6 Create Lambda trigger placeholders
    - Create pre-signup trigger Lambda resource reference
    - Create post-confirmation trigger Lambda resource reference
    - Output trigger function ARNs for Lambda module
    - _Requirements: 1.8_

- [x] 2. Configure WAF Rules for Auth Endpoints
  - [x] 2.1 Add auth-specific WAF rules to existing WAF module
    - Create `infrastructure/modules/waf/auth-rules.tf`
    - Add login rate limit rule: 100 req/5min per IP
    - Add signup rate limit rule: 10 req/5min per IP
    - Add password reset rate limit rule: 5 req/5min per IP
    - Configure 429 response with Retry-After header
    - _Requirements: 2.1, 2.2, 2.3, 2.9_

  - [x] 2.2 Add security rules for auth endpoints
    - Add SQL injection protection rule
    - Add XSS protection rule
    - Add AWS managed IP reputation rule set
    - Configure CloudWatch logging for blocked requests
    - _Requirements: 2.4, 2.5, 2.6, 2.7_

  - [x] 2.3 Configure WAF rule priorities
    - Set rate limiting rules at higher priority
    - Set security rules at lower priority
    - Ensure SSO callback traffic is allowed
    - _Requirements: 2.8_

- [x] 3. Integrate Cognito Module with Environments
  - [x] 3.1 Add Cognito module to test environment
    - Add module reference in `infrastructure/environments/test/main.tf`
    - Configure test-specific variables
    - Add outputs for Cognito resources
    - _Requirements: 1.10_

  - [x] 3.2 Add Cognito module to production environment
    - Add module reference in `infrastructure/environments/production/main.tf`
    - Configure production-specific variables (SES integration)
    - Add outputs for Cognito resources
    - _Requirements: 1.9, 1.10_

  - [x] 3.3 Update API Gateway with auth routes
    - Add /auth/* routes to API Gateway configuration
    - Associate WAF web ACL with API Gateway
    - Configure CORS for auth endpoints
    - _Requirements: 2.1, 3.1-3.12_

- [x] 4. Create Backend Auth Service
  - [x] 4.1 Add Cognito SDK dependencies
    - Add `@aws-sdk/client-cognito-identity-provider` to package.json
    - Add `jsonwebtoken` for token parsing
    - Add `jwks-rsa` for JWKS fetching
    - Run npm install
    - _Requirements: 3.1-3.12, 4.1-4.3_

  - [x] 4.2 Create auth types
    - Create `backend/src/types/auth.ts`
    - Define LoginRequest, LoginResponse interfaces
    - Define SignupRequest, SignupResponse interfaces
    - Define TokenPayload, UserContext interfaces
    - Define AuthError types and codes
    - _Requirements: 3.13, 3.14_

  - [x] 4.3 Create Cognito client wrapper service
    - Create `backend/src/services/cognito-client.ts`
    - Initialize CognitoIdentityProviderClient
    - Create wrapper methods for all Cognito operations
    - Add error handling and logging
    - _Requirements: 3.1-3.12_

  - [x] 4.4 Create auth audit logging service
    - Create `backend/src/services/auth-audit.ts`
    - Define auth event types
    - Implement logAuthEvent method
    - Store events in DynamoDB auth-audit table
    - _Requirements: 11.1-11.9_

- [x] 5. Create Backend Auth Handlers
  - [x] 5.1 Create signup handler
    - Create `backend/src/handlers/auth/signup.ts`
    - Validate request body (email, password, name)
    - Call Cognito SignUp API
    - Log signup event
    - Return sanitized response
    - _Requirements: 3.1, 3.13, 3.14_

  - [x] 5.2 Create login handler
    - Create `backend/src/handlers/auth/login.ts`
    - Validate request body (email, password)
    - Call Cognito InitiateAuth with USER_PASSWORD_AUTH
    - Handle MFA challenge response
    - Parse and return tokens with user info
    - Log login success/failure
    - _Requirements: 3.2, 3.13, 3.14, 11.1, 11.2_

  - [x] 5.3 Create logout handler
    - Create `backend/src/handlers/auth/logout.ts`
    - Validate access token
    - Call Cognito GlobalSignOut
    - Log logout event
    - _Requirements: 3.3, 11.3_

  - [x] 5.4 Create token refresh handler
    - Create `backend/src/handlers/auth/refresh.ts`
    - Validate refresh token
    - Call Cognito InitiateAuth with REFRESH_TOKEN flow
    - Return new access token
    - Log refresh event
    - _Requirements: 3.4, 11.7_

  - [x] 5.5 Create email verification handlers
    - Create `backend/src/handlers/auth/verify-email.ts`
    - Create `backend/src/handlers/auth/resend-verification.ts`
    - Call Cognito ConfirmSignUp and ResendConfirmationCode
    - Log verification events
    - _Requirements: 3.5, 3.6_

  - [x] 5.6 Create password reset handlers
    - Create `backend/src/handlers/auth/forgot-password.ts`
    - Create `backend/src/handlers/auth/reset-password.ts`
    - Call Cognito ForgotPassword and ConfirmForgotPassword
    - Log password reset events
    - _Requirements: 3.7, 3.8, 11.4_

  - [x] 5.7 Create MFA handlers
    - Create `backend/src/handlers/auth/mfa-setup.ts`
    - Create `backend/src/handlers/auth/mfa-verify.ts`
    - Create `backend/src/handlers/auth/mfa-challenge.ts`
    - Call Cognito AssociateSoftwareToken, VerifySoftwareToken, RespondToAuthChallenge
    - Log MFA events
    - _Requirements: 3.9, 3.10, 3.11, 11.5_

  - [x] 5.8 Create user profile handler
    - Create `backend/src/handlers/auth/me.ts`
    - Extract user info from validated JWT
    - Return user profile
    - _Requirements: 3.12_

  - [x] 5.9 Create main auth router handler
    - Create `backend/src/handlers/auth.ts`
    - Route requests to appropriate handlers based on path
    - Handle OPTIONS for CORS preflight
    - _Requirements: 3.1-3.12_

- [x] 6. Create JWT Validation Middleware
  - [x] 6.1 Create JWKS client with caching
    - Create `backend/src/middleware/jwks-client.ts`
    - Configure jwks-rsa client with Cognito JWKS URL
    - Set cache TTL to 1 hour
    - Enable rate limiting
    - _Requirements: 4.2, 4.3_

  - [x] 6.2 Create JWT validation middleware
    - Create `backend/src/middleware/jwt-validator.ts`
    - Extract Bearer token from Authorization header
    - Validate signature using JWKS
    - Validate exp, iss, aud claims
    - Extract user claims (sub, email, tenant_id, roles)
    - Attach user context to request
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 4.7, 4.10_

  - [x] 6.3 Create auth error responses
    - Return 401 for invalid/expired tokens
    - Return 401 with WWW-Authenticate header for missing tokens
    - Sanitize error messages
    - _Requirements: 4.8, 4.9_

  - [x] 6.4 Create requireAuth wrapper function
    - Create higher-order function for protected handlers
    - Validate token before invoking handler
    - Pass user context to handler
    - _Requirements: 4.1-4.9_

  - [x] 6.5 Create requireRole wrapper function
    - Create higher-order function for role-based access
    - Check user roles against required roles
    - Return 403 for insufficient permissions
    - _Requirements: 6.7, 6.8_

- [x] 7. Implement Tenant Isolation
  - [x] 7.1 Update database access layer
    - Modify `backend/src/db/access.ts` to accept tenantId
    - Inject tenantId into all queries automatically
    - Add tenant validation on read operations
    - _Requirements: 5.2, 5.3_

  - [x] 7.2 Create tenant isolation middleware
    - Create `backend/src/middleware/tenant-isolation.ts`
    - Extract tenantId from JWT (not headers)
    - Validate resource tenantId matches user tenantId
    - Log isolation violations
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 7.3 Update existing handlers for tenant isolation
    - Modify all handlers to use tenantId from JWT
    - Remove trust of X-Tenant-Id header
    - Auto-set tenantId on resource creation
    - _Requirements: 5.4, 5.6_

  - [x] 7.4 Add super-admin bypass
    - Check for SUPER_ADMIN role
    - Allow cross-tenant access for support
    - Log all super-admin operations
    - _Requirements: 5.7_

- [x] 8. Implement Role-Based Access Control
  - [x] 8.1 Define role permissions
    - Create `backend/src/types/rbac.ts`
    - Define VIEWER, TRADER, ANALYST, ADMIN, SUPER_ADMIN roles
    - Define permission strings for each resource/action
    - Map roles to permissions
    - _Requirements: 6.1-6.6_

  - [x] 8.2 Create permission checking service
    - Create `backend/src/services/rbac.ts`
    - Implement hasPermission(user, permission) function
    - Implement hasAnyPermission(user, permissions) function
    - Implement hasAllPermissions(user, permissions) function
    - _Requirements: 6.7_

  - [x] 8.3 Update handlers with permission checks
    - Add permission checks to strategy handlers
    - Add permission checks to order handlers
    - Add permission checks to admin handlers
    - Add permission checks to audit handlers
    - _Requirements: 6.7, 6.8_

- [x] 9. Implement SSO Integration
  - [x] 9.1 Create SSO configuration in Cognito
    - Add SAML identity provider support to Cognito module
    - Add OIDC identity provider support to Cognito module
    - Configure attribute mapping
    - _Requirements: 7.1, 7.2, 7.6_

  - [x] 9.2 Create SSO handlers
    - Create `backend/src/handlers/auth/sso-providers.ts` (GET list)
    - Create `backend/src/handlers/auth/sso-initiate.ts` (redirect to IdP)
    - Create `backend/src/handlers/auth/sso-callback.ts` (handle response)
    - _Requirements: 7.3, 7.4, 7.5_

  - [x] 9.3 Implement JIT user provisioning
    - Auto-create user on first SSO login
    - Map external attributes to Cognito attributes
    - Assign default role based on SSO provider config
    - _Requirements: 7.7, 7.8_

  - [x] 9.4 Add CSRF protection for SSO
    - Generate and store state parameter
    - Validate state on callback
    - _Requirements: 7.9, 7.10_

- [x] 10. Create Frontend Auth API Service
  - [x] 10.1 Create auth API client
    - Create `frontend/src/services/auth-api.ts`
    - Implement login, signup, logout methods
    - Implement verifyEmail, forgotPassword, resetPassword methods
    - Implement refreshToken method
    - Implement MFA methods (setup, verify, challenge)
    - _Requirements: 9.1-9.7_

  - [x] 10.2 Create AuthError class
    - Define error codes matching backend
    - Create user-friendly error messages
    - _Requirements: 9.9_

  - [x] 10.3 Create SSO API methods
    - Implement getProviders method
    - Implement initiateSSO method
    - Handle SSO callback
    - _Requirements: 9.7_

- [x] 11. Update Frontend Auth Provider
  - [x] 11.1 Replace mock auth with real API calls
    - Update `frontend/src/providers/AuthProvider.tsx`
    - Replace cognitoLogin with authAPI.login
    - Replace cognitoVerifyMFA with authAPI.verifyMFA
    - Replace cognitoRefreshSession with authAPI.refreshToken
    - Replace cognitoLogout with authAPI.logout
    - _Requirements: 8.1-8.10_

  - [x] 11.2 Implement secure token storage
    - Store tokens in localStorage (or httpOnly cookies if using BFF)
    - Include expiration timestamp
    - Clear on logout
    - _Requirements: 8.1, 8.9_

  - [x] 11.3 Implement automatic token refresh
    - Set up refresh timer based on token expiry
    - Refresh 5 minutes before expiration
    - Handle refresh failures gracefully
    - _Requirements: 8.2, 8.3_

  - [x] 11.4 Implement session restoration
    - Check localStorage on mount
    - Validate stored token expiry
    - Restore session or redirect to login
    - _Requirements: 8.3, 8.10_

  - [x] 11.5 Add getAccessToken helper
    - Return current valid access token
    - Auto-refresh if needed
    - Return null if not authenticated
    - _Requirements: 8.2_

- [x] 12. Create Frontend Auth Pages
  - [x] 12.1 Create login page
    - Create `frontend/src/app/login/page.tsx`
    - Add email/password form with validation
    - Add SSO provider buttons
    - Add "Forgot password" link
    - Add "Sign up" link
    - Handle loading and error states
    - _Requirements: 9.1, 9.7, 9.8, 9.9_

  - [x] 12.2 Create signup page
    - Create `frontend/src/app/signup/page.tsx`
    - Add email, password, confirm password, name fields
    - Add password strength indicator
    - Add terms acceptance checkbox
    - Redirect to email verification after signup
    - _Requirements: 9.2, 9.12_

  - [x] 12.3 Create email verification page
    - Create `frontend/src/app/verify-email/page.tsx`
    - Add verification code input
    - Add resend code button
    - Redirect to login after verification
    - _Requirements: 9.3_

  - [x] 12.4 Create forgot password page
    - Create `frontend/src/app/forgot-password/page.tsx`
    - Add email input form
    - Show success message with instructions
    - _Requirements: 9.4_

  - [x] 12.5 Create reset password page
    - Create `frontend/src/app/reset-password/page.tsx`
    - Add code, new password, confirm password fields
    - Redirect to login after reset
    - _Requirements: 9.4_

  - [x] 12.6 Create MFA setup page
    - Create `frontend/src/app/settings/mfa/page.tsx`
    - Display QR code for authenticator app
    - Add verification code input
    - Show backup codes after setup
    - _Requirements: 9.5_

  - [x] 12.7 Create MFA challenge component
    - Create `frontend/src/components/auth/MFAChallenge.tsx`
    - Add 6-digit code input
    - Handle verification
    - _Requirements: 9.6_

  - [x] 12.8 Create account settings page
    - Create `frontend/src/app/settings/account/page.tsx`
    - Add change password form
    - Add MFA enable/disable toggle
    - Show active sessions (future)
    - _Requirements: 9.11_

- [x] 13. Implement Protected Routes
  - [x] 13.1 Create route guard component
    - Create `frontend/src/components/auth/RouteGuard.tsx`
    - Check authentication status
    - Show loading while checking
    - Redirect to login if unauthenticated
    - Preserve intended destination URL
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [x] 13.2 Create role-based route guard
    - Create `frontend/src/components/auth/RoleGuard.tsx`
    - Check user roles against required roles
    - Show 403 page or redirect if unauthorized
    - _Requirements: 10.4, 10.5_

  - [x] 13.3 Update app layout with route protection
    - Wrap protected routes with RouteGuard
    - Define public routes (login, signup, etc.)
    - Handle token refresh during navigation
    - _Requirements: 10.7, 10.8_

  - [x] 13.4 Create 403 Forbidden page
    - Create `frontend/src/app/forbidden/page.tsx`
    - Show user-friendly message
    - Provide navigation options
    - _Requirements: 10.5_

- [x] 14. Update Frontend RBAC Provider
  - [x] 14.1 Update RBACProvider to use real roles
    - Get roles from AuthProvider user context
    - Remove mock role data
    - _Requirements: 6.9_

  - [x] 14.2 Update permission checking
    - Use roles from JWT claims
    - Match backend permission definitions
    - _Requirements: 6.7, 6.9_

  - [x] 14.3 Update UI components for permissions
    - Hide/show elements based on permissions
    - Disable actions user can't perform
    - _Requirements: 6.9_

- [x] 15. Implement Account Security Features
  - [x] 15.1 Configure account lockout in Cognito
    - Set lockout after 5 failed attempts
    - Set lockout duration to 30 minutes
    - _Requirements: 12.1_

  - [x] 15.2 Create Cognito Lambda triggers
    - Create pre-signup trigger for validation
    - Create post-confirmation trigger for user setup
    - Create post-authentication trigger for login notifications
    - _Requirements: 1.8, 12.2, 12.3, 12.4_

  - [x] 15.3 Implement password change with current password
    - Add current password validation
    - Invalidate all tokens on password change
    - Send notification email
    - _Requirements: 12.5, 8.7, 12.3_

  - [x] 15.4 Implement password history (optional)
    - Store hashed previous passwords
    - Check new password against history
    - _Requirements: 12.8_

- [x] 16. Create Auth Audit Infrastructure
  - [x] 16.1 Create auth audit DynamoDB table
    - Add table to DynamoDB Terraform module
    - Configure TTL for 90-day retention
    - Add GSI for querying by user, tenant, event type
    - _Requirements: 11.9_

  - [x] 16.2 Create audit log export functionality
    - Create export handler for compliance reports
    - Support date range filtering
    - Support CSV and JSON formats
    - _Requirements: 11.10_

- [x] 17. Write Backend Auth Tests
  - [x] 17.1 Write unit tests for JWT validation
    - Test valid token validation
    - Test expired token rejection
    - Test invalid signature rejection
    - Test missing token handling
    - _Requirements: 13.1_

  - [x] 17.2 Write unit tests for permission checking
    - Test each role's permissions
    - Test permission inheritance
    - Test super-admin access
    - _Requirements: 13.2_

  - [x] 17.3 Write integration tests for auth endpoints
    - Test signup flow
    - Test login flow
    - Test MFA flow
    - Test password reset flow
    - Test token refresh flow
    - _Requirements: 13.3_

  - [x] 17.4 Write security tests
    - Test rate limiting
    - Test SQL injection blocking
    - Test XSS blocking
    - Test tenant isolation
    - _Requirements: 13.5_

- [x] 18. Write Frontend Auth Tests
  - [x] 18.1 Write unit tests for AuthProvider
    - Test login state management
    - Test token storage
    - Test token refresh
    - Test logout cleanup
    - _Requirements: 13.7, 13.8_

  - [x] 18.2 Write component tests for auth pages
    - Test login form validation
    - Test signup form validation
    - Test error display
    - Test loading states
    - _Requirements: 13.3_

  - [x] 18.3 Write integration tests for auth flows
    - Test complete signup → verify → login flow
    - Test MFA setup and challenge flow
    - Test password reset flow
    - _Requirements: 13.3, 13.4_

- [x] 19. Checkpoint - Deploy and Test Auth System
  - [x] 19.1 Deploy infrastructure to test environment
    - Apply Cognito Terraform module
    - Apply WAF rules
    - Verify resources created
    - _Requirements: 1.10_

  - [x] 19.2 Deploy backend auth handlers
    - Build and package auth handlers
    - Deploy to Lambda
    - Configure environment variables
    - _Requirements: 3.1-3.12_

  - [x] 19.3 Deploy frontend with auth pages
    - Build frontend with auth pages
    - Deploy to S3/CloudFront
    - Test auth flows end-to-end
    - _Requirements: 9.1-9.12_

  - [x] 19.4 Run security validation
    - Test rate limiting works
    - Test WAF blocks attacks
    - Test tenant isolation
    - Verify audit logs captured
    - _Requirements: 2.1-2.9, 5.1-5.7, 11.1-11.9_

- [x] 20. Documentation and Cleanup
  - [x] 20.1 Update API documentation
    - Document all auth endpoints
    - Document error codes
    - Document token formats
    - _Requirements: 3.13, 3.14_

  - [x] 20.2 Create auth troubleshooting guide
    - Document common issues
    - Document debugging steps
    - Document security best practices

  - [x] 20.3 Update deployment scripts
    - Add Cognito outputs to manifest
    - Update Lambda deployment for auth handlers
    - Update frontend config generation

## Notes

- All Cognito operations go through backend proxy for WAF protection
- Never expose Cognito endpoints directly to frontend
- JWT validation uses JWKS with caching for performance
- Tenant isolation is enforced at middleware level, not trusted from headers
- MFA is optional but recommended for production users
- SSO integration requires coordination with enterprise customers
- Audit logs have 90-day retention by default
- Rate limits may need tuning based on actual usage patterns
