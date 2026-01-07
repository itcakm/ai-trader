'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

/**
 * 403 Forbidden Page
 * Requirements: 10.5
 * - Show user-friendly message
 * - Provide navigation options
 */
export default function ForbiddenPage() {
  const router = useRouter();

  return (
    <div 
      className="min-h-screen bg-background flex items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="forbidden-title"
    >
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          {/* Forbidden Icon */}
          <div className="mx-auto mb-4">
            <svg
              className="h-20 w-20 text-red-500 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <CardTitle as="h1" id="forbidden-title" className="text-2xl">
            Access Denied
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please contact your administrator
            or try logging in with a different account.
          </p>

          {/* Error Code Display */}
          <div 
            className="inline-block px-4 py-2 bg-muted rounded-md"
            aria-label="Error code"
          >
            <span className="text-sm font-mono text-muted-foreground">
              Error 403 - Forbidden
            </span>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {/* Navigation Options */}
          <Button
            variant="primary"
            className="w-full"
            onClick={() => router.push('/dashboard')}
          >
            Go to Dashboard
          </Button>
          
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.back()}
          >
            Go Back
          </Button>

          <div className="text-sm text-muted-foreground pt-2">
            <Link 
              href="/login" 
              className="text-primary-600 hover:text-primary-700 hover:underline"
            >
              Sign in with a different account
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
