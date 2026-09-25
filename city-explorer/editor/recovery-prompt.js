export function createRecoveryPrompt(status) {
  let pending = status === 'recovered' || status === 'base-revision-mismatch';
  return {
    get pending() { return pending; },
    dismiss() { pending = false; },
  };
}
