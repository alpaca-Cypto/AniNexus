import React, { useState, useEffect } from 'react';
import { Modal, Button, Icon, toast } from '@lobehub/ui';
import { BellRing, BellOff, ExternalLink, CheckCircle2, XCircle, Globe, PlayCircle } from 'lucide-react';
import { useAppTheme } from '@/components/providers/LobeProvider';
import SubjectForm from './form/SubjectForm';
import { FormData } from './types';
import { hasUpdateReminder, toggleUpdateReminder, UPDATE_REMINDERS_EVENT } from '@/lib/updateReminders';
import styles from './SubjectModal.module.css';

interface SubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Partial<FormData>;
}

const SubjectModal = ({ isOpen, onClose, initialValues }: SubjectModalProps) => {
  const { isDarkMode } = useAppTheme();
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  
  // 解析项目数据的函数
  const parseItemData = (item: any): FormData => {
    if (!item) {
      // 默认空表单数据
      return {
        title: '',
        subject: {
          id: 0,
          source_id: 0,
          date: '',
          images: {
            small: '',
            grid: '',
            large: '',
            medium: '',
            common: ''
          },
          name: '',
          name_cn: '',
          short_summary: '',
          tags: [],
          score: 0,
          type: 0,
          eps: 0,
          volumes: 0,
          source: ''
        },
        cover: '',
        collectionType: 1, // 默认值为"想看"
        rate: 0,
        comment: '',
        volStatus: 0,
        epStatus: 0,
        tags: ''
      };
    }
    
    // 提取 subject 和 collection 数据
    const subject = item.subject || item;
    const collection = item.collection || {};
    
    // 构建表单数据
    return {
      title: String(subject.name_cn || subject.name || item.title || ''),
      subject: {
        id: Number(subject.id || subject.source_id || 0),
        source_id: Number(subject.source_id || subject.id || 0),
        date: String(subject.date || ''),
        images: subject.images || {
          small: '',
          grid: '',
          large: subject.image || '',
          medium: '',
          common: subject.image || ''
        },
        name: String(subject.name || ''),
        name_cn: String(subject.name_cn || ''),
        short_summary: String(subject.short_summary || subject.summary || ''),
        tags: subject.tags || [],
        score: Number(subject.rating?.score || subject.score || 0),
        type: Number(subject.type || subject.subject_type || 0),
        eps: Number(subject.eps || 0),
        volumes: Number(subject.volumes || 0),
        source: String(subject.source || '')
      },
      cover: String(subject.images?.large || subject.images?.medium || subject.image || ''),
      collectionType: Number(collection.type || item.type || 1), // 默认值为"想看"
      rate: Number(collection.rate || item.rate || 0),
      comment: String(collection.comment || item.comment || ''),
      volStatus: Number(collection.vol_status || item.vol_status || 0),
      epStatus: Number(collection.ep_status || item.ep_status || 0),
      tags: String(collection.tags || item.tags || '')
    };
  };
  
  // 当 initialValues 变化时，更新 formData
  const [formData, setFormData] = useState<FormData>(() => {
    return parseItemData(initialValues);
  });
  
  // 当 initialValues 变化时，更新 formData
  useEffect(() => {
    if (!initialValues) return;
    
    const parsedData = parseItemData(initialValues);
    setFormData(parsedData);
  }, [initialValues]);

  useEffect(() => {
    if (!isOpen) return;

    const syncReminderState = () => setIsReminderEnabled(hasUpdateReminder(formData));
    syncReminderState();
    window.addEventListener(UPDATE_REMINDERS_EVENT, syncReminderState);
    return () => window.removeEventListener(UPDATE_REMINDERS_EVENT, syncReminderState);
  }, [formData, isOpen]);

  const handleOk = () => {
    try {
      localStorage.setItem(`aninexus-demo-subject-${formData.subject.id}`, JSON.stringify(formData));
      toast.success({
        title: '已保存到浏览器',
        description: '这份条目修改仅用于当前前端演示。',
        icon: CheckCircle2,
        duration: 3000,
      });
      onClose();
    } catch {
      toast.error({
        title: '保存失败',
        description: '浏览器无法保存这份演示数据。',
        icon: XCircle,
        duration: 3000,
      });
    }
  };

  const getDisplayTitle = () => formData.subject?.name_cn || formData.subject?.name || formData.title;

  const handleUpdateReminder = () => {
    const title = getDisplayTitle();
    if (!title) {
      toast.error({
        title: '错误',
        description: '请先填写条目名称',
        icon: XCircle,
        duration: 3000,
      });
      return;
    }

    try {
      const reminder = toggleUpdateReminder(formData);
      setIsReminderEnabled(reminder.enabled);
      toast.success({
        title: reminder.enabled ? '已开启更新提醒' : '已关闭更新提醒',
        description: reminder.enabled
          ? `发现《${title}》的新动态时会在 AniNexus 提醒你。`
          : `《${title}》将不再显示更新提醒。`,
        icon: reminder.enabled ? BellRing : BellOff,
        duration: 3000,
      });
    } catch {
      toast.error({
        title: '设置失败',
        description: '浏览器无法保存提醒设置。',
        icon: XCircle,
        duration: 3000,
      });
    }
  };

  const openPlatformSearch = (platform: 'bilibili' | 'tencent' | 'iqiyi') => {
    const title = getDisplayTitle();
    if (!title) {
      toast.error({
        title: '错误',
        description: '请先填写条目名称',
        icon: XCircle,
        duration: 3000,
      });
      return;
    }

    const keyword = encodeURIComponent(title);
    const urls = {
      bilibili: `https://search.bilibili.com/all?keyword=${keyword}`,
      tencent: `https://v.qq.com/x/search/?q=${keyword}`,
      iqiyi: `https://so.iqiyi.com/so/q_${keyword}`,
    };
    window.open(urls[platform], '_blank', 'noopener,noreferrer');
  };

  const sourceWebsite = (() => {
    const source = formData.subject?.source?.toLocaleLowerCase();
    const sourceId = formData.subject?.source_id || formData.subject?.id;
    if (!sourceId) return null;
    if (source === 'myanimelist') {
      return {
        label: '访问 MyAnimeList 资料页',
        url: `https://myanimelist.net/${formData.subject.type === 2 ? 'anime' : 'manga'}/${sourceId}`,
      };
    }
    if (source === 'bangumi') {
      return { label: '访问 Bangumi 资料页', url: `https://bgm.tv/subject/${sourceId}` };
    }
    return null;
  })();

  const handleSourceWebsiteRedirect = () => {
    if (!sourceWebsite) {
      toast.error({
        title: '错误',
        description: '当前条目没有可用的来源网站地址',
        icon: XCircle,
        duration: 3000,
      });
      return;
    }

    window.open(sourceWebsite.url, '_blank', 'noopener,noreferrer');
  };

  const supportsVideoPlatforms = [2, 6].includes(formData.subject?.type || 0);

  return (
    <>
      <Modal
        open={isOpen}
        title="条目详情"
        onCancel={onClose}
        onOk={handleOk}
        okText="保存到浏览器"
        cancelText="取消"
        centered
        width={700}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 主体表单 */}
          <SubjectForm value={formData} onChange={setFormData} />
          
          <section className={`${styles.followPanel} ${isDarkMode ? styles.followPanelDark : ''}`} aria-label="更新与观看">
            <div className={styles.reminderRow}>
              <span className={styles.reminderIcon} aria-hidden="true">
                <Icon icon={isReminderEnabled ? BellRing : BellOff} />
              </span>
              <div className={styles.reminderCopy}>
                <strong>更新提醒</strong>
                <p>关注作品的新集和放送动态，只发送提醒，不会自动下载任何文件。</p>
              </div>
              <Button
                type={isReminderEnabled ? 'primary' : 'default'}
                icon={<Icon icon={isReminderEnabled ? CheckCircle2 : BellRing} />}
                onClick={handleUpdateReminder}
              >
                {isReminderEnabled ? '已开启提醒' : '开启提醒'}
              </Button>
            </div>

            {supportsVideoPlatforms && (
              <div className={styles.channelArea}>
                <div className={styles.channelHeader}>
                  <strong>正版观看渠道</strong>
                  <p>前往视频平台搜索当前作品，查看所在地区的版权与播放信息。</p>
                </div>
                <div className={styles.channelGrid}>
                  <Button className={styles.channelButton} icon={<Icon icon={PlayCircle} />} onClick={() => openPlatformSearch('bilibili')}>
                    哔哩哔哩
                  </Button>
                  <Button className={styles.channelButton} icon={<Icon icon={PlayCircle} />} onClick={() => openPlatformSearch('tencent')}>
                    腾讯视频
                  </Button>
                  <Button className={styles.channelButton} icon={<Icon icon={PlayCircle} />} onClick={() => openPlatformSearch('iqiyi')}>
                    爱奇艺
                  </Button>
                </div>
                <p className={styles.channelNote}>平台是否提供观看服务，以搜索结果和当地版权信息为准。</p>
              </div>
            )}

            {sourceWebsite && (
              <Button type="text" icon={<Icon icon={Globe} />} onClick={handleSourceWebsiteRedirect}>
                <span>{sourceWebsite.label}</span>
                <Icon icon={ExternalLink} size={14} />
              </Button>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
};

export default SubjectModal;
