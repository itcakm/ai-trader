# Authentication Troubleshooting Guide

This guide covers common authentication issues, debugging steps, and security best practices for the AI-Assisted Crypto Trading System.

---

## Common Issues and Solutions

### 1. Login Failures

#### Issue: "Invalid email or password" error

**Possible Causes:**
- Incorrect credentials
- Account not verified
- Account locked

**Debugging Steps:**
1. Verify the email address is correct
2. Check if the account exists in Cognito User Pool
3. Check if email is verified (`email_verified` attribute)
4. Check CloudWatch logs for specific error codes

**Resolution:**
- If account not verified: Use `/auth/resend-verification` endpoint
- If account locked: Wait 30 minutes or reset via admin console
- If credentials wrong: Use password reset flow

#### Issue: "Email verification required" (403)

**Cause:** User hasn't verified their email address.

**Resolution:**
1. Call `POST /auth/resend-verification` with user's email
2. User enters verification code via `POST /auth/verify-email`

---

### 2. Token Issues

#### Issue: "Invalid or malformed token" (401)

**Possible Causes:**
- Token is corrupted or truncated
- Token from different environment
- Token signature invalid

**Debugging Steps:**
1. Decode token at jwt.io (don't paste production tokens!)
2. Verify `iss` claim matches your Cognito User Pool
3. Verify `aud` claim matches your App Client ID
4. Check token hasn't been modified

**Resolution:**
- Re-authenticate to get fresh tokens
- Verify frontend is storing tokens correctly

#### Issue: "Token has expired" (401)

**Cause:** Access token validity (1 hour) exceeded.

**Resolution:**
1. Use refresh token to get new access token
2. Call `POST /auth/refresh` with refresh token
3. If refresh fails, user must re-authenticate

#### Issue: Token refresh fails

**Possible Causes:**
- Refresh token expired (30 days)
- User signed out globally
- Password changed (invalidates all tokens)

**Resolution:**
- User must re-authenticate with credentials

---

### 3. MFA Issues

#### Issue: MFA code always invalid

**Possible Causes:**
- Time sync issue on user's device
- Wrong authenticator app entry
- Code expired (30-second window)

**Debugging Steps:**
1. Verify device time is synced (automatic time setting)
2. Check if correct account is selected in authenticator app
3. Wait for new code and try immediately

**Resolution:**
- Sync device time
- Re-setup MFA if persistent issue

#### Issue: Lost MFA device

**Resolution:**
1. Admin disables MFA for user in Cognito console
2. User logs in without MFA
3. User sets up MFA again with new device

---

### 4. SSO Issues

#### Issue: SSO redirect fails

**Possible Causes:**
- Invalid redirect URI
- Provider not configured
- State parameter mismatch

**Debugging Steps:**
1. Check provider configuration in Cognito
2. Verify redirect URIs are whitelisted
3. Check CloudWatch logs for SSO errors

#### Issue: SSO user not provisioned

**Cause:** JIT provisioning failed.

**Debugging Steps:**
1. Check attribute mapping configuration
2. Verify required attributes are provided by IdP
3. Check Lambda trigger logs

---

### 5. Rate Limiting

#### Issue: "Too many requests" (429)

**Cause:** Rate limit exceeded.

**Resolution:**
1. Check `Retry-After` header for wait time
2. Implement exponential backoff in client
3. If legitimate traffic, contact admin to adjust limits

**Rate Limits:**
- Login: 100 requests / 5 minutes per IP
- Signup: 10 requests / 5 minutes per IP
- Password reset: 5 requests / 5 minutes per IP

---

### 6. Permission Issues

#### Issue: "Insufficient permissions" (403)

**Cause:** User's role doesn't have required permission.

**Debugging Steps:**
1. Check user's roles in JWT (`custom:roles` claim)
2. Verify required role for the endpoint
3. Check role-permission mapping

**Resolution:**
- Admin assigns appropriate role to user
- Update `custom:roles` attribute in Cognito

---

## Debugging Tools and Techniques

### 1. CloudWatch Logs

**Log Groups:**
- `/aws/lambda/auth-*` - Auth handler logs
- `/aws/cognito/userpools/{pool-id}` - Cognito events
- `/aws/waf/auth-protection` - WAF blocked requests

**Useful Log Insights Queries:**

```sql
-- Find failed login attempts
fields @timestamp, @message
| filter @message like /LOGIN_FAILED/
| sort @timestamp desc
| limit 100

-- Find rate-limited requests
fields @timestamp, @message
| filter @message like /TOO_MANY_REQUESTS/
| sort @timestamp desc
| limit 50

-- Find specific user's auth events
fields @timestamp, @message
| filter @message like /user@example.com/
| sort @timestamp desc
| limit 100
```

### 2. JWT Debugging

**Decode JWT (development only):**
```bash
# Decode header
echo "<token>" | cut -d'.' -f1 | base64 -d | jq

# Decode payload
echo "<token>" | cut -d'.' -f2 | base64 -d | jq
```

**Verify token claims:**
- `exp` - Expiration timestamp (Unix)
- `iss` - Should match Cognito User Pool URL
- `aud` - Should match App Client ID
- `token_use` - "access" or "id"

### 3. Cognito Console

**Check user status:**
1. AWS Console → Cognito → User Pools
2. Select your pool → Users
3. Search for user by email
4. Check: Enabled, Confirmed, MFA status

**Check user attributes:**
- `email_verified` - Must be true for login
- `custom:tenant_id` - Organization assignment
- `custom:roles` - JSON array of roles

### 4. WAF Console

**Check blocked requests:**
1. AWS Console → WAF & Shield
2. Select Web ACL
3. View sampled requests
4. Check rule that blocked request

---

## Security Best Practices

### 1. Token Handling

**DO:**
- Store tokens securely (httpOnly cookies preferred)
- Refresh tokens before expiration (5 min buffer)
- Clear tokens on logout
- Validate tokens on every API request

**DON'T:**
- Store tokens in localStorage (XSS vulnerable)
- Log tokens in client-side code
- Share tokens between tabs via postMessage
- Include tokens in URLs

### 2. Password Security

**Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one symbol

**Best Practices:**
- Use password manager
- Enable MFA for all users
- Rotate passwords every 90 days
- Don't reuse last 5 passwords

### 3. MFA Configuration

**Recommended:**
- Enable MFA for all admin users
- Use TOTP (authenticator apps) over SMS
- Store backup codes securely
- Require MFA for sensitive operations

### 4. Session Management

**Best Practices:**
- Implement idle timeout (15-30 minutes)
- Force re-auth for sensitive operations
- Support "logout all devices" feature
- Monitor for concurrent sessions

### 5. API Security

**Best Practices:**
- Always use HTTPS
- Validate all input server-side
- Implement rate limiting
- Log all auth events
- Monitor for anomalies

### 6. Error Handling

**DO:**
- Return generic error messages to clients
- Log detailed errors server-side
- Use consistent error codes
- Include correlation IDs for debugging

**DON'T:**
- Reveal user existence in errors
- Include stack traces in responses
- Expose internal system details
- Return different errors for valid/invalid users

---

## Monitoring and Alerts

### Recommended CloudWatch Alarms

1. **Failed Login Spike**
   - Metric: LOGIN_FAILED count
   - Threshold: > 50 in 5 minutes
   - Action: Alert security team

2. **Account Lockouts**
   - Metric: ACCOUNT_LOCKED count
   - Threshold: > 10 in 1 hour
   - Action: Investigate potential attack

3. **WAF Blocks**
   - Metric: BlockedRequests
   - Threshold: > 100 in 5 minutes
   - Action: Review blocked IPs

4. **Token Refresh Failures**
   - Metric: TOKEN_REFRESH_FAILED count
   - Threshold: > 20 in 5 minutes
   - Action: Check Cognito health

### Audit Log Review

**Daily:**
- Review failed login attempts
- Check for unusual IP addresses
- Monitor admin actions

**Weekly:**
- Review account lockouts
- Check MFA adoption rate
- Analyze login patterns

**Monthly:**
- Full security audit
- Review access patterns
- Update rate limits if needed

---

## Emergency Procedures

### 1. Suspected Account Compromise

1. Disable user account in Cognito
2. Revoke all tokens (GlobalSignOut)
3. Reset password
4. Review audit logs
5. Notify user
6. Re-enable with new credentials

### 2. Mass Attack Detection

1. Enable stricter WAF rules
2. Temporarily reduce rate limits
3. Block suspicious IPs
4. Alert security team
5. Monitor CloudWatch metrics

### 3. Cognito Service Issues

1. Check AWS Service Health Dashboard
2. Enable fallback authentication (if configured)
3. Communicate to users
4. Monitor for resolution

---

## Support Escalation

### Level 1: Self-Service
- Password reset
- Email verification
- MFA setup

### Level 2: Admin Support
- Account unlock
- Role assignment
- MFA reset

### Level 3: Engineering
- Token issues
- SSO configuration
- Infrastructure problems

### Level 4: AWS Support
- Cognito service issues
- WAF configuration
- Performance problems

---

## Useful Commands

### Check Cognito User
```bash
aws cognito-idp admin-get-user \
  --user-pool-id <pool-id> \
  --username <email>
```

### Disable User
```bash
aws cognito-idp admin-disable-user \
  --user-pool-id <pool-id> \
  --username <email>
```

### Reset User Password
```bash
aws cognito-idp admin-reset-user-password \
  --user-pool-id <pool-id> \
  --username <email>
```

### Global Sign Out
```bash
aws cognito-idp admin-user-global-sign-out \
  --user-pool-id <pool-id> \
  --username <email>
```

### Update User Attributes
```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id <pool-id> \
  --username <email> \
  --user-attributes Name=custom:roles,Value='["ADMIN"]'
```
