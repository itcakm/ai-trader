# Authentication API Reference

This document provides comprehensive documentation for the Authentication API endpoints, error codes, and token formats used in the AI-Assisted Crypto Trading System.

## Overview

All authentication operations are proxied through the backend API Gateway with WAF protection. The system uses AWS Cognito as the identity provider, but Cognito endpoints are never exposed directly to clients.

**Base URL:** `https://api.{domain}/auth`

**Content-Type:** All requests and responses use `application/json`

---

## Authentication Endpoints

### Public Endpoints (No Authentication Required)

#### POST /auth/signup

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "tenantId": "optional-tenant-id"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Valid email address |
| password | string | Yes | Min 12 chars, uppercase, lowercase, numbers, symbols |
| name | string | Yes | Display name (1-256 characters) |
| tenantId | string | No | Organization/tenant identifier |

**Success Response (201):**
```json
{
  "userId": "uuid-string",
  "userConfirmed": false,
  "message": "Account created. Please check your email for verification code.",
  "codeDeliveryDetails": {
    "destination": "u***@example.com",
    "deliveryMedium": "EMAIL"
  }
}
```

**Error Responses:**
- `400 INVALID_REQUEST` - Invalid request body
- `400 WEAK_PASSWORD` - Password doesn't meet requirements
- `409 USER_EXISTS` - Email already registered

---

#### POST /auth/login

Authenticate a user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ...",
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "tenantId": "tenant-123",
    "roles": ["TRADER", "VIEWER"]
  }
}
```

**MFA Challenge Response (200):**
```json
{
  "challengeType": "MFA",
  "session": "session-token-string",
  "message": "MFA verification required"
}
```

**Error Responses:**
- `400 INVALID_REQUEST` - Missing email or password
- `401 INVALID_CREDENTIALS` - Wrong email or password
- `403 EMAIL_NOT_VERIFIED` - Email verification required
- `403 ACCOUNT_LOCKED` - Too many failed attempts

---

#### POST /auth/verify-email

Verify email address with confirmation code.

**Request Body:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Success Response (200):**
```json
{
  "message": "Email verified successfully"
}
```

**Error Responses:**
- `400 INVALID_REQUEST` - Missing email or code
- `400 CODE_EXPIRED` - Verification code expired
- `400 INVALID_PASSWORD_RESET_CODE` - Invalid code

---

#### POST /auth/resend-verification

Resend email verification code.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "message": "Verification code sent",
  "codeDeliveryDetails": {
    "destination": "u***@example.com",
    "deliveryMedium": "EMAIL"
  }
}
```

---

#### POST /auth/forgot-password

Request password reset code.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "message": "Password reset code sent",
  "codeDeliveryDetails": {
    "destination": "u***@example.com",
    "deliveryMedium": "EMAIL"
  }
}
```

---

#### POST /auth/reset-password

Complete password reset with code.

**Request Body:**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewSecurePassword123!"
}
```

**Success Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

**Error Responses:**
- `400 INVALID_PASSWORD_RESET_CODE` - Invalid or expired code
- `400 WEAK_PASSWORD` - New password doesn't meet requirements

---

#### POST /auth/refresh

Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ..."
}
```

**Success Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Error Responses:**
- `401 TOKEN_REFRESH_FAILED` - Invalid or expired refresh token

---

#### POST /auth/mfa/challenge

Respond to MFA challenge during login.

**Request Body:**
```json
{
  "session": "session-token-from-login",
  "code": "123456"
}
```

**Success Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ...",
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "tenantId": "tenant-123",
    "roles": ["TRADER"]
  }
}
```

**Error Responses:**
- `401 INVALID_MFA_CODE` - Wrong MFA code

---

### SSO Endpoints

#### GET /auth/sso/providers

List available SSO providers.

**Success Response (200):**
```json
{
  "providers": [
    {
      "id": "okta-enterprise",
      "name": "okta-enterprise",
      "displayName": "Okta Enterprise",
      "type": "OIDC",
      "enabled": true,
      "logoUrl": "https://example.com/okta-logo.png"
    }
  ]
}
```

---

#### GET /auth/sso/initiate/{providerId}

Initiate SSO authentication flow.

**Path Parameters:**
- `providerId` - SSO provider identifier

**Query Parameters:**
- `redirectUri` (optional) - URL to redirect after authentication

**Success Response (302):**
Redirects to identity provider authorization URL.

**Response Headers:**
```
Location: https://idp.example.com/authorize?client_id=...&state=...
```

---

#### POST /auth/sso/callback

Handle SSO callback from identity provider.

**Request Body:**
```json
{
  "code": "authorization-code",
  "state": "state-parameter"
}
```

