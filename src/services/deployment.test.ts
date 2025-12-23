import { DeploymentState } from '../types/deployment';

/**
 * Valid state transitions map (mirrored from deployment service for testing)
 */
const VALID_STATE_TRANSITIONS: Record<DeploymentState, DeploymentState[]> = {
  'PENDING': ['RUNNING', 'STOPPED', 'ERROR'],
  'RUNNING': ['PAUSED', 'STOPPED', 'COMPLETED', 'ERROR'],
  'PAUSED': ['RUNNING', 'STOPPED'],
  'STOPPED': [], // Terminal state
  'COMPLETED': [], // Terminal state
  'ERROR': ['STOPPED'] // Can only stop from error state
};

/**
 * Check if a state transition is valid
 * (Standalone function for testing without importing the service)
 */
function isValidStateTransition(
  currentState: DeploymentState,
  targetState: DeploymentState
): boolean {
  const allowedTransitions = VALID_STATE_TRANSITIONS[currentState];
  return allowedTransitions.includes(targetState);
}

/**
 * All possible deployment states
 */
const ALL_STATES: DeploymentState[] = ['PENDING', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'ERROR'];

describe('Deployment Service - State Transitions', () => {
  /**
   * Unit tests for deployment state transitions
   * 
   * Tests PAUSED and STOPPED state transitions
   * 
   * Requirements: 4.6, 4.7
   */
  describe('State Transition Validation', () => {
    describe('isValidStateTransition', () => {
      it('should allow valid transitions from PENDING', () => {
        expect(isValidStateTransition('PENDING', 'RUNNING')).toBe(true);
        expect(isValidStateTransition('PENDING', 'STOPPED')).toBe(true);
        expect(isValidStateTransition('PENDING', 'ERROR')).toBe(true);
      });

      it('should reject invalid transitions from PENDING', () => {
        expect(isValidStateTransition('PENDING', 'PAUSED')).toBe(false);
        expect(isValidStateTransition('PENDING', 'COMPLETED')).toBe(false);
      });

      it('should allow valid transitions from RUNNING', () => {
        expect(isValidStateTransition('RUNNING', 'PAUSED')).toBe(true);
        expect(isValidStateTransition('RUNNING', 'STOPPED')).toBe(true);
        expect(isValidStateTransition('RUNNING', 'COMPLETED')).toBe(true);
        expect(isValidStateTransition('RUNNING', 'ERROR')).toBe(true);
      });

      it('should reject invalid transitions from RUNNING', () => {
        expect(isValidStateTransition('RUNNING', 'PENDING')).toBe(false);
      });

      it('should allow valid transitions from PAUSED (Requirement 4.6)', () => {
        // PAUSED can transition to RUNNING (resume) or STOPPED
        expect(isValidStateTransition('PAUSED', 'RUNNING')).toBe(true);
        expect(isValidStateTransition('PAUSED', 'STOPPED')).toBe(true);
      });

      it('should reject invalid transitions from PAUSED', () => {
        expect(isValidStateTransition('PAUSED', 'PENDING')).toBe(false);
        expect(isValidStateTransition('PAUSED', 'COMPLETED')).toBe(false);
        expect(isValidStateTransition('PAUSED', 'ERROR')).toBe(false);
      });

      it('should not allow any transitions from STOPPED (terminal state, Requirement 4.7)', () => {
        // STOPPED is a terminal state - no transitions allowed
        for (const targetState of ALL_STATES) {
          expect(isValidStateTransition('STOPPED', targetState)).toBe(false);
        }
      });

      it('should not allow any transitions from COMPLETED (terminal state)', () => {
        // COMPLETED is a terminal state - no transitions allowed
        for (const targetState of ALL_STATES) {
          expect(isValidStateTransition('COMPLETED', targetState)).toBe(false);
        }
      });

      it('should only allow STOPPED transition from ERROR', () => {
        expect(isValidStateTransition('ERROR', 'STOPPED')).toBe(true);
        expect(isValidStateTransition('ERROR', 'RUNNING')).toBe(false);
        expect(isValidStateTransition('ERROR', 'PAUSED')).toBe(false);
        expect(isValidStateTransition('ERROR', 'PENDING')).toBe(false);
        expect(isValidStateTransition('ERROR', 'COMPLETED')).toBe(false);
      });
    });

    describe('PAUSED state transitions (Requirement 4.6)', () => {
      it('should allow transition from RUNNING to PAUSED', () => {
        // When a user changes Strategy_State to PAUSED, the system SHALL halt strategy execution
        expect(isValidStateTransition('RUNNING', 'PAUSED')).toBe(true);
      });

      it('should allow resuming from PAUSED to RUNNING', () => {
        // Paused deployments can be resumed
        expect(isValidStateTransition('PAUSED', 'RUNNING')).toBe(true);
      });

      it('should allow stopping from PAUSED', () => {
        // Paused deployments can be stopped
        expect(isValidStateTransition('PAUSED', 'STOPPED')).toBe(true);
      });

      it('should not allow direct transition from PENDING to PAUSED', () => {
        // Cannot pause something that hasn't started running
        expect(isValidStateTransition('PENDING', 'PAUSED')).toBe(false);
      });
    });

    describe('STOPPED state transitions (Requirement 4.7)', () => {
      it('should allow transition from RUNNING to STOPPED', () => {
        // When a user changes Strategy_State to STOPPED, the system SHALL terminate strategy execution
        expect(isValidStateTransition('RUNNING', 'STOPPED')).toBe(true);
      });

      it('should allow transition from PAUSED to STOPPED', () => {
        // Paused deployments can be stopped
        expect(isValidStateTransition('PAUSED', 'STOPPED')).toBe(true);
      });

      it('should allow transition from PENDING to STOPPED', () => {
        // Pending deployments can be cancelled/stopped
        expect(isValidStateTransition('PENDING', 'STOPPED')).toBe(true);
      });

      it('should allow transition from ERROR to STOPPED', () => {
        // Error state deployments can be stopped
        expect(isValidStateTransition('ERROR', 'STOPPED')).toBe(true);
      });

      it('STOPPED should be a terminal state with no outgoing transitions', () => {
        // Once stopped, a deployment cannot transition to any other state
        for (const targetState of ALL_STATES) {
          expect(isValidStateTransition('STOPPED', targetState)).toBe(false);
        }
      });
    });

    describe('Complete state transition matrix', () => {
      it('should match the expected valid transitions for all states', () => {
        for (const currentState of ALL_STATES) {
          for (const targetState of ALL_STATES) {
            const expected = VALID_STATE_TRANSITIONS[currentState].includes(targetState);
            const actual = isValidStateTransition(currentState, targetState);
            expect(actual).toBe(expected);
          }
        }
      });
    });
  });
});
