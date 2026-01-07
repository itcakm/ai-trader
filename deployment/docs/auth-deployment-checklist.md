# Authentication System Deployment Checklist

## Overview

This checklist guides the deployment and validation of the production authentication system. Follow each section in order to ensure a complete and secure deployment.

## Prerequisites

- [ ] AWS CLI configured with appropriate credentials
- [ ] Terraform installed (v1.0+)
- [ ] Node.js installed (v18+)
- [ ] Access to the target AWS account
- [ ] Domain DNS configured (for test/production environments)

---

## Phase 1: Infrastructure Deployment (Task 19.1)

### 1.1 Deploy Cognito Infrastructure

```bash
# Navigate to infrastructure directory
cd infrastructure/environments/test

# Initialize Terraform
terraform init

# Plan the deployment
terraform plan -target=module.cognito -out=cognito.tfplan

# Apply Cognito module
terraform apply cognito.tfplan
```

**Verification:**
- [ ] Cognito User Pool created
- [ ] App Client created with correct auth flows
- [ ] Password policy: min 12 chars, uppercase, lowercase, numbers, symbols
- [ ] MFA configuration: OPTIONAL with TOTP enabled
- [ ] Advanced security: ENFORCED mode
- [ ] Token validity: Access 1hr, Refresh 30 days, ID 1hr

### 1.2 Deploy WAF Auth Rules

```bash
# Plan WAF deployment
terraform plan -target=module.waf -out=waf.tfplan

# Apply WAF module
terraform apply waf.tfplan
```

**Verification:**
- [ ] Auth rate limiting rule group created
- [ ] Login rate limit: 100 req/5min per IP
- [ ] Signup rate limit: 10 req/5min per IP
- [ ] Password reset rate limit: 5 req/5min per IP
- [ ] SQL injection protection enabled
- [ ] XSS protection enabled
- [ ] CloudWatch logging configured

### 1.3 Verify Infrastructure Resources

```bash
# Run infrastructure validation
./deployment/scripts/deploy-infrastructure.sh test

# Check manifest file
cat deployment/manifests/test-manifest.json | jq '.cognito_user_pool_id, .cognito_app_client_id'
```

**Expected Outputs:**
- [ ] `cognito_user_pool_id` present in manifest
- [ ] `cognito_app_client_id` present in manifest
- [ ] `waf_web_acl_arn` present in manifest

---

## Phase 2: Backend Deployment (Task 19.2)

### 2.1 Build and Package Auth Handlers

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm ci

# Build TypeScript
npm run build

# Run tests
npm test
```

**Verification:**
- [ ] All tests pass
- [ ] No TypeScript compilation errors
- [ ] dist/ directory created

### 2.2 Deploy Auth Lambda Functions

```bash
# Deploy backend
./deployment/scripts/deploy-backend.sh test
```

**Auth Handlers to Deploy:**
- [ ] `auth` - Main auth router
- [ ] `auth/signup` - User registration
- [ ] `auth/login` - User authentication
- [ ] `auth/logout` - Session termination
- [ ] `auth/refresh` - Token refresh
- [ ] `auth/verify-email` - Email verification
- [ ] `auth/resend-verification` - Resend verification code
- [ ] `auth/forgot-password` - Password reset request
- [ ] `auth/reset-password` - Password reset completion
- [ ] `auth/mfa-setup` - MFA setup
- [ ] `auth/mfa-verify` - MFA verification
- [ ] `auth/mfa-challenge` - MFA challenge response
- [ ] `auth/me` - User profile

### 2.3 Configure Environment Variables

Ensure Lambda functions have these environment variables:
- [ ] `COGNITO_USER_POOL_ID`
- [ ] `COGNITO_CLIENT_ID`
- [ ] `AWS_REGION`
- [ ] `ENVIRONMENT`

---

## Phase 3: Frontend Deployment (Task 19.3)

### 3.1 Build Frontend

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm ci

# Build for production
npm run build
```

**Verification:**
- [ ] Build completes without errors
- [ ] out/ directory created

### 3.2 Deploy to S3/CloudFront

```bash
# Deploy frontend
./deployment/scripts/deploy-frontend.sh test
```

**Auth Pages to Verify:**
- [ ] `/login` - Login page accessible
- [ ] `/signup` - Signup page accessible
- [ ] `/verify-email` - Email verification page
- [ ] `/forgot-password` - Password reset request page
- [ ] `/reset-password` - Password reset page
- [ ] `/settings/mfa` - MFA setup page
- [ ] `/settings/account` - Account settings page

