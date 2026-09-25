import { validateSceneDocument } from './scene-document.js';

const HISTORY_LIMIT = 100;

function cloneNormalizedDocument(input) {
  const result = validateSceneDocument(input);
  if (!result.ok) throw new TypeError(`Invalid scene document: ${result.errors.join(' ')}`);
  return result.document;
}

function sameDocument(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function createCommandHistory({ initialDocument, onChange = () => {} }) {
  let currentDocument = cloneNormalizedDocument(initialDocument);
  const undoStack = [];
  const redoStack = [];

  function notify(action, command) {
    onChange(cloneNormalizedDocument(currentDocument), { action, label: command?.label ?? null });
  }

  return {
    execute(label, nextDocument) {
      const next = cloneNormalizedDocument(nextDocument);
      if (sameDocument(currentDocument, next)) return false;

      const command = {
        label: String(label ?? ''),
        before: cloneNormalizedDocument(currentDocument),
        after: next,
      };
      undoStack.push(command);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
      currentDocument = cloneNormalizedDocument(next);
      notify('execute', command);
      return true;
    },

    undo() {
      const command = undoStack.pop();
      if (!command) return false;
      currentDocument = cloneNormalizedDocument(command.before);
      redoStack.push(command);
      notify('undo', command);
      return true;
    },

    redo() {
      const command = redoStack.pop();
      if (!command) return false;
      currentDocument = cloneNormalizedDocument(command.after);
      undoStack.push(command);
      notify('redo', command);
      return true;
    },

    get canUndo() {
      return undoStack.length > 0;
    },

    get canRedo() {
      return redoStack.length > 0;
    },

    get current() {
      return cloneNormalizedDocument(currentDocument);
    },
  };
}
