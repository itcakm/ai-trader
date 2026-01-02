'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { useOrganization } from '@/providers/OrganizationProvider';
import type { MemberActivity } from '@/types/organization';

export function OrganizationSettings() {
  const {
    organization,
    updateOrganization,
    updateOrganizationSettings,
    getMemberActivity,
    isLoading,
    error,
  } = useOrganization();

  const [name, setName] = useState(organization?.name || '');
  const [settings, setSettings] = useState(organization?.settings || {
    allowMemberInvites: true,
    requireMFA: false,
    ssoEnabled: false,
    defaultRoleId: 'viewer',
    sessionTimeoutMinutes: 60,
  });
  const [activities, setActivities] = useState<MemberActivity[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setSettings(organization.settings);
      getMemberActivity().then(setActivities);
    }
  }, [organization, getMemberActivity]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);
    await updateOrganization({ name });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSaveSettings = async () => {
    setSaveSuccess(false);
    await updateOrganizationSettings(settings);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  if (!organization) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="py-8 text-center text-muted-foreground">
          No organization found. Please upgrade your account first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
          {error}
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-md">
          Settings saved successfully!
        </div>
      )}

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <form onSubmit={handleSaveGeneral}>
          <CardContent className="space-y-4">
            <Input
              label="Organization Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" loading={isLoading}>
              Save Changes
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-foreground">Allow Member Invites</p>
              <p className="text-sm text-muted-foreground">
                Allow admins to invite new members
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.allowMemberInvites}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    allowMemberInvites: e.target.checked,
                  }))
                }
                className="sr-only peer"
                disabled={isLoading}
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-foreground">Require MFA</p>
              <p className="text-sm text-muted-foreground">
                Require all members to enable two-factor authentication
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.requireMFA}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    requireMFA: e.target.checked,
                  }))
                }
                className="sr-only peer"
                disabled={isLoading}
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-foreground">SSO Enabled</p>
              <p className="text-sm text-muted-foreground">
                Enable single sign-on for your organization
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.ssoEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    ssoEnabled: e.target.checked,
                  }))
                }
                className="sr-only peer"
                disabled={isLoading}
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          <div className="py-2">
            <label className="block text-sm font-medium text-foreground mb-1">
              Session Timeout (minutes)
            </label>
            <Input
              type="number"
              value={settings.sessionTimeoutMinutes}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  sessionTimeoutMinutes: parseInt(e.target.value) || 60,
                }))
              }
              min={5}
              max={480}
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveSettings} loading={isLoading}>
            Save Security Settings
          </Button>
        </CardFooter>
      </Card>

      {/* Usage & Billing */}
      <Card>
        <CardHeader>
          <CardTitle>Usage & Billing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Total Members</p>
              <p className="text-2xl font-bold text-foreground">
                {organization.usage.totalMembers}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Active Members</p>
              <p className="text-2xl font-bold text-foreground">
                {organization.usage.activeMembers}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Strategies</p>
              <p className="text-2xl font-bold text-foreground">
                {organization.usage.strategiesCount}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Orders This Month</p>
              <p className="text-2xl font-bold text-foreground">
                {organization.usage.ordersThisMonth}
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 border border-border rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-foreground">
                  Current Plan: {organization.billing.plan.charAt(0).toUpperCase() + organization.billing.plan.slice(1)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Billing email: {organization.billing.billingEmail}
                </p>
              </div>
              <Button variant="outline">Manage Billing</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Member Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No recent activity
            </p>
          ) : (
            <div className="space-y-3">
              {activities.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {activity.userName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {activity.action} - {activity.module}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {activity.timestamp.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
