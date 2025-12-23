/**
 * UUID generation utility
 * 
 * Provides a simple UUID v4 generator that works with Jest without ESM issues.
 */

/**
 * Generate a UUID v4 string
 * 
 * @returns A random UUID v4 string
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
