/**
 * Cognito Post-Authentication Lambda Trigger
 * 
 * Handles actions after successful user authentication.
 * This trigger runs after a user successfully authenticates.
 * 
 * Requirements: 1.8, 12.2, 12.3, 12.4
 */

import { PostAuthenticationTriggerEvent, PostAuthenticationTriggerHandler, Context } from 'aws-lambda';
import { documentClient } from '../../../db/client';
import { generateUUID } from '../../../utils/uuid';

/**
 * User login history table name
 */
const LOGIN_HISTORY_TABLE = process.env.DYNAMODB_TABLE_LOGIN_HISTORY || 'login-history';

/**
 * Auth audit table name
 */
const AUTH_AUDIT_TABLE = process.env.AUTH_AUDIT_TABLE || 'auth-audit';

/**
 * User profile table name
 */
const USER_PROFILE_TABLE = process.env.DYNAMODB_TABLE_USER_PROFILES || 'user-profiles';

/**
 * Maximum login history entries to keep per user
 */
const MAX_LOGIN_HISTORY = 100;

/**
 * Login history entry
 */
interface LoginHistoryEntry {
  userId: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  location?: string;
  deviceId?: string;
  isNewDevice: boolean;
  isNewLocation: boolean;
}

/**
 * Get user's recent login history
 */
async function getRecentLoginHistory(userId: string): Promise<LoginHistoryEntry[]> {
  try {
    const result = await documentClient.query({
      TableName: LOGIN_HISTORY_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // Most recent first
      Limit: 10,
    }).promise();

    return (result.Items || []) as LoginHistoryEntry[];
  } catch (error) {
    console.error('Failed to get login history', error);
    return [];
  }
}

/**
 * Check if this is a new device/location
 */
function isNewDeviceOrLocation(
  currentIp: string,
  currentUserAgent: string,
  history: LoginHistoryEntry[]
): { isNewDevice: boolean; isNewLocation: boolean } {
  if (history.length === 0) {
    return { isNewDevice: true, isNewLocation: true };
  }

  // Check if IP has been seen before
  const knownIps = new Set(history.map(h => h.ip));
  const isNewLocation = !knownIps.has(currentIp);

  // Check if user agent has been seen before (simplified device detection)
  const knownUserAgents = new Set(history.map(h => h.userAgent));
  const isNewDevice = !knownUserAgents.has(currentUserAgent);

  return { isNewDevice, isNewLocation };
}

/**
 * Record login in history
 */
async function recordLoginHistory(entry: LoginHistoryEntry): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year

  try {
    await documentClient.put({
      TableName: LOGIN_HISTORY_TABLE,
      Item: {
        ...entry,
        ttl,
      },
    }).promise();
  } catch (error) {
    console.error('Failed to record login history', error);
  }
}

/**
 * Log authentication event for audit
 */
async function logAuthenticationEvent(
  userId: string,
  email: string,
  tenantId: string,
  ip: string,
  userAgent: string,
  isNewDevice: boolean,
  isNewLocation: boolean
): Promise<void> {
  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + (90 * 24 * 60 * 60); // 90 days

  const entry = {
    entryId: generateUUID(),
    timestamp: now.toISOString(),
    event: 'LOGIN_SUCCESS',
    userId,
    email,
    tenantId,
    ip,
    userAgent,
    success: true,
    metadata: {
      isNewDevice,
      isNewLocation,
      triggerSource: 'PostAuthentication',
    },
    ttl,
  };

  try {
    await documentClient.put({
      TableName: AUTH_AUDIT_TABLE,
      Item: entry,
    }).promise();
  } catch (error) {
    console.error('Failed to log authentication event', error);
  }
}

/**
 * Send login notification email
 * Requirements: 12.2
 */
