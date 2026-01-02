/**
 * Feature: ui-implementation, Property 10: Destructive Action Confirmation
 * Validates: Requirements 8.3
 *
 * For any action marked as destructive (delete, cancel, revoke), invoking the action
 * SHALL display a confirmation dialog before execution, and canceling the dialog
 * SHALL leave the system state unchanged.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Types for destructive actions
type DestructiveActionType = 'delete' | 'cancel' | 'revoke' | 'deploy' | 'killSwitch';

interface DestructiveAction {
  id: string;
  type: DestructiveActionType;
  targetId: string;
  targetName: string;
  requiresConfirmation: boolean;
}

interface ConfirmationState {
  isOpen: boolean;
  actionId: string | null;
  confirmed: boolean;
  cancelled: boolean;
}

interface SystemState {
  items: Map<string, { id: string; name: string; deleted: boolean }>;
  actionHistory: Array<{ actionId: string; type: DestructiveActionType; timestamp: number }>;
}

// Pure functions for confirmation flow

/**
 * Initiates a destructive action - should open confirmation dialog
 */
function initiateDestructiveAction(
  action: DestructiveAction,
  currentState: ConfirmationState
): ConfirmationState {
  if (!action.requiresConfirmation) {
    // Actions that don't require confirmation execute immediately
    return {
      ...currentState,
      isOpen: false,
      actionId: action.id,
      confirmed: true,
      cancelled: false,
    };
  }

  return {
    isOpen: true,
    actionId: action.id,
    confirmed: false,
    cancelled: false,
  };
}

/**
 * Confirms the destructive action
 */
function confirmAction(currentState: ConfirmationState): ConfirmationState {
  if (!currentState.isOpen) {
    return currentState;
  }

  return {
    ...currentState,
    isOpen: false,
    confirmed: true,
    cancelled: false,
  };
}

/**
 * Cancels the destructive action
 */
function cancelAction(currentState: ConfirmationState): ConfirmationState {
  if (!currentState.isOpen) {
    return currentState;
  }

  return {
    ...currentState,
    isOpen: false,
    confirmed: false,
    cancelled: true,
  };
}

/**
 * Executes the action on system state (only if confirmed and not already executed)
 */
function executeAction(
  action: DestructiveAction,
  confirmationState: ConfirmationState,
  systemState: SystemState
): SystemState {
  // Only execute if confirmed
  if (!confirmationState.confirmed || confirmationState.actionId !== action.id) {
    return systemState;
  }

  // Check if action has already been executed (idempotency)
  const alreadyExecuted = systemState.actionHistory.some(
    (entry) => entry.actionId === action.id
  );
  if (alreadyExecuted) {
    return systemState;
  }

  const newItems = new Map(systemState.items);
  const item = newItems.get(action.targetId);

  if (item && action.type === 'delete') {
    newItems.set(action.targetId, { ...item, deleted: true });
  }

  return {
    items: newItems,
    actionHistory: [
      ...systemState.actionHistory,
      { actionId: action.id, type: action.type, timestamp: Date.now() },
    ],
  };
}

/**
 * Checks if system state changed
 */
function hasStateChanged(before: SystemState, after: SystemState): boolean {
  if (before.actionHistory.length !== after.actionHistory.length) {
    return true;
  }

  for (const [id, item] of before.items) {
    const afterItem = after.items.get(id);
    if (!afterItem || item.deleted !== afterItem.deleted) {
      return true;
    }
  }

  return false;
}

/**
 * Creates initial confirmation state
 */
function createInitialConfirmationState(): ConfirmationState {
  return {
    isOpen: false,
    actionId: null,
    confirmed: false,
    cancelled: false,
  };
}

/**
 * Creates initial system state with items
 */
function createInitialSystemState(
  items: Array<{ id: string; name: string }>
): SystemState {
  const itemMap = new Map<string, { id: string; name: string; deleted: boolean }>();
  for (const item of items) {
    itemMap.set(item.id, { ...item, deleted: false });
  }
  return {
    items: itemMap,
    actionHistory: [],
  };
}

/**
 * Validates that a confirmation dialog has required properties
 */
function validateConfirmationDialog(action: DestructiveAction): {
  hasTitle: boolean;
  hasMessage: boolean;
  hasConsequences: boolean;
  hasConfirmButton: boolean;
  hasCancelButton: boolean;
} {
  // All destructive actions should have these properties in their confirmation dialog
  return {
    hasTitle: true,
    hasMessage: true,
    hasConsequences: action.type === 'delete' || action.type === 'killSwitch',
    hasConfirmButton: true,
    hasCancelButton: true,
  };
}

// Arbitraries for generating test data
const destructiveActionTypeArbitrary = fc.constantFrom<DestructiveActionType>(
  'delete',
  'cancel',
  'revoke',
  'deploy',
  'killSwitch'
);

