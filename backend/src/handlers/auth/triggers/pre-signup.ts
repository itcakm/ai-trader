/**
 * Cognito Pre-Signup Lambda Trigger
 * 
 * Validates user signup requests before they are processed by Cognito.
 * This trigger runs before a new user is created in the user pool.
 * 
 * Requirements: 1.8, 12.2
 */

import { PreSignUpTriggerEvent, PreSignUpTriggerHandler, Context } from 'aws-lambda';

/**
 * Blocked email domains (disposable email providers)
 */
const BLOCKED_EMAIL_DOMAINS = [
  'tempmail.com',
  'throwaway.com',
  'mailinator.com',
  'guerrillamail.com',
  'temp-mail.org',
  '10minutemail.com',
  'fakeinbox.com',
  'trashmail.com',
];

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if email domain is blocked
 */
function isBlockedDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return BLOCKED_EMAIL_DOMAINS.includes(domain);
}

/**
 * Validate name format
 */
function isValidName(name: string): boolean {
  // Name should be 1-100 characters, alphanumeric with spaces and common punctuation
  const nameRegex = /^[\p{L}\p{M}\s'.,-]{1,100}$/u;
  return nameRegex.test(name);
}

/**
 * Pre-Signup Trigger Handler
 * 
 * Validates:
 * - Email format and domain
 * - Name format
 * - Custom validation rules
 */
export const handler: PreSignUpTriggerHandler = async (
  event: PreSignUpTriggerEvent,
  context: Context
): Promise<PreSignUpTriggerEvent> => {
  console.log('Pre-signup trigger invoked', {
    userPoolId: event.userPoolId,
    userName: event.userName,
    triggerSource: event.triggerSource,
  });

  const { email, name } = event.request.userAttributes;

  try {
    // Validate email format
    if (!email || !isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Check for blocked email domains
    if (isBlockedDomain(email)) {
      console.warn('Blocked email domain attempted signup', { email: email.split('@')[1] });
      throw new Error('Email domain not allowed');
    }

    // Validate name if provided
    if (name && !isValidName(name)) {
      throw new Error('Invalid name format');
    }

    // For external provider signups (SSO), auto-confirm the user
    if (event.triggerSource === 'PreSignUp_ExternalProvider') {
      event.response.autoConfirmUser = true;
      event.response.autoVerifyEmail = true;
      console.log('Auto-confirming external provider user', { email });
    }

    // For admin-created users, auto-confirm
    if (event.triggerSource === 'PreSignUp_AdminCreateUser') {
      event.response.autoConfirmUser = true;
      console.log('Auto-confirming admin-created user', { email });
    }

    console.log('Pre-signup validation passed', { email });
    return event;

  } catch (error) {
    console.error('Pre-signup validation failed', {
      email,
      error: (error as Error).message,
    });
    throw error;
  }
};

export default handler;
