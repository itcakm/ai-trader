'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { useOrganization } from '@/providers/OrganizationProvider';
import type { OrganizationUpgradeInput, BillingInfo } from '@/types/organization';

type WizardStep = 'plan' | 'details' | 'confirm';

interface PlanOption {
  id: BillingInfo['plan'];
  name: string;
  price: string;
  features: string[];
  recommended?: boolean;
}

const PLANS: PlanOption[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$29/month',
    features: ['Up to 5 team members', 'Basic analytics', 'Email support'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$99/month',
    features: [
      'Up to 25 team members',
      'Advanced analytics',
      'Priority support',
      'Custom roles',
    ],
    recommended: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    features: [
      'Unlimited team members',
      'Full analytics suite',
      'Dedicated support',
      'SSO integration',
      'Custom contracts',
    ],
  },
];

interface OrganizationUpgradeWizardProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function OrganizationUpgradeWizard({
  onSuccess,
  onCancel,
}: OrganizationUpgradeWizardProps) {
  const { account, upgradeToOrganization, isLoading, error } = useOrganization();
  const [step, setStep] = useState<WizardStep>('plan');
  const [formData, setFormData] = useState<OrganizationUpgradeInput>({
    organizationName: '',
    billingEmail: account?.email || '',
    plan: 'professional',
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof OrganizationUpgradeInput, string>>>({});

  const validateDetails = (): boolean => {
    const errors: Partial<Record<keyof OrganizationUpgradeInput, string>> = {};

    if (!formData.organizationName.trim()) {
      errors.organizationName = 'Organization name is required';
    }

    if (!formData.billingEmail) {
      errors.billingEmail = 'Billing email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.billingEmail)) {
      errors.billingEmail = 'Invalid email format';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePlanSelect = (planId: BillingInfo['plan']) => {
    setFormData((prev) => ({ ...prev, plan: planId }));
    setStep('details');
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateDetails()) {
      setStep('confirm');
    }
  };

  const handleConfirm = async () => {
    try {
      await upgradeToOrganization(formData);
      onSuccess?.();
    } catch {
      // Error is handled by the provider
    }
  };

  const selectedPlan = PLANS.find((p) => p.id === formData.plan);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>
          {step === 'plan' && 'Choose Your Plan'}
          {step === 'details' && 'Organization Details'}
          {step === 'confirm' && 'Confirm Upgrade'}
        </CardTitle>
        <div className="flex gap-2 mt-4">
          {(['plan', 'details', 'confirm'] as WizardStep[]).map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                i <= ['plan', 'details', 'confirm'].indexOf(step)
                  ? 'bg-primary-600'
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="p-3 mb-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
            {error}
          </div>
        )}

        {step === 'plan' && (
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => handlePlanSelect(plan.id)}
                className={`p-4 text-left border rounded-lg transition-colors ${
                  formData.plan === plan.id
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-border hover:border-primary-400'
                } ${plan.recommended ? 'ring-2 ring-primary-600' : ''}`}
              >
                {plan.recommended && (
                  <span className="inline-block px-2 py-1 mb-2 text-xs font-medium text-primary-600 bg-primary-100 dark:bg-primary-900/40 rounded">
                    Recommended
                  </span>
                )}
                <h3 className="font-semibold text-foreground">{plan.name}</h3>
                <p className="text-lg font-bold text-primary-600 mt-1">
                  {plan.price}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-green-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}

        {step === 'details' && (
          <form onSubmit={handleDetailsSubmit} className="space-y-4">
            <Input
              label="Organization Name"
              type="text"
              value={formData.organizationName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  organizationName: e.target.value,
                }))
              }
              error={formErrors.organizationName}
              placeholder="Enter your organization name"
              disabled={isLoading}
            />

            <Input
              label="Billing Email"
              type="email"
              value={formData.billingEmail}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  billingEmail: e.target.value,
                }))
              }
              error={formErrors.billingEmail}
              placeholder="billing@company.com"
              helperText="Invoices will be sent to this email"
              disabled={isLoading}
            />

            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium text-foreground">Data Preservation</h4>
              <p className="text-sm text-muted-foreground mt-1">
                All your existing data, strategies, and configurations will be
                preserved during the upgrade. You&apos;ll become the owner of the new
                organization.
              </p>
            </div>
          </form>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{selectedPlan?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium">{selectedPlan?.price}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Organization</span>
                <span className="font-medium">{formData.organizationName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billing Email</span>
                <span className="font-medium">{formData.billingEmail}</span>
              </div>
            </div>

            <div className="p-4 border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 rounded-lg">
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                Important
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                By upgrading, you agree to our organization terms of service.
                Your existing data will be migrated to the new organization
                account.
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (step === 'plan') {
              onCancel?.();
            } else if (step === 'details') {
              setStep('plan');
            } else {
              setStep('details');
            }
          }}
          disabled={isLoading}
        >
          {step === 'plan' ? 'Cancel' : 'Back'}
        </Button>

        {step === 'details' && (
          <Button onClick={handleDetailsSubmit} disabled={isLoading}>
            Continue
          </Button>
        )}

        {step === 'confirm' && (
          <Button onClick={handleConfirm} loading={isLoading}>
            Confirm Upgrade
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