### 3.3 Test Auth Flows End-to-End

**Manual Testing Checklist:**

1. **Signup Flow:**
   - [ ] Navigate to signup page
   - [ ] Fill in email, password, name
   - [ ] Submit form
   - [ ] Receive verification email
   - [ ] Enter verification code
   - [ ] Redirect to login

2. **Login Flow:**
   - [ ] Navigate to login page
   - [ ] Enter credentials
   - [ ] Submit form
   - [ ] Redirect to dashboard
   - [ ] User info displayed correctly

3. **MFA Flow (if enabled):**
   - [ ] Navigate to MFA setup
   - [ ] Scan QR code with authenticator app
   - [ ] Enter verification code
   - [ ] MFA enabled successfully
   - [ ] Login requires MFA code

4. **Password Reset Flow:**
   - [ ] Navigate to forgot password
   - [ ] Enter email
   - [ ] Receive reset email
   - [ ] Enter code and new password
   - [ ] Login with new password

5. **Logout Flow:**
   - [ ] Click logout
   - [ ] Tokens cleared
   - [ ] Redirect to login
   - [ ] Protected routes inaccessible

---

## Phase 4: Security Validation (Task 19.4)

### 4.1 Run Auth Validation Script

```bash
# Run comprehensive auth validation
./deployment/tests/auth-validation.sh test
```

**Expected Results:**
- [ ] Cognito User Pool validated
- [ ] Cognito App Client validated
- [ ] WAF rules validated
- [ ] Auth endpoints accessible
- [ ] Rate limiting configured
- [ ] SQL injection blocked
- [ ] XSS blocked
- [ ] Tenant isolation enforced
- [ ] Audit logging configured

### 4.2 Test Rate Limiting

```bash
# Test login rate limiting (should get 429 after ~100 requests)
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "https://api.test.acinaces.com/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done | sort | uniq -c
```

**Expected:** 429 responses after rate limit exceeded

### 4.3 Test WAF Security Rules

```bash
# Test SQL injection blocking
curl -X POST "https://api.test.acinaces.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test'\'' OR 1=1--"}'
# Expected: 403 Forbidden

# Test XSS blocking
curl -X POST "https://api.test.acinaces.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"<script>alert(1)</script>@test.com","password":"test"}'
# Expected: 403 Forbidden
```

### 4.4 Test Tenant Isolation

```bash
# Test that X-Tenant-Id header is ignored
curl -X GET "https://api.test.acinaces.com/api/strategies" \
  -H "X-Tenant-Id: malicious-tenant"
# Expected: 401 Unauthorized (not 200 with wrong tenant data)
```

### 4.5 Verify Audit Logs

```bash
# Check CloudWatch logs for auth events
aws logs filter-log-events \
  --log-group-name "/aws/lambda/test-crypto-trading-auth" \
  --filter-pattern "LOGIN" \
  --region eu-central-1

# Check DynamoDB auth audit table
aws dynamodb scan \
  --table-name "test-crypto-trading-auth-audit" \
  --region eu-central-1 \
  --max-items 10
```

**Expected:** Recent auth events logged

---

## Post-Deployment Verification

### Final Checklist

- [ ] All infrastructure resources created
- [ ] All Lambda functions deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] Auth flows working end-to-end
- [ ] Rate limiting active
- [ ] Security rules blocking attacks
- [ ] Tenant isolation enforced
- [ ] Audit logs being captured
- [ ] Validation report generated

### Generate Final Report

```bash
# Generate comprehensive validation report
./deployment/scripts/validate-deployment.sh test
```

---

## Troubleshooting

### Common Issues

1. **Cognito User Pool not found:**
   - Check Terraform state
   - Verify AWS region
   - Re-run `terraform apply`

2. **Lambda function errors:**
   - Check CloudWatch logs
   - Verify environment variables
   - Check IAM permissions

3. **WAF blocking legitimate requests:**
   - Review WAF logs in CloudWatch
   - Adjust rate limits if needed
   - Check rule priorities

4. **Frontend auth not working:**
   - Check browser console for errors
   - Verify API URL configuration
   - Check CORS settings

### Support Resources

- AWS Cognito Documentation: https://docs.aws.amazon.com/cognito/
- AWS WAF Documentation: https://docs.aws.amazon.com/waf/
- Project README: /README.md

---

*Last Updated: January 2026*
