'use client';

import { useState, useCallback } from 'react';
import type { ConfirmationVariant } from './ConfirmationDialog';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmationVariant;
  consequences?: string[];
}

export interface UseConfirmationReturn {
  isOpen: boolean;
  options: ConfirmationOptions | null;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

export function useConfirmation(): UseConfirmationReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((confirmOptions: ConfirmationOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(confirmOptions);
      setIsOpen(true);
      setResolvePromise(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolvePromise?.(true);
    setResolvePromise(null);
    setOptions(null);
  }, [resolvePromise]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolvePromise?.(false);
    setResolvePromise(null);
    setOptions(null);
  }, [resolvePromise]);

  return {
    isOpen,
    options,
    confirm,
    handleConfirm,
    handleCancel,
  };
}

/**
 * Helper function to create common confirmation dialogs
 */
export const confirmationPresets = {
  delete: (itemName: string): ConfirmationOptions => ({
    title: `Delete ${itemName}?`,
    message: `Are you sure you want to delete this ${itemName.toLowerCase()}? This action cannot be undone.`,
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    variant: 'danger',
    consequences: [
      `The ${itemName.toLowerCase()} will be permanently removed`,
      'All associated data will be deleted',
      'This action cannot be undone',
    ],
  }),

  cancel: (actionName: string): ConfirmationOptions => ({
    title: `Cancel ${actionName}?`,
    message: `Are you sure you want to cancel this ${actionName.toLowerCase()}?`,
    confirmLabel: 'Yes, Cancel',
    cancelLabel: 'No, Continue',
    variant: 'warning',
    consequences: [
      `The ${actionName.toLowerCase()} will be stopped`,
      'Any unsaved changes may be lost',
    ],
  }),

  revoke: (itemName: string): ConfirmationOptions => ({
    title: `Revoke ${itemName}?`,
    message: `Are you sure you want to revoke this ${itemName.toLowerCase()}?`,
    confirmLabel: 'Revoke',
    cancelLabel: 'Cancel',
    variant: 'danger',
    consequences: [
      `Access will be immediately revoked`,
      'The user will no longer be able to access this resource',
    ],
  }),

  deploy: (strategyName: string): ConfirmationOptions => ({
    title: `Deploy ${strategyName}?`,
    message: `Are you sure you want to deploy this strategy to production?`,
    confirmLabel: 'Deploy',
    cancelLabel: 'Cancel',
    variant: 'warning',
    consequences: [
      'The strategy will start executing trades',
      'Real funds may be at risk',
      'Monitor the strategy closely after deployment',
    ],
  }),

  killSwitch: (): ConfirmationOptions => ({
    title: 'Activate Kill Switch?',
    message: 'This will immediately halt all trading activity across all strategies.',
    confirmLabel: 'Activate Kill Switch',
    cancelLabel: 'Cancel',
    variant: 'danger',
    consequences: [
      'All active orders will be cancelled',
      'All strategies will be paused',
      'Manual intervention will be required to resume trading',
    ],
  }),
};
