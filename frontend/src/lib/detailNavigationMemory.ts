export interface DetailNavigationState {
  sourceSubjectId: number;
  targetSubjectId: number;
  scrollTop: number;
}

interface StoredDetailNavigationState extends DetailNavigationState {
  savedAt: number;
}

interface StoredDetailNavigationStack {
  version: 1;
  entries: StoredDetailNavigationState[];
  pendingSourceSubjectId: number | null;
}

const STORAGE_KEY = "aninexus-detail-navigation-v1";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_DEPTH = 20;

function isNavigationState(value: unknown): value is StoredDetailNavigationState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<StoredDetailNavigationState>;
  return Number.isInteger(state.sourceSubjectId)
    && Number(state.sourceSubjectId) > 0
    && Number.isInteger(state.targetSubjectId)
    && Number(state.targetSubjectId) > 0
    && typeof state.scrollTop === "number"
    && Number.isFinite(state.scrollTop)
    && typeof state.savedAt === "number";
}

function readStack(): StoredDetailNavigationStack {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: [], pendingSourceSubjectId: null };
    const value = JSON.parse(raw) as Partial<StoredDetailNavigationStack>;
    if (value.version !== 1 || !Array.isArray(value.entries)) {
      return { version: 1, entries: [], pendingSourceSubjectId: null };
    }
    const cutoff = Date.now() - MAX_AGE_MS;
    return {
      version: 1,
      entries: value.entries.filter(
        (entry): entry is StoredDetailNavigationState =>
          isNavigationState(entry) && entry.savedAt >= cutoff,
      ),
      pendingSourceSubjectId: Number.isInteger(value.pendingSourceSubjectId)
        ? Number(value.pendingSourceSubjectId)
        : null,
    };
  } catch {
    return { version: 1, entries: [], pendingSourceSubjectId: null };
  }
}

function writeStack(stack: StoredDetailNavigationStack): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch {
    // Navigation still works when storage is restricted or full.
  }
}

export function saveDetailNavigationState(state: DetailNavigationState): void {
  const stack = readStack();
  stack.pendingSourceSubjectId = null;
  stack.entries.push({ ...state, savedAt: Date.now() });
  stack.entries = stack.entries.slice(-MAX_DEPTH);
  writeStack(stack);
}

export function prepareDetailReturn(targetSubjectId: number): boolean {
  const stack = readStack();
  const entry = stack.entries.at(-1);
  if (!entry || entry.targetSubjectId !== targetSubjectId) return false;
  stack.pendingSourceSubjectId = entry.sourceSubjectId;
  writeStack(stack);
  return true;
}

export function consumeDetailReturnState(sourceSubjectId: number): DetailNavigationState | null {
  const stack = readStack();
  const entry = stack.entries.at(-1);
  // The top entry already describes the only valid detail-page return path.
  // Do not depend solely on popstate: Next.js can commit the previous route
  // before component-level popstate listeners run.
  if (!entry || entry.sourceSubjectId !== sourceSubjectId) {
    return null;
  }

  stack.entries.pop();
  stack.pendingSourceSubjectId = null;
  writeStack(stack);
  return {
    sourceSubjectId: entry.sourceSubjectId,
    targetSubjectId: entry.targetSubjectId,
    scrollTop: entry.scrollTop,
  };
}
