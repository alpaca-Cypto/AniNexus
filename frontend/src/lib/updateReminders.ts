import { request } from '@/services/client';

export const UPDATE_REMINDERS_EVENT = 'aninexus:update-reminders-changed';

export interface UpdateReminder {
  id: string;
  title: string;
  subjectId: number;
  enabled: boolean;
  createdAt: string;
}

interface ApiReminder {
  subject_id: number;
  enabled: boolean;
  created_at: string;
  subject: { name: string; name_cn?: string | null };
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' ? value as UnknownRecord : {}
);

export const getReminderIdentity = (item: unknown) => {
  const itemRecord = asRecord(item);
  const subject = asRecord(itemRecord.subject || itemRecord);
  const subjectId = Number(subject.id || 0);
  const title = String(subject.name_cn || subject.name || itemRecord.title || '').trim();
  const id = subjectId > 0
    ? `subject:${subjectId}`
    : `title:${title.toLocaleLowerCase()}`;

  return { id, subjectId: subjectId || undefined, title };
};

const fromApi = (reminder: ApiReminder): UpdateReminder => ({
  id: `subject:${reminder.subject_id}`,
  subjectId: reminder.subject_id,
  title: reminder.subject.name_cn || reminder.subject.name,
  enabled: reminder.enabled,
  createdAt: reminder.created_at,
});

export const readUpdateReminders = async (): Promise<UpdateReminder[]> => {
  const response = await request<{ items: ApiReminder[] }>('/reminders', { cache: 'no-store' });
  return response.items.map(fromApi);
};

export const hasUpdateReminder = async (item: unknown): Promise<boolean> => {
  const { id } = getReminderIdentity(item);
  return (await readUpdateReminders()).some((reminder) => reminder.id === id && reminder.enabled);
};

export const toggleUpdateReminder = async (item: unknown): Promise<UpdateReminder> => {
  const { id, subjectId } = getReminderIdentity(item);
  if (!subjectId) throw new Error('请先选择资料库中的作品。');

  const existing = (await readUpdateReminders()).find((reminder) => reminder.id === id);
  const saved = await request<ApiReminder>(`/reminders/${subjectId}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: !existing?.enabled, channel: 'in_app' }),
  });
  const reminder = fromApi(saved);
  window.dispatchEvent(new CustomEvent(UPDATE_REMINDERS_EVENT, { detail: reminder }));
  return reminder;
};
