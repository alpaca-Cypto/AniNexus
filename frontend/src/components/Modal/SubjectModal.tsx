import React, { useState, useEffect } from 'react';
import { Modal, Button, Icon, toast } from '@lobehub/ui';
import { BellRing, BellOff, ExternalLink, CheckCircle2, XCircle, Globe, PlayCircle } from 'lucide-react';
import { useAppTheme } from '@/components/providers/LobeProvider';
import SubjectForm from './form/SubjectForm';
import { FormData } from './types';
import { hasUpdateReminder, toggleUpdateReminder, UPDATE_REMINDERS_EVENT } from '@/lib/updateReminders';
import { COLLECTIONS_UPDATED_EVENT, collectionService } from '@/services/collections';
import styles from './SubjectModal.module.css';

interface SubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialValues?: unknown;
}

type ItemRecord = Record<string, unknown>;

const asRecord = (value: unknown): ItemRecord =>
  typeof value === 'object' && value !== null ? value as ItemRecord : {};

const asString = (value: unknown): string => value == null ? '' : String(value);
const asNumber = (value: unknown): number => Number(value || 0);

const SubjectModal = ({ isOpen, onClose, initialValues }: SubjectModalProps) => {
  const { isDarkMode } = useAppTheme();
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 解析项目数据的函数
  const parseItemData = (value: unknown): FormData => {
    const item = asRecord(value);
    if (Object.keys(item).length === 0) {
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
    const subject = Object.keys(asRecord(item.subject)).length > 0 ? asRecord(item.subject) : item;
    const collection = asRecord(item.collection);
    const images = asRecord(subject.images);
    const rating = asRecord(subject.rating);
    
    // 构建表单数据
    return {
      title: asString(subject.name_cn || subject.name || item.title),
      subject: {
        id: asNumber(subject.id || subject.source_id),
        source_id: asString(subject.source_id || subject.id),
        date: asString(subject.date),
        images: {
          small: asString(images.small),
          grid: asString(images.grid),
          large: asString(images.large || subject.image),
          medium: asString(images.medium),
          common: asString(images.common || subject.image),
        },
        name: asString(subject.name),
        name_cn: asString(subject.name_cn),
        short_summary: asString(subject.short_summary || subject.summary),
        tags: Array.isArray(subject.tags) ? subject.tags as FormData['subject']['tags'] : [],
        score: asNumber(rating.score || subject.score),
        type: asNumber(subject.type || subject.subject_type),
        eps: asNumber(subject.eps),
        volumes: asNumber(subject.volumes),
        source: asString(subject.source),
      },
      cover: asString(images.large || images.medium || subject.image),
      collectionType: Number(collection.type || item.type || 1), // 默认值为"想看"
      rate: asNumber(collection.rate || item.rate),
      comment: asString(collection.comment || item.comment),
      volStatus: asNumber(collection.vol_status || item.vol_status),
      epStatus: asNumber(collection.ep_status || item.ep_status),
      tags: asString(collection.tags || item.tags),
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

  const handleOk = async () => {
    const source = formData.subject.source.trim();
    const sourceId = String(formData.subject.source_id || formData.subject.id || '').trim();
    const name = (formData.subject.name || formData.title).trim();
    if (!source || !sourceId || !name || !formData.subject.type) {
      toast.error({
        title: '无法保存收藏',
        description: '条目的名称、类型、来源或源 ID 不完整。',
        icon: XCircle,
      });
      return;
    }

    setIsSaving(true);
    try {
      const saved = await collectionService.saveCollection({
        subject: {
          source,
          source_id: sourceId,
          type: formData.subject.type,
          name,
          name_cn: formData.subject.name_cn || formData.title || null,
          summary: formData.subject.short_summary || null,
          date: formData.subject.date || null,
          eps: formData.subject.eps || null,
          volumes: formData.subject.volumes || null,
          image: formData.cover || formData.subject.images?.large || null,
          score: formData.subject.score || null,
          tags: (formData.subject.tags || []).map((tag) => tag.name),
        },
        collection: {
          type: formData.collectionType || 1,
          rate: formData.rate || null,
          comment: formData.comment || null,
          ep_status: formData.epStatus || 0,
          vol_status: formData.volStatus || 0,
          tags: (formData.tags || '')
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      });
      window.dispatchEvent(new CustomEvent(COLLECTIONS_UPDATED_EVENT, { detail: saved }));
      toast.success({
        title: '已保存到我的收藏',
        description: '收藏信息已写入数据库，并更新右侧收藏栏。',
        icon: CheckCircle2,
        duration: 3000,
      });
      onClose();
    } catch (error) {
      toast.error({
        title: '保存失败',
        description: error instanceof Error ? error.message : '收藏信息暂时无法保存。',
        icon: XCircle,
        duration: 3000,
      });
    } finally {
      setIsSaving(false);
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
        okText="保存收藏"
        okButtonProps={{ loading: isSaving }}
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
