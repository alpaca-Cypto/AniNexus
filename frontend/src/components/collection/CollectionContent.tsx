import { Empty, toast } from '@lobehub/ui';
import { SpotlightCard } from '@lobehub/ui/awesome';
import { useEffect, useState } from 'react';
import SubjectModal from '@/components/Modal/SubjectModal';
import MediaCard from './MediaCard';
import { BellOff, BellRing } from 'lucide-react';
import { getReminderIdentity, readUpdateReminders, toggleUpdateReminder, UPDATE_REMINDERS_EVENT } from '@/lib/updateReminders';
import { AUTH_CHANGED_EVENT } from '@/services/account';
import type { SearchResult } from '@/services/search';



interface CollectionContentProps {
  items: SearchResult[];
  emptyDescription?: string;
  onOpenDetail?: (item: SearchResult) => void;
}

export default function CollectionContent({ items = [], emptyDescription = '暂无内容', onOpenDetail }: CollectionContentProps) {
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<SearchResult | null>(null);
  const [reminderIds, setReminderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    let generation = 0;
    const syncReminders = () => {
      const current = ++generation;
      setReminderIds(new Set());
      void readUpdateReminders()
        .then((reminders) => {
          if (active && current === generation) {
            setReminderIds(new Set(reminders.filter((item) => item.enabled).map((item) => item.id)));
          }
        })
        .catch(() => {
          if (active && current === generation) setReminderIds(new Set());
        });
    };
    syncReminders();
    window.addEventListener(UPDATE_REMINDERS_EVENT, syncReminders);
    window.addEventListener(AUTH_CHANGED_EVENT, syncReminders);
    return () => {
      active = false;
      window.removeEventListener(UPDATE_REMINDERS_EVENT, syncReminders);
      window.removeEventListener(AUTH_CHANGED_EVENT, syncReminders);
    };
  }, []);

  const handleOpenDetail = (item: SearchResult) => {
    setSelectedSubject(item);
    setIsSubjectModalOpen(true);
    onOpenDetail?.(item);
  };

  const handleUpdateReminder = async (item: unknown) => {
    try {
      const reminder = await toggleUpdateReminder(item);
      toast.success({
        title: reminder.enabled ? '已开启更新提醒' : '已关闭更新提醒',
        description: reminder.enabled
          ? `发现《${reminder.title}》的新动态时会提醒你。`
          : `《${reminder.title}》将不再显示更新提醒。`,
        icon: reminder.enabled ? BellRing : BellOff,
      });
    } catch (error) {
      toast.error({ title: '设置失败', description: error instanceof Error ? error.message : '无法保存提醒设置。' });
    }
  };
  
  if (!items || items.length === 0) {
    return <div className="collection-empty"><Empty description={emptyDescription} image="simple" /></div>;
  }

  return (
    <div className="p-4">
      <SpotlightCard
        items={items}
        gap={20}
        maxItemWidth={180}
        borderRadius={27}
        columns={5}
        
        renderItem={(item) => {
          return (
            <MediaCard
              data={item}
              variant="large"
              onOpenDetail={handleOpenDetail}
              onReminder={(entry) => { void handleUpdateReminder(entry); }}
              reminderEnabled={reminderIds.has(getReminderIdentity(item).id)}
            />
          );
        }}
      />

      {/* 条目详情模态框 */}
      <SubjectModal
        isOpen={isSubjectModalOpen}
        onClose={() => {
          setIsSubjectModalOpen(false);
          setSelectedSubject(null);
        }}
        initialValues={selectedSubject ?? undefined}
      />
    </div>
  );
}
