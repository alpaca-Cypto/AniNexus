import { Empty, toast } from '@lobehub/ui';
import { SpotlightCard } from '@lobehub/ui/awesome';
import { useEffect, useState } from 'react';
import SubjectModal from '@/components/Modal/SubjectModal';
import MediaCard from './MediaCard';
import { BellOff, BellRing } from 'lucide-react';
import { getReminderIdentity, readUpdateReminders, toggleUpdateReminder, UPDATE_REMINDERS_EVENT } from '@/lib/updateReminders';
import type { SearchResult } from '@/services/search';



interface CollectionContentProps {
  items: SearchResult[];
  onOpenDetail?: (item: SearchResult) => void;
}

export default function CollectionContent({ items = [], onOpenDetail }: CollectionContentProps) {
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<SearchResult | null>(null);
  const [reminderIds, setReminderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const syncReminders = () => {
      setReminderIds(new Set(readUpdateReminders().filter((item) => item.enabled).map((item) => item.id)));
    };
    syncReminders();
    window.addEventListener(UPDATE_REMINDERS_EVENT, syncReminders);
    return () => window.removeEventListener(UPDATE_REMINDERS_EVENT, syncReminders);
  }, []);

  const handleOpenDetail = (item: SearchResult) => {
    setSelectedSubject(item);
    setIsSubjectModalOpen(true);
    onOpenDetail?.(item);
  };

  const handleUpdateReminder = (item: unknown) => {
    try {
      const reminder = toggleUpdateReminder(item);
      toast.success({
        title: reminder.enabled ? '已开启更新提醒' : '已关闭更新提醒',
        description: reminder.enabled
          ? `发现《${reminder.title}》的新动态时会提醒你。`
          : `《${reminder.title}》将不再显示更新提醒。`,
        icon: reminder.enabled ? BellRing : BellOff,
      });
    } catch {
      toast.error({ title: '设置失败', description: '浏览器无法保存提醒设置。' });
    }
  };
  
  if (!items || items.length === 0) {
    return <Empty description="暂无内容" image="simple" />;
  }

  return (
    <div className="p-4">
      <SpotlightCard
        items={items}
        gap={20}
        maxItemWidth={180}
        borderRadius={12}
        columns={5}
        
        renderItem={(item) => {
          return (
            <MediaCard
              data={item}
              variant="large"
              onOpenDetail={handleOpenDetail}
              onReminder={handleUpdateReminder}
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
