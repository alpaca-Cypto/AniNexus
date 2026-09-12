import { Empty, toast } from '@lobehub/ui';
import { SpotlightCard } from '@lobehub/ui/awesome';
import { useEffect, useState } from 'react';
import SubjectModal from '@/components/Modal/SubjectModal';
import MediaCard from './MediaCard';
import { BellOff, BellRing } from 'lucide-react';
import { getReminderIdentity, readUpdateReminders, toggleUpdateReminder, UPDATE_REMINDERS_EVENT } from '@/lib/updateReminders';



interface CollectionContentProps {
  items: any[];
  onOpenDetail?: (item: any) => void; // 假设你有个点击打开详情的回调
}

export default function CollectionContent({ items = [], onOpenDetail }: CollectionContentProps) {
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [reminderIds, setReminderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const syncReminders = () => {
      setReminderIds(new Set(readUpdateReminders().filter((item) => item.enabled).map((item) => item.id)));
    };
    syncReminders();
    window.addEventListener(UPDATE_REMINDERS_EVENT, syncReminders);
    return () => window.removeEventListener(UPDATE_REMINDERS_EVENT, syncReminders);
  }, []);

  const handleOpenDetail = (item: any) => {
    // 确保 item 数据格式正确
    const formattedItem = {
      ...item,
      // 确保 subject 字段存在
      subject: item.subject || item,
      // 确保 collection 字段存在
      collection: item.collection || {}
    };
    setSelectedSubject(formattedItem);
    setIsSubjectModalOpen(true);
    onOpenDetail?.(formattedItem);
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
        initialValues={selectedSubject}
      />
    </div>
  );
}