**Success Response (200):**
```json
{
  "tokens": {
    "accessToken": "...",
    "refreshToken": "...",
    "idToken": "...",
    "expiresIn": 3600
  },
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "tenantId": "tenant-123",
    "roles": ["VIEWER"]
  },
  "isNewUser": true
}
```

---

### Authenticated Endpoints (Bearer Token Required)

All authenticated endpoints require the `Authorization` header:
```
Authorization: Bearer <access_token>
```

#### POST /auth/logout

Sign out user and invalidate tokens.

**Success Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

---

#### GET /auth/me

Get current user profile.

**Success Response (200):**
```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "tenantId": "tenant-123",
    "roles": ["TRADER", "VIEWER"],
    "emailVerified": true
  }
}
```

---

#### POST /auth/mfa/setup

Initiate MFA setup (get secret for authenticator app).

**Success Response (200):**
```json
{
  "secretCode": "JBSWY3DPEHPK3PXP",
  "session": "session-token",
  "message": "Scan the QR code with your authenticator app, then verify with a code."
}
```

The `secretCode` should be used to generate a QR code with the following format:
```
otpauth://totp/{app_name}:{email}?secret={secretCode}&issuer={app_name}
```

---

#### POST /auth/mfa/verify

Verify MFA setup with code from authenticator app.

**Request Body:**
```json
{
  "accessToken": "current-access-token",
  "code": "123456",
  "friendlyDeviceName": "My iPhone"
}
```

**Success Response (200):**
```json
{
  "status": "SUCCESS",
  "message": "MFA enabled successfully"
}
```

---

#### POST /auth/change-password

Change password (requires current password).

**Request Body:**
```json
{
  "accessToken": "current-access-token",
  "previousPassword": "OldPassword123!",
  "proposedPassword": "NewPassword456!"
}
```

**Success Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses:**
- `401 INVALID_CREDENTIALS` - Current password incorrect
- `400 WEAK_PASSWORD` - New password doesn't meet requirements

---

</content>
</invoke>

#### GET /auth/audit/export

Export authentication audit logs (Admin only).

**Query Parameters:**
- `startDate` (required) - ISO 8601 date string
- `endDate` (required) - ISO 8601 date string
- `format` (optional) - `json` (default) or `csv`
- `eventType` (optional) - Filter by event type
- `userId` (optional) - Filter by user ID

**Success Response (200):**
```json
{
  "entries": [
    {
      "entryId": "uuid",
      "timestamp": "2026-01-07T10:30:00Z",
      "event": "LOGIN_SUCCESS",
      "userId": "user-uuid",
      "email": "user@example.com",
      "tenantId": "tenant-123",
      "ip": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "success": true
    }
  ],
  "count": 1,
  "startDate": "2026-01-01T00:00:00Z",
  "endDate": "2026-01-07T23:59:59Z"
}
```

---

## Error Codes Reference

### Request Validation Errors (400)

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_REQUEST` | Request body is malformed or missing | Check request body format |
| `MISSING_REQUIRED_FIELD` | Required field is missing | Include all required fields |
| `INVALID_EMAIL_FORMAT` | Email format is invalid | Use valid email format |
| `WEAK_PASSWORD` | Password doesn't meet policy | Use min 12 chars with uppercase, lowercase, numbers, symbols |

### Authentication Errors (401)

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_CREDENTIALS` | Wrong email or password | Verify credentials |
| `INVALID_TOKEN` | JWT is invalid or malformed | Re-authenticate |
| `TOKEN_EXPIRED` | Access token has expired | Use refresh token |
| `TOKEN_REFRESH_FAILED` | Refresh token is invalid | Re-authenticate |
| `INVALID_MFA_CODE` | MFA code is incorrect | Enter correct 6-digit code |
| `INVALID_PASSWORD_RESET_CODE` | Reset code is invalid or expired | Request new code |
| `CODE_EXPIRED` | Verification code has expired | Request new code |

### Authorization Errors (403)

| Code | Description | Resolution |
|------|-------------|------------|
| `EMAIL_NOT_VERIFIED` | Email verification required | Verify email first |
| `ACCOUNT_LOCKED` | Account locked due to failed attempts | Wait 30 minutes or contact support |
| `ACCOUNT_DISABLED` | Account has been disabled | Contact administrator |
| `MFA_REQUIRED` | MFA verification pending | Complete MFA challenge |
| `INSUFFICIENT_PERMISSIONS` | User lacks required role | Contact administrator for access |
| `TENANT_MISMATCH` | Resource belongs to different tenant | Access only your tenant's resources |

