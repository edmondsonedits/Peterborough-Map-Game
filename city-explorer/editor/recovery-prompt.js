export function createRecoveryPrompt(status) {
  let pending = ['recovered', 'base-revision-mismatch', 'base-content-mismatch', 'base-content-unverified'].includes(status);
  return {
    get pending() { return pending; },
    dismiss() { pending = false; },
  };
}
