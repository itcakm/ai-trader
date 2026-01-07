'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { MFAChallenge } from '@/components/auth/MFAChallenge';

/**
 * MFA Challenge Page
 * Displayed when MFA is required during login
 */

function MFAChallengeContent() {
  const router = useRouter();
  const { status } = useAuth();

  // Redirect if not in MFA required state
  useEffect(() => {
    if (status === 'unauthenticated' || status === 'idle') {
      router.push('/login');
    } else if (status === 'authenticated') {
      router.push('/');
    }
  }, [status, router]);

  // Show loading while checking status
  if (status !== 'mfa_required') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <MFAChallenge
      onSuccess={() => router.push('/')}
      onCancel={() => router.push('/login')}
    />
  );
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function MFAChallengePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MFAChallengeContent />
    </Suspense>
  );
}
