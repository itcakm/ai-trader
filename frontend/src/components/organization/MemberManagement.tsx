'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useOrganization } from '@/providers/OrganizationProvider';
import { MemberInviteForm } from './MemberInviteForm';
import type { OrganizationMember } from '@/types/organization';

interface MemberRowProps {
  member: OrganizationMember;
  isOwner: boolean;
  onRemove: (userId: string) => void;
  onResendInvite: (userId: string) => void;
  isLoading: boolean;
}

function MemberRow({ member, isOwner, onRemove, onResendInvite, isLoading }: MemberRowProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRemove = () => {
    onRemove(member.userId);
    setShowConfirm(false);
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    removed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <span className="text-primary-600 font-medium">
            {member.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{member.name}</p>
            {isOwner && (
              <Badge variant="info" className="text-xs">Owner</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          {member.roles.map((role) => (
            <Badge key={role.id} variant="default" className="text-xs">
              {role.name}
            </Badge>
          ))}
          {member.roles.length === 0 && (
            <span className="text-sm text-muted-foreground">No roles</span>
          )}
        </div>

        <span className={`px-2 py-1 text-xs rounded-full ${statusColors[member.status]}`}>
          {member.status}
        </span>

        {!isOwner && member.status !== 'removed' && (
          <div className="flex gap-2">
            {member.status === 'pending' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onResendInvite(member.userId)}
                disabled={isLoading}
              >
                Resend
              </Button>
            )}

            {showConfirm ? (
              <div className="flex gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemove}
                  disabled={isLoading}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowConfirm(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirm(true)}
                disabled={isLoading}
              >
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MemberManagement() {
  const {
    organization,
    removeMember,
    resendInvitation,
    isLoading,
    error,
  } = useOrganization();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending'>('all');

  if (!organization) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="py-8 text-center text-muted-foreground">
          No organization found. Please upgrade your account first.
        </CardContent>
      </Card>
    );
  }

  const filteredMembers = organization.members.filter((member) => {
    if (filter === 'all') return member.status !== 'removed';
    return member.status === filter;
  });

  const handleRemove = async (userId: string) => {
    try {
      await removeMember(userId);
    } catch {
      // Error handled by provider
    }
  };

  const handleResendInvite = async (userId: string) => {
    try {
      await resendInvitation(userId);
    } catch {
      // Error handled by provider
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Team Members</CardTitle>
          <Button onClick={() => setShowInviteForm(true)}>
            Invite Member
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {(['all', 'active', 'pending'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  filter === f
                    ? 'bg-primary-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {filteredMembers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No members found
            </p>
          ) : (
            <div>
              {filteredMembers.map((member) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  isOwner={member.userId === organization.ownerId}
                  onRemove={handleRemove}
                  onResendInvite={handleResendInvite}
                  isLoading={isLoading}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Form Modal */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <MemberInviteForm
            onSuccess={() => setShowInviteForm(false)}
            onCancel={() => setShowInviteForm(false)}
          />
        </div>
      )}
    </div>
  );
}
