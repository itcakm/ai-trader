'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Dashboard } from '@/types/dashboard';

/**
 * User for sharing
 */
interface ShareableUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

/**
 * Props for DashboardSharePanel component
 */
export interface DashboardSharePanelProps {
  dashboard: Dashboard;
  availableUsers: ShareableUser[];
  onShare: (userIds: string[]) => Promise<void>;
  onUnshare: (userIds: string[]) => Promise<void>;
  onClose: () => void;
  className?: string;
}

/**
 * DashboardSharePanel - Interface for sharing dashboards with other users
 * 
 * Features:
 * - User search and selection
 * - Current share list management
 * - Permission-based sharing
 * - Bulk share/unshare operations
 */
export function DashboardSharePanel({
  dashboard,
  availableUsers,
  onShare,
  onUnshare,
  onClose,
  className = '',
}: DashboardSharePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return availableUsers;
    const query = searchQuery.toLowerCase();
    return availableUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    );
  }, [availableUsers, searchQuery]);

  // Users already shared with
  const sharedUsers = useMemo(() => {
    return availableUsers.filter((user) =>
      dashboard.sharedWith?.includes(user.id)
    );
  }, [availableUsers, dashboard.sharedWith]);

  // Users not yet shared with
  const unsharedUsers = useMemo(() => {
    return filteredUsers.filter(
      (user) => !dashboard.sharedWith?.includes(user.id)
    );
  }, [filteredUsers, dashboard.sharedWith]);

  // Toggle user selection
  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  // Handle share
  const handleShare = async () => {
    if (selectedUsers.length === 0) return;
    setIsLoading(true);
    try {
      await onShare(selectedUsers);
      setSelectedUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle unshare
  const handleUnshare = async (userId: string) => {
    setIsLoading(true);
    try {
      await onUnshare([userId]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={`w-full max-w-md ${className}`}>
      <CardHeader>
        <CardTitle>Share Dashboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dashboard info */}
        <div className="p-3 bg-muted rounded-lg">
          <div className="font-medium">{dashboard.name}</div>
          <div className="text-sm text-muted-foreground">
            {dashboard.isShared
              ? `Shared with ${dashboard.sharedWith?.length || 0} users`
              : 'Not shared'}
          </div>
        </div>

        {/* Current shares */}
        {sharedUsers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Currently shared with</h4>
            <div className="space-y-2">
              {sharedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded"
                >
                  <div>
                    <div className="text-sm font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {user.email}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnshare(user.id)}
                    disabled={isLoading}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search and add users */}
        <div>
          <h4 className="text-sm font-medium mb-2">Add users</h4>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full px-3 py-2 rounded-md border border-border bg-background mb-2"
          />

          {/* User list */}
          <div className="max-h-48 overflow-auto border border-border rounded-md">
            {unsharedUsers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {searchQuery
                  ? 'No users found'
                  : 'All users already have access'}
              </div>
            ) : (
              unsharedUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-3 p-2 hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => toggleUserSelection(user.id)}
                    className="rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {user.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user.email}
                      {user.role && ` • ${user.role}`}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="primary"
          onClick={handleShare}
          disabled={selectedUsers.length === 0 || isLoading}
        >
          {isLoading
            ? 'Sharing...'
            : `Share with ${selectedUsers.length} user${selectedUsers.length !== 1 ? 's' : ''}`}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default DashboardSharePanel;
