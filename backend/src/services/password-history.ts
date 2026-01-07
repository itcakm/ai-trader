/**
 * Password History Service
 * 
 * Stores and validates password history to prevent password reuse.
 * Passwords are stored as hashes using bcrypt for security.
 * 
 * Requirements: 12.8
 */

import * as crypto from 'crypto';
import { documentClient } from '../db/client';
import { generateUUID } from '../utils/uuid';

/**
 * Configuration for password history
 */
export interface PasswordHistoryConfig {
  tableName: string;
  maxHistoryCount: number;
  retentionDays: number;
}

const DEFAULT_CONFIG: PasswordHistoryConfig = {
  tableName: process.env.DYNAMODB_TABLE_PASSWORD_HISTORY || 'password-history',
  maxHistoryCount: 5, // Cannot reuse last 5 passwords
  retentionDays: 365, // Keep history for 1 year
};

/**
 * Password history entry stored in DynamoDB
 */
interface PasswordHistoryEntry {
  userId: string;
  timestamp: string;
  passwordHash: string;
  salt: string;
  ttl: number;
}

/**
 * Hash a password using PBKDF2 with a random salt
 * Note: We use PBKDF2 instead of bcrypt for Lambda compatibility
 */
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const passwordSalt = salt || crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(
    password,
    passwordSalt,
    100000, // iterations
    64, // key length
    'sha512'
  ).toString('hex');
  
  return { hash, salt: passwordSalt };
}

/**
 * Verify a password against a stored hash
 */
function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}

/**
 * Password History Service
 */
export const PasswordHistoryService = {
  config: { ...DEFAULT_CONFIG } as PasswordHistoryConfig,

  /**
   * Configure the service
   */
  configure(config: Partial<PasswordHistoryConfig>): void {
    this.config = { ...this.config, ...config };
  },

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  },

  /**
   * Calculate TTL for DynamoDB
   */
  calculateTTL(): number {
    return Math.floor(Date.now() / 1000) + (this.config.retentionDays * 24 * 60 * 60);
  },

  /**
   * Get password history for a user
   */
  async getPasswordHistory(userId: string): Promise<PasswordHistoryEntry[]> {
    try {
      const result = await documentClient.query({
        TableName: this.config.tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // Most recent first
        Limit: this.config.maxHistoryCount,
      }).promise();

      return (result.Items || []) as PasswordHistoryEntry[];
    } catch (error) {
      console.error('Failed to get password history', { userId, error });
      return [];
    }
  },

  /**
   * Check if a password has been used before
   * Returns true if the password is in the history (should be rejected)
   * 
   * Requirements: 12.8 - Cannot reuse last 5 passwords
   */
  async isPasswordInHistory(userId: string, password: string): Promise<boolean> {
    const history = await this.getPasswordHistory(userId);

    for (const entry of history) {
      if (verifyPassword(password, entry.passwordHash, entry.salt)) {
        console.log('Password found in history', { userId, historyCount: history.length });
        return true;
      }
    }

    return false;
  },

  /**
   * Add a password to the history
   * Called after a successful password change
   */
  async addPasswordToHistory(userId: string, password: string): Promise<void> {
    const { hash, salt } = hashPassword(password);
    const now = new Date();

    const entry: PasswordHistoryEntry = {
      userId,
      timestamp: now.toISOString(),
      passwordHash: hash,
      salt,
      ttl: this.calculateTTL(),
    };

    try {
      await documentClient.put({
        TableName: this.config.tableName,
        Item: entry,
      }).promise();

      console.log('Password added to history', { userId });

      // Clean up old entries beyond the max count
      await this.cleanupOldEntries(userId);
    } catch (error) {
      console.error('Failed to add password to history', { userId, error });
      // Don't throw - password change should still succeed
    }
  },

  /**
   * Clean up old password history entries beyond the max count
   */
  async cleanupOldEntries(userId: string): Promise<void> {
    try {
      const result = await documentClient.query({
        TableName: this.config.tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // Most recent first
      }).promise();

      const entries = (result.Items || []) as PasswordHistoryEntry[];

      // Delete entries beyond the max count
      if (entries.length > this.config.maxHistoryCount) {
        const entriesToDelete = entries.slice(this.config.maxHistoryCount);

        for (const entry of entriesToDelete) {
          await documentClient.delete({
            TableName: this.config.tableName,
            Key: {
              userId: entry.userId,
              timestamp: entry.timestamp,
            },
          }).promise();
        }

        console.log('Cleaned up old password history entries', {
          userId,
          deletedCount: entriesToDelete.length,
        });
      }
    } catch (error) {
      console.error('Failed to cleanup old password history entries', { userId, error });
    }
  },

  /**
   * Delete all password history for a user
   * Called when a user is deleted
   */
  async deleteUserHistory(userId: string): Promise<void> {
    try {
      const result = await documentClient.query({
        TableName: this.config.tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      }).promise();

      const entries = (result.Items || []) as PasswordHistoryEntry[];

      for (const entry of entries) {
        await documentClient.delete({
          TableName: this.config.tableName,
          Key: {
            userId: entry.userId,
            timestamp: entry.timestamp,
          },
        }).promise();
      }

      console.log('Deleted all password history for user', { userId, deletedCount: entries.length });
    } catch (error) {
      console.error('Failed to delete user password history', { userId, error });
    }
  },

  /**
   * Validate a new password against history
   * Returns an error message if validation fails, null if valid
   */
  async validateNewPassword(userId: string, newPassword: string): Promise<string | null> {
    const isInHistory = await this.isPasswordInHistory(userId, newPassword);

    if (isInHistory) {
      return `Cannot reuse any of your last ${this.config.maxHistoryCount} passwords`;
    }

    return null;
  },
};

export default PasswordHistoryService;
