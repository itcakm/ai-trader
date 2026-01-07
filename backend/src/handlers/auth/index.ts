/**
 * Auth Handlers Index
 * 
 * Exports all auth handlers for use in the main router.
 */

export { signup, handler as signupHandler } from './signup';
export { login, handler as loginHandler } from './login';
export { logout, handler as logoutHandler } from './logout';
export { refresh, handler as refreshHandler } from './refresh';
export { verifyEmail, handler as verifyEmailHandler } from './verify-email';
export { resendVerification, handler as resendVerificationHandler } from './resend-verification';
export { forgotPassword, handler as forgotPasswordHandler } from './forgot-password';
export { resetPassword, handler as resetPasswordHandler } from './reset-password';
export { mfaSetup, handler as mfaSetupHandler } from './mfa-setup';
export { mfaVerify, handler as mfaVerifyHandler } from './mfa-verify';
export { mfaChallenge, handler as mfaChallengeHandler } from './mfa-challenge';
export { me, handler as meHandler } from './me';
export { changePassword, handler as changePasswordHandler } from './change-password';

// SSO handlers - Requirements: 7.3, 7.4, 7.5
export { ssoProviders, handler as ssoProvidersHandler } from './sso-providers';
export { ssoInitiate, handler as ssoInitiateHandler } from './sso-initiate';
export { ssoCallback, handler as ssoCallbackHandler } from './sso-callback';

// Audit export handler - Requirements: 11.10
export { exportAuditLogs, handler as auditExportHandler } from './audit-export';

// Cognito Lambda Triggers - Requirements: 1.8, 12.2, 12.3, 12.4
export * from './triggers';
