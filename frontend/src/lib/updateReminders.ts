export const UPDATE_REMINDERS_STORAGE_KEY = 'aninexus-update-reminders';
export const UPDATE_REMINDERS_EVENT = 'aninexus:update-reminders-changed';

export interface UpdateReminder {
  id: string;
  title: string;
  subjectId?: number;
  enabled: boolean;
  createdAt: string;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
);

export const getReminderIdentity = (item: unknown) => {
  const itemRecord = asRecord(item);
  const subject = asRecord(itemRecord.subject || itemRecord);
  const subjectId = Number(subject.id || subject.source_id || 0);
  const title = String(subject.name_cn || subject.name || itemRecord.title || '').trim();
  const id = subjectId > 0
    ? `subject:${subjectId}`
    : `title:${title.toLocaleLowerCase()}`;

  return { id, subjectId: subjectId || undefined, title };
};

export const readUpdateReminders = (): UpdateReminder[] => {
  if (typeof window === 'undefined') return [];

  try {
    const value = JSON.parse(localStorage.getItem(UPDATE_REMINDERS_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const hasUpdateReminder = (item: unknown) => {
  const { id } = getReminderIdentity(item);
  return readUpdateReminders().some((reminder) => reminder.id === id && reminder.enabled);
};

export const toggleUpdateReminder = (item: unknown) => {
  const identity = getReminderIdentity(item);
  const reminders = readUpdateReminders();
  const existing = reminders.find((reminder) => reminder.id === identity.id);
  const enabled = !existing?.enabled;
  const nextReminder: UpdateReminder = {
    ...identity,
    enabled,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  const next = [
    ...reminders.filter((reminder) => reminder.id !== identity.id),
    nextReminder,
  ];

  localStorage.setItem(UPDATE_REMINDERS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(UPDATE_REMINDERS_EVENT, { detail: nextReminder }));
  return nextReminder;
};
