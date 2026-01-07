/**
 * Cognito Lambda Triggers Index
 * 
 * Exports all Cognito Lambda trigger handlers.
 * 
 * Requirements: 1.8, 12.2, 12.3, 12.4
 */

export { handler as preSignupHandler } from './pre-signup';
export { handler as postConfirmationHandler } from './post-confirmation';
export { handler as postAuthenticationHandler } from './post-authentication';