### Conflict Errors (409)

| Code | Description | Resolution |
|------|-------------|------------|
| `USER_EXISTS` | Email already registered | Use different email or login |

### Rate Limiting (429)

| Code | Description | Resolution |
|------|-------------|------------|
| `TOO_MANY_REQUESTS` | Rate limit exceeded | Wait and retry (check Retry-After header) |

### Server Errors (500)

| Code | Description | Resolution |
|------|-------------|------------|
| `AUTH_ERROR` | Internal authentication error | Retry or contact support |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable | Retry later |

---

## Token Formats

### Access Token (JWT)

Used for API authorization. Valid for 1 hour.

**Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id"
}
```

**Payload:**
```json
{
  "sub": "user-uuid",
  "iss": "https://cognito-idp.{region}.amazonaws.com/{user-pool-id}",
  "client_id": "app-client-id",
  "origin_jti": "jti-uuid",
  "event_id": "event-uuid",
  "token_use": "access",
  "scope": "aws.cognito.signin.user.admin",
  "auth_time": 1704628200,
  "exp": 1704631800,
  "iat": 1704628200,
  "jti": "jti-uuid",
  "username": "user-uuid"
}
```

### ID Token (JWT)

Contains user identity claims. Valid for 1 hour.

**Payload:**
```json
{
  "sub": "user-uuid",
  "email_verified": true,
  "iss": "https://cognito-idp.{region}.amazonaws.com/{user-pool-id}",
  "cognito:username": "user-uuid",
  "origin_jti": "jti-uuid",
  "aud": "app-client-id",
  "event_id": "event-uuid",
  "token_use": "id",
  "auth_time": 1704628200,
  "name": "John Doe",
  "exp": 1704631800,
  "iat": 1704628200,
  "email": "user@example.com",
  "custom:tenant_id": "tenant-123",
  "custom:roles": "[\"TRADER\",\"VIEWER\"]"
}
```

### Refresh Token

Opaque encrypted token. Valid for 30 days. Used to obtain new access tokens.

---

## User Context (Extracted from JWT)

When a valid JWT is provided, the following user context is available:

```typescript
interface UserContext {
  userId: string;      // Cognito user ID (sub claim)
  email: string;       // User email
  tenantId: string;    // Organization/tenant ID
  roles: string[];     // Array of role names
  emailVerified: boolean;
}
```

---

## Role Definitions

| Role | Description | Permissions |
|------|-------------|-------------|
| `VIEWER` | Read-only access | View strategies, positions, reports |
| `TRADER` | Trading operations | VIEWER + execute orders, manage strategies |
| `ANALYST` | Analysis access | VIEWER + AI analysis, audit logs, export reports |
| `ADMIN` | Tenant administrator | TRADER + ANALYST + user management, settings |
| `SUPER_ADMIN` | Platform support | Full access across all tenants |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /auth/login | 100 requests | 5 minutes per IP |
| POST /auth/signup | 10 requests | 5 minutes per IP |
| POST /auth/forgot-password | 5 requests | 5 minutes per IP |
| POST /auth/reset-password | 5 requests | 5 minutes per IP |

When rate limited, the response includes:
- HTTP Status: `429 Too Many Requests`
- Header: `Retry-After: <seconds>`

---

## Security Headers

All responses include:
```
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type,Authorization
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
```

401 responses include:
```
WWW-Authenticate: Bearer realm="api", error="invalid_token", error_description="..."
```

---

## CORS Support

All endpoints support CORS preflight requests (OPTIONS method).

---

## Audit Events

The following events are logged for security monitoring:

| Event | Description |
|-------|-------------|
| `LOGIN_SUCCESS` | Successful authentication |
| `LOGIN_FAILED` | Failed authentication attempt |
| `LOGIN_MFA_REQUIRED` | MFA challenge initiated |
| `LOGOUT` | User signed out |
| `SIGNUP` | New user registration |
| `EMAIL_VERIFIED` | Email verification completed |
| `PASSWORD_CHANGED` | Password changed |
| `PASSWORD_RESET_REQUESTED` | Password reset initiated |
| `PASSWORD_RESET_COMPLETED` | Password reset completed |
| `MFA_ENABLED` | MFA setup completed |
| `MFA_DISABLED` | MFA disabled |
| `MFA_VERIFIED` | MFA challenge passed |
| `TOKEN_REFRESHED` | Access token refreshed |
| `SESSION_EXPIRED` | Session expired |
| `ACCOUNT_LOCKED` | Account locked due to failed attempts |
| `SSO_LOGIN` | SSO authentication |

Audit logs are retained for 90 days.
