import type { SearchResult } from "@/services/search";

export type HomeMediaTab = "anime" | "manga";
export type HomeSortKey = "score" | "date" | "title";

export interface HomeNavigationState {
  tab: HomeMediaTab;
  query: string;
  showFilters: boolean;
  yearFrom: string;
  scoreFrom: string;
  sort: HomeSortKey;
  results: SearchResult[];
  total: number;
  page: number;
  activeQuery: string;
  scrollTop: number;
  targetSubjectId: number;
}

interface StoredHomeNavigationState extends HomeNavigationState {
  version: 3;
  savedAt: number;
}

const STORAGE_KEY = "aninexus-home-navigation-v3";
const MAX_AGE_MS = 30 * 60 * 1000;

function clearStoredState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function isStoredState(value: unknown): value is StoredHomeNavigationState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<StoredHomeNavigationState>;
  return state.version === 3
    && typeof state.savedAt === "number"
    && (state.tab === "anime" || state.tab === "manga")
    && typeof state.query === "string"
    && typeof state.showFilters === "boolean"
    && typeof state.yearFrom === "string"
    && typeof state.scoreFrom === "string"
    && (state.sort === "score" || state.sort === "date" || state.sort === "title")
    && Array.isArray(state.results)
    && typeof state.total === "number"
    && typeof state.page === "number"
    && typeof state.activeQuery === "string"
    && typeof state.scrollTop === "number"
    && Number.isFinite(state.scrollTop)
    && typeof state.targetSubjectId === "number"
    && Number.isInteger(state.targetSubjectId)
    && state.targetSubjectId > 0;
}

export function saveHomeNavigationState(state: HomeNavigationState): void {
  try {
    const storedState: StoredHomeNavigationState = {
      ...state,
      version: 3,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
  } catch {
    // Storage may be unavailable or full. Navigation must still work normally.
  }
}

function readStoredState(): StoredHomeNavigationState | null {
  try {
    const rawValue = sessionStorage.getItem(STORAGE_KEY);
    if (!rawValue) return null;

    const storedState: unknown = JSON.parse(rawValue);
    if (!isStoredState(storedState) || Date.now() - storedState.savedAt > MAX_AGE_MS) {
      clearStoredState();
      return null;
    }

    return storedState;
  } catch {
    clearStoredState();
    return null;
  }
}

export function consumeHomeNavigationState(): HomeNavigationState | null {
  const storedState = readStoredState();
  if (!storedState) return null;

  clearStoredState();
  return {
    tab: storedState.tab,
    query: storedState.query,
    showFilters: storedState.showFilters,
    yearFrom: storedState.yearFrom,
    scoreFrom: storedState.scoreFrom,
    sort: storedState.sort,
    results: storedState.results,
    total: storedState.total,
    page: storedState.page,
    activeQuery: storedState.activeQuery,
    scrollTop: storedState.scrollTop,
    targetSubjectId: storedState.targetSubjectId,
  };
}

export function hasHomeNavigationState(targetSubjectId: number): boolean {
  return readStoredState()?.targetSubjectId === targetSubjectId;
}
