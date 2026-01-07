/**
 * Cognito Post-Confirmation Lambda Trigger
 * 
 * Handles user setup after email verification is complete.
 * This trigger runs after a user confirms their account.
 * 
 * Requirements: 1.8, 12.2
 */

import { PostConfirmationTriggerEvent, PostConfirmationTriggerHandler, Context } from 'aws-lambda';
import { documentClient } from '../../../db/client';
import { generateUUID } from '../../../utils/uuid';

/**
 * Default role for new users
 */
const DEFAULT_ROLE = 'VIEWER';

/**
 * Default tenant ID for users without one
 */
const DEFAULT_TENANT_PREFIX = 'tenant-';

/**
 * User profile table name
 */
const USER_PROFILE_TABLE = process.env.DYNAMODB_TABLE_USER_PROFILES || 'user-profiles';

/**
 * Create initial user profile in DynamoDB
 */
async function createUserProfile(
  userId: string,
  email: string,
  name: string,
  tenantId: string
): Promise<void> {
  const now = new Date().toISOString();

  const profile = {
    userId,
    email,
    name: name || '',
    tenantId,
    roles: [DEFAULT_ROLE],
    createdAt: now,
    updatedAt: now,
    emailVerified: true,
    mfaEnabled: false,
    status: 'ACTIVE',
    preferences: {
      notifications: {
        email: true,
        loginAlerts: true,
        securityAlerts: true,
      },
      timezone: 'UTC',
      language: 'en',
    },
  };

  try {
    await documentClient.put({
      TableName: USER_PROFILE_TABLE,
      Item: profile,
      ConditionExpression: 'attribute_not_exists(userId)',
    }).promise();

    console.log('User profile created', { userId, email, tenantId });
  } catch (error: any) {
    if (error.code === 'ConditionalCheckFailedException') {
      console.log('User profile already exists', { userId });
      return;
    }
    throw error;
  }
}

/**
 * Send welcome email to new user
 */
async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  // In production, this would use SES to send a welcome email
  // For now, we just log the intent
  console.log('Welcome email would be sent', { email, name });
  
  // TODO: Implement SES email sending
  // const ses = new SESClient({ region: process.env.AWS_REGION });
  // await ses.send(new SendEmailCommand({...}));
}

/**
 * Log user confirmation event for audit
 */
async function logConfirmationEvent(
  userId: string,
  email: string,
  tenantId: string,
  triggerSource: string
): Promise<void> {
  const auditTable = process.env.AUTH_AUDIT_TABLE || 'auth-audit';
  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + (90 * 24 * 60 * 60); // 90 days

  const entry = {
    entryId: generateUUID(),
    timestamp: now.toISOString(),
    event: 'EMAIL_VERIFIED',
    userId,
    email,
    tenantId,
    ip: 'cognito-trigger',
    userAgent: 'cognito-trigger',
    success: true,
    metadata: {
      triggerSource,
    },
    ttl,
  };

  try {
    await documentClient.put({
      TableName: auditTable,
      Item: entry,
    }).promise();
  } catch (error) {
    console.error('Failed to log confirmation event', error);
    // Don't fail the trigger for audit logging errors
  }
}

/**
 * Post-Confirmation Trigger Handler
 * 
 * Actions performed:
 * - Create user profile in DynamoDB
 * - Assign default role
 * - Send welcome email
 * - Log confirmation event
 */
export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent,
  context: Context
): Promise<PostConfirmationTriggerEvent> => {
  console.log('Post-confirmation trigger invoked', {
    userPoolId: event.userPoolId,
    userName: event.userName,
    triggerSource: event.triggerSource,
  });

  const { sub, email, name } = event.request.userAttributes;
  const tenantId = event.request.userAttributes['custom:tenant_id'] || 
                   `${DEFAULT_TENANT_PREFIX}${generateUUID().substring(0, 8)}`;

  try {
    // Only process for confirmed signups
    if (event.triggerSource === 'PostConfirmation_ConfirmSignUp' ||
        event.triggerSource === 'PostConfirmation_ConfirmForgotPassword') {
      
      // Create user profile
      await createUserProfile(sub, email, name || '', tenantId);

      // Send welcome email (only for new signups)
      if (event.triggerSource === 'PostConfirmation_ConfirmSignUp') {
        await sendWelcomeEmail(email, name || '');
      }

      // Log the confirmation event
      await logConfirmationEvent(sub, email, tenantId, event.triggerSource);

      console.log('Post-confirmation processing complete', { userId: sub, email });
    }

    return event;

  } catch (error) {
    console.error('Post-confirmation processing failed', {
      userId: sub,
      email,
      error: (error as Error).message,
    });
    
    // Don't throw - we don't want to fail the confirmation
    // The user is already confirmed in Cognito
    return event;
  }
};

export default handler;