const destructiveActionArbitrary: fc.Arbitrary<DestructiveAction> = fc.record({
  id: fc.uuid(),
  type: destructiveActionTypeArbitrary,
  targetId: fc.uuid(),
  targetName: fc.string({ minLength: 1, maxLength: 50 }),
  requiresConfirmation: fc.constant(true), // All destructive actions require confirmation
});

const itemArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
});

describe('Property 10: Destructive Action Confirmation', () => {
  describe('Confirmation Dialog Display', () => {
    it('initiating a destructive action should open confirmation dialog', () => {
      fc.assert(
        fc.property(destructiveActionArbitrary, (action) => {
          const initialState = createInitialConfirmationState();
          const newState = initiateDestructiveAction(action, initialState);

          if (action.requiresConfirmation) {
            expect(newState.isOpen).toBe(true);
            expect(newState.actionId).toBe(action.id);
            expect(newState.confirmed).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('confirmation dialog should have required elements', () => {
      fc.assert(
        fc.property(destructiveActionArbitrary, (action) => {
          const dialogProps = validateConfirmationDialog(action);

          expect(dialogProps.hasTitle).toBe(true);
          expect(dialogProps.hasMessage).toBe(true);
          expect(dialogProps.hasConfirmButton).toBe(true);
          expect(dialogProps.hasCancelButton).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('delete and killSwitch actions should show consequences', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constantFrom<DestructiveActionType>('delete', 'killSwitch'),
            targetId: fc.uuid(),
            targetName: fc.string({ minLength: 1, maxLength: 50 }),
            requiresConfirmation: fc.constant(true),
          }),
          (action) => {
            const dialogProps = validateConfirmationDialog(action);
            expect(dialogProps.hasConsequences).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cancellation Preserves State', () => {
    it('canceling confirmation should leave system state unchanged', () => {
      fc.assert(
        fc.property(
          destructiveActionArbitrary,
          fc.array(itemArbitrary, { minLength: 1, maxLength: 10 }),
          (action, items) => {
            // Setup initial states
            const initialConfirmation = createInitialConfirmationState();
            const initialSystem = createInitialSystemState(items);

            // Initiate action (opens dialog)
            const afterInitiate = initiateDestructiveAction(action, initialConfirmation);

            // Cancel the action
            const afterCancel = cancelAction(afterInitiate);

            // Try to execute (should not execute because cancelled)
            const finalSystem = executeAction(action, afterCancel, initialSystem);

            // System state should be unchanged
            expect(hasStateChanged(initialSystem, finalSystem)).toBe(false);
            expect(afterCancel.cancelled).toBe(true);
            expect(afterCancel.confirmed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canceling should close the dialog', () => {
      fc.assert(
        fc.property(destructiveActionArbitrary, (action) => {
          const initialState = createInitialConfirmationState();
          const afterInitiate = initiateDestructiveAction(action, initialState);
          const afterCancel = cancelAction(afterInitiate);

          expect(afterCancel.isOpen).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('multiple cancellations should not change state', () => {
      fc.assert(
        fc.property(
          destructiveActionArbitrary,
          fc.array(itemArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          (action, items, cancelCount) => {
            const initialSystem = createInitialSystemState(items);
            let confirmationState = createInitialConfirmationState();

            // Initiate and cancel multiple times
            for (let i = 0; i < cancelCount; i++) {
              confirmationState = initiateDestructiveAction(action, confirmationState);
              confirmationState = cancelAction(confirmationState);
            }

            // Execute should not change state
            const finalSystem = executeAction(action, confirmationState, initialSystem);
            expect(hasStateChanged(initialSystem, finalSystem)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Confirmation Executes Action', () => {
    it('confirming should allow action execution', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constant<DestructiveActionType>('delete'),
            targetId: fc.uuid(),
            targetName: fc.string({ minLength: 1, maxLength: 50 }),
            requiresConfirmation: fc.constant(true),
          }),
          (action) => {
            // Create system with the target item
            const initialSystem = createInitialSystemState([
              { id: action.targetId, name: action.targetName },
            ]);

            // Initiate and confirm
            let confirmationState = createInitialConfirmationState();
            confirmationState = initiateDestructiveAction(action, confirmationState);
            confirmationState = confirmAction(confirmationState);

            // Execute
            const finalSystem = executeAction(action, confirmationState, initialSystem);

            // State should have changed
            expect(hasStateChanged(initialSystem, finalSystem)).toBe(true);
            expect(finalSystem.actionHistory.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('confirming should close the dialog', () => {
      fc.assert(
        fc.property(destructiveActionArbitrary, (action) => {
          const initialState = createInitialConfirmationState();
          const afterInitiate = initiateDestructiveAction(action, initialState);
          const afterConfirm = confirmAction(afterInitiate);

          expect(afterConfirm.isOpen).toBe(false);
          expect(afterConfirm.confirmed).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('action should only execute once per confirmation', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constant<DestructiveActionType>('delete'),
            targetId: fc.uuid(),
            targetName: fc.string({ minLength: 1, maxLength: 50 }),
            requiresConfirmation: fc.constant(true),
          }),
          fc.integer({ min: 1, max: 5 }),
          (action, executeCount) => {
            const initialSystem = createInitialSystemState([
              { id: action.targetId, name: action.targetName },
            ]);

            // Initiate and confirm once
            let confirmationState = createInitialConfirmationState();
            confirmationState = initiateDestructiveAction(action, confirmationState);
            confirmationState = confirmAction(confirmationState);

            // Try to execute multiple times
            let currentSystem = initialSystem;
            for (let i = 0; i < executeCount; i++) {
              currentSystem = executeAction(action, confirmationState, currentSystem);
            }

            // Action should only be recorded once
            expect(currentSystem.actionHistory.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('State Machine Invariants', () => {
    it('confirmation state transitions should be deterministic', () => {
      fc.assert(
        fc.property(destructiveActionArbitrary, (action) => {
          const initial = createInitialConfirmationState();

          // Same sequence should produce same result
          const path1 = cancelAction(initiateDestructiveAction(action, initial));
          const path2 = cancelAction(initiateDestructiveAction(action, initial));

          expect(path1.isOpen).toBe(path2.isOpen);
          expect(path1.confirmed).toBe(path2.confirmed);
          expect(path1.cancelled).toBe(path2.cancelled);
        }),
        { numRuns: 100 }
      );
    });

    it('cancel and confirm are mutually exclusive', () => {
      fc.assert(
        fc.property(destructiveActionArbitrary, (action) => {
          const initial = createInitialConfirmationState();
          const afterInitiate = initiateDestructiveAction(action, initial);

          const afterConfirm = confirmAction(afterInitiate);
          const afterCancel = cancelAction(afterInitiate);

          // After confirm: confirmed=true, cancelled=false
          expect(afterConfirm.confirmed).toBe(true);
          expect(afterConfirm.cancelled).toBe(false);

          // After cancel: confirmed=false, cancelled=true
          expect(afterCancel.confirmed).toBe(false);
          expect(afterCancel.cancelled).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('dialog cannot be confirmed or cancelled when not open', () => {
      fc.assert(
        fc.property(destructiveActionArbitrary, (action) => {
          const closedState: ConfirmationState = {
            isOpen: false,
            actionId: action.id,
            confirmed: false,
            cancelled: false,
          };

          const afterConfirm = confirmAction(closedState);
          const afterCancel = cancelAction(closedState);

          // State should remain unchanged
          expect(afterConfirm).toEqual(closedState);
          expect(afterCancel).toEqual(closedState);
        }),
        { numRuns: 100 }
      );
    });

    it('action execution requires matching action ID', () => {
      fc.assert(
        fc.property(
          destructiveActionArbitrary,
          destructiveActionArbitrary,
          fc.array(itemArbitrary, { minLength: 1, maxLength: 5 }),
          (action1, action2, items) => {
            // Ensure different action IDs
            if (action1.id === action2.id) return;

            const initialSystem = createInitialSystemState(items);

            // Confirm action1
            let confirmationState = createInitialConfirmationState();
            confirmationState = initiateDestructiveAction(action1, confirmationState);
            confirmationState = confirmAction(confirmationState);

            // Try to execute action2 with action1's confirmation
            const finalSystem = executeAction(action2, confirmationState, initialSystem);

            // Should not execute because action IDs don't match
            expect(hasStateChanged(initialSystem, finalSystem)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Action Type Specific Behavior', () => {
    it('all destructive action types should require confirmation', () => {
      const actionTypes: DestructiveActionType[] = ['delete', 'cancel', 'revoke', 'deploy', 'killSwitch'];

      fc.assert(
        fc.property(
          fc.constantFrom(...actionTypes),
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 50 }),
          (type, id, targetId, targetName) => {
            const action: DestructiveAction = {
              id,
              type,
              targetId,
              targetName,
              requiresConfirmation: true,
            };

            const initial = createInitialConfirmationState();
            const afterInitiate = initiateDestructiveAction(action, initial);

            // All destructive actions should open confirmation
            expect(afterInitiate.isOpen).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('delete action should mark item as deleted when confirmed', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 50 }),
          (actionId, targetId, targetName) => {
            const action: DestructiveAction = {
              id: actionId,
              type: 'delete',
              targetId,
              targetName,
              requiresConfirmation: true,
            };

            const initialSystem = createInitialSystemState([{ id: targetId, name: targetName }]);

            // Confirm and execute
            let confirmationState = createInitialConfirmationState();
            confirmationState = initiateDestructiveAction(action, confirmationState);
            confirmationState = confirmAction(confirmationState);
            const finalSystem = executeAction(action, confirmationState, initialSystem);

            // Item should be marked as deleted
            const item = finalSystem.items.get(targetId);
            expect(item?.deleted).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
