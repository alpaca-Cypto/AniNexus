import type { BangumiItem } from '@/services/bangumiService';

const TIMETABLE_DRAFT_KEY = 'aninexus-timetable-draft';

const draftKey = (userId: number) => `${TIMETABLE_DRAFT_KEY}:${userId}`;

export function saveTimetableDraft(userId: number, items: BangumiItem[]) {
  localStorage.setItem(draftKey(userId), JSON.stringify(items));
}

export function readTimetableDraft(userId: number, migrateOwnerDraft = false): unknown {
  const currentDraft = localStorage.getItem(draftKey(userId));
  if (currentDraft) return JSON.parse(currentDraft);

  if (!migrateOwnerDraft) return null;
  const legacyDraft = localStorage.getItem(TIMETABLE_DRAFT_KEY);
  if (!legacyDraft) return null;

  const parsed: unknown = JSON.parse(legacyDraft);
  localStorage.setItem(draftKey(userId), legacyDraft);
  localStorage.removeItem(TIMETABLE_DRAFT_KEY);
  return parsed;
}

export function clearTimetableDraft(userId: number, clearOwnerLegacy = false) {
  localStorage.removeItem(draftKey(userId));
  if (clearOwnerLegacy) {
    localStorage.removeItem(TIMETABLE_DRAFT_KEY);
  }
}
