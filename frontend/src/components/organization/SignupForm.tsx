'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { useOrganization } from '@/providers/OrganizationProvider';
import type { SignupInput } from '@/types/organization';

interface SignupFormProps {
  onSuccess?: (userId: string) => void;
  onLoginClick?: () => void;
}

export function SignupForm({ onSuccess, onLoginClick }: SignupFormProps) {
  const { signup, isLoading, error } = useOrganization();
  const [formData, setFormData] = useState<SignupInput>({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    acceptTerms: false,
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof SignupInput, string>>>({});

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof SignupInput, string>> = {};

    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }

    if (!formData.name) {
      errors.name = 'Name is required';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.acceptTerms) {
      errors.acceptTerms = 'You must accept the terms and conditions';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    const result = await signup(formData);
    if (result.success && result.userId) {
      onSuccess?.(result.userId);
    }
  };

  const handleChange = (field: keyof SignupInput) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
              {error}
            </div>
          )}

          <Input
            label="Full Name"
            type="text"
            value={formData.name}
            onChange={handleChange('name')}
            error={formErrors.name}
            placeholder="Enter your full name"
            autoComplete="name"
            disabled={isLoading}
          />

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            error={formErrors.email}
            placeholder="Enter your email"
            autoComplete="email"
            disabled={isLoading}
          />

          <Input
            label="Password"
            type="password"
            value={formData.password}
            onChange={handleChange('password')}
            error={formErrors.password}
            placeholder="Create a password"
            autoComplete="new-password"
            helperText="Must be at least 8 characters"
            disabled={isLoading}
          />

          <Input
            label="Confirm Password"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange('confirmPassword')}
            error={formErrors.confirmPassword}
            placeholder="Confirm your password"
            autoComplete="new-password"
            disabled={isLoading}
          />

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="acceptTerms"
              checked={formData.acceptTerms}
              onChange={handleChange('acceptTerms')}
              className="mt-1 h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
              disabled={isLoading}
            />
            <label htmlFor="acceptTerms" className="text-sm text-muted-foreground">
              I agree to the{' '}
              <a href="/terms" className="text-primary-600 hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-primary-600 hover:underline">
                Privacy Policy
              </a>
            </label>
          </div>
          {formErrors.acceptTerms && (
            <p className="text-sm text-red-500">{formErrors.acceptTerms}</p>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" loading={isLoading}>
            Create Account
          </Button>

          {onLoginClick && (
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onLoginClick}
                className="text-primary-600 hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