async function sendLoginNotification(
  email: string,
  name: string,
  ip: string,
  userAgent: string,
  isNewDevice: boolean,
  isNewLocation: boolean
): Promise<void> {
  // Only send notification for new device or location
  if (!isNewDevice && !isNewLocation) {
    return;
  }

  const notificationType = isNewDevice && isNewLocation 
    ? 'new device from new location'
    : isNewDevice 
      ? 'new device'
      : 'new location';

  console.log('Login notification would be sent', {
    email,
    name,
    notificationType,
    ip,
    userAgent: userAgent.substring(0, 100), // Truncate for logging
  });

  // TODO: Implement SES email sending
  // const ses = new SESClient({ region: process.env.AWS_REGION });
  // await ses.send(new SendEmailCommand({
  //   Destination: { ToAddresses: [email] },
  //   Message: {
  //     Subject: { Data: `New login detected on your account` },
  //     Body: {
  //       Html: { Data: `<p>A ${notificationType} login was detected...</p>` },
  //       Text: { Data: `A ${notificationType} login was detected...` },
  //     },
  //   },
  //   Source: process.env.SES_FROM_EMAIL,
  // }));
}

/**
 * Update user's last login timestamp
 */
async function updateLastLogin(userId: string): Promise<void> {
  try {
    await documentClient.update({
      TableName: USER_PROFILE_TABLE,
      Key: { userId },
      UpdateExpression: 'SET lastLoginAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
      },
    }).promise();
  } catch (error) {
    console.error('Failed to update last login', error);
  }
}

/**
 * Get user preferences for notifications
 */
async function getUserNotificationPreferences(userId: string): Promise<{ loginAlerts: boolean }> {
  try {
    const result = await documentClient.get({
      TableName: USER_PROFILE_TABLE,
      Key: { userId },
      ProjectionExpression: 'preferences',
    }).promise();

    return {
      loginAlerts: result.Item?.preferences?.notifications?.loginAlerts ?? true,
    };
  } catch (error) {
    console.error('Failed to get user preferences', error);
    return { loginAlerts: true }; // Default to sending alerts
  }
}

/**
 * Post-Authentication Trigger Handler
 * 
 * Actions performed:
 * - Record login in history
 * - Detect new device/location
 * - Send login notification if new device/location
 * - Update last login timestamp
 * - Log authentication event
 */
export const handler: PostAuthenticationTriggerHandler = async (
  event: PostAuthenticationTriggerEvent,
  context: Context
): Promise<PostAuthenticationTriggerEvent> => {
  console.log('Post-authentication trigger invoked', {
    userPoolId: event.userPoolId,
    userName: event.userName,
    triggerSource: event.triggerSource,
  });

  const { sub, email, name } = event.request.userAttributes;
  const tenantId = event.request.userAttributes['custom:tenant_id'] || '';
  
  // Extract IP and user agent from the request context
  // Note: These may not always be available depending on the auth flow
  const ip = (event as any).request?.clientMetadata?.ip || 
             (event as any).callerContext?.clientId || 
             'unknown';
  const userAgent = (event as any).request?.clientMetadata?.userAgent || 
                    'unknown';

  try {
    // Get recent login history
    const history = await getRecentLoginHistory(sub);

    // Check for new device/location
    const { isNewDevice, isNewLocation } = isNewDeviceOrLocation(ip, userAgent, history);

    // Record this login
    const loginEntry: LoginHistoryEntry = {
      userId: sub,
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      isNewDevice,
      isNewLocation,
    };
    await recordLoginHistory(loginEntry);

    // Log authentication event
    await logAuthenticationEvent(sub, email, tenantId, ip, userAgent, isNewDevice, isNewLocation);

    // Update last login timestamp
    await updateLastLogin(sub);

    // Check user preferences and send notification if needed
    const preferences = await getUserNotificationPreferences(sub);
    if (preferences.loginAlerts && (isNewDevice || isNewLocation)) {
      await sendLoginNotification(email, name || '', ip, userAgent, isNewDevice, isNewLocation);
    }

    console.log('Post-authentication processing complete', {
      userId: sub,
      email,
      isNewDevice,
      isNewLocation,
    });

    return event;

  } catch (error) {
    console.error('Post-authentication processing failed', {
      userId: sub,
      email,
      error: (error as Error).message,
    });
    
    // Don't throw - we don't want to fail the authentication
    return event;
  }
};

export default handler;
