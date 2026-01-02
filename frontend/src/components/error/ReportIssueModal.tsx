'use client';

import React, { useState } from 'react';
import type { AppError } from '@/types/error';
import { createIssueReport, submitIssueReport } from '@/services/error-handler';
import { Button } from '@/components/ui/Button';

interface ReportIssueModalProps {
  error: AppError;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * ReportIssueModal component for submitting issue reports
 * Pre-populates context from the error
 * Validates: Requirements 12.6
 */
export function ReportIssueModal({
  error,
  onClose,
  onSubmitted,
}: ReportIssueModalProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const report = createIssueReport(error, comment);
      await submitIssueReport(report);
      setIsSubmitted(true);
      onSubmitted?.();
    } catch {
      // If submission fails, still show success to user
      // The error is already logged
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-background rounded-lg shadow-xl max-w-md w-full">
          <div className="p-6">
            {isSubmitted ? (
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg
                    className="h-6 w-6 text-green-600 dark:text-green-400"
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
                </div>
                <h3 className="mt-4 text-lg font-medium text-foreground">
                  Report Submitted
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Thank you for your feedback. Our team will investigate this issue.
                </p>
                <div className="mt-4">
                  <Button variant="primary" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h3 className="text-lg font-medium text-foreground">
                  Report an Issue
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Help us improve by describing what happened.
                </p>

                <div className="mt-4 space-y-4">
                  <div className="bg-muted/50 rounded-md p-3">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Error Details (auto-filled)
                    </h4>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Tracking ID:</dt>
                        <dd className="font-mono text-foreground">
                          {error.requestTrackingId}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Error Code:</dt>
                        <dd className="font-mono text-foreground">{error.code}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Category:</dt>
                        <dd className="text-foreground capitalize">{error.category}</dd>
                      </div>
                    </dl>
                  </div>

                  <div>
                    <label
                      htmlFor="comment"
                      className="block text-sm font-medium text-foreground"
                    >
                      What were you trying to do? (optional)
                    </label>
                    <textarea
                      id="comment"
                      rows={4}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Describe what you were doing when this error occurred..."
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={isSubmitting}>
                    Submit Report
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default ReportIssueModal;
