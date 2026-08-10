export type ImportState = 
  | 'SELECT_FILE'
  | 'VALIDATING'
  | 'REVIEW'
  | 'READY_TO_COMMIT'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'FAILED';

export type ImportAction =
  | { type: 'SELECT_FILE'; file: File }
  | { type: 'REMOVE_FILE' }
  | { type: 'START_VALIDATION' }
  | { type: 'VALIDATION_SUCCESS' }
  | { type: 'PROCEED_TO_REVIEW' }
  | { type: 'CHECKLIST_UPDATED'; isValid: boolean }
  | { type: 'START_COMMIT' }
  | { type: 'COMMIT_SUCCESS'; importId: string }
  | { type: 'FAIL'; error: string }
  | { type: 'RESET' };

/**
 * Validates if state transition is allowed in the import state machine.
 */
export function isAllowedImportTransition(current: ImportState, next: ImportState): boolean {
  switch (current) {
    case 'SELECT_FILE':
      return next === 'VALIDATING' || next === 'FAILED' || next === 'SELECT_FILE';
    case 'VALIDATING':
      return next === 'REVIEW' || next === 'FAILED' || next === 'SELECT_FILE';
    case 'REVIEW':
      return next === 'COMMITTING' || next === 'COMMITTED' || next === 'READY_TO_COMMIT' || next === 'VALIDATING' || next === 'SELECT_FILE' || next === 'FAILED';
    case 'READY_TO_COMMIT':
      return next === 'COMMITTING' || next === 'COMMITTED' || next === 'REVIEW' || next === 'SELECT_FILE' || next === 'FAILED';
    case 'COMMITTING':
      return next === 'COMMITTED' || next === 'FAILED';
    case 'COMMITTED':
    case 'FAILED':
      return next === 'SELECT_FILE' || next === 'VALIDATING' || next === 'REVIEW';
    default:
      return false;
  }
}
