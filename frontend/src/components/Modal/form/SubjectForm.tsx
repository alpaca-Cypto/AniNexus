import { useState } from 'react';
import { Button, Icon, Input, Select, TextArea } from '@lobehub/ui';
import { Rate } from 'antd';
import { ChevronDown, ChevronUp, ImageOff } from 'lucide-react';
import CoverImage from '@/components/media/CoverImage';
import type { FormData } from '../types';
import styles from './SubjectForm.module.css';

interface SubjectFormProps {
  value: FormData;
  onChange: (value: FormData) => void;
}

const subjectTypeOptions = [
  { label: '书籍 / 小说', value: '1' },
  { label: '动画', value: '2' },
  { label: '音乐', value: '3' },
  { label: '游戏', value: '4' },
  { label: '三次元', value: '6' },
];

const collectionTypeOptions = [
  { label: '想看', value: '1' },
  { label: '看过', value: '2' },
  { label: '在看', value: '3' },
  { label: '搁置', value: '4' },
  { label: '抛弃', value: '5' },
];

const subjectTypeLabel = (type: number) =>
  subjectTypeOptions.find((option) => option.value === String(type))?.label || '类型未知';

export const SubjectForm = ({ value, onChange }: SubjectFormProps) => {
  const [showSubjectDetails, setShowSubjectDetails] = useState(false);
  const displayTitle = value.title || value.subject.name_cn || value.subject.name || '未命名条目';

  const updateSubject = (patch: Partial<FormData['subject']>) => {
    onChange({ ...value, subject: { ...value.subject, ...patch } });
  };

  const updateTitle = (title: string) => {
    const titleField = value.subject.name_cn ? 'name_cn' : 'name';
    onChange({ ...value, title, subject: { ...value.subject, [titleField]: title } });
  };

  return (
    <div className={styles.form}>
      <section className={styles.subjectSection} aria-label="作品资料">
        <div className={styles.sectionHeading}>
          <div>
            <h3>作品资料</h3>
            <p>资料来自内容库，通常不需要修改。</p>
          </div>
          <Button
            icon={<Icon icon={showSubjectDetails ? ChevronUp : ChevronDown} />}
            size="small"
            onClick={() => setShowSubjectDetails((visible) => !visible)}
          >
            {showSubjectDetails ? '收起资料' : '编辑资料'}
          </Button>
        </div>

        <div className={styles.subjectPreview}>
          <div className={styles.cover}>
            <CoverImage
              src={value.cover}
              alt={`${displayTitle} 封面`}
              fill
              sizes="76px"
              fallback={<span><ImageOff size={20} /><small>暂无封面</small></span>}
            />
          </div>
          <div className={styles.subjectCopy}>
            <strong>{displayTitle}</strong>
            {value.subject.name && value.subject.name !== displayTitle && <span>{value.subject.name}</span>}
            <div className={styles.subjectMeta}>
              <span>{subjectTypeLabel(value.subject.type)}</span>
              {value.subject.date && <span>{value.subject.date}</span>}
              {value.subject.score > 0 && <span>站点评分 {value.subject.score}</span>}
            </div>
          </div>
        </div>

        {showSubjectDetails && (
          <div className={styles.advancedFields}>
            <label className={styles.fieldWide}>
              <span>显示名称</span>
              <Input value={value.title} onChange={(event) => updateTitle(event.target.value)} />
            </label>
            <label>
              <span>作品类型</span>
              <Select options={subjectTypeOptions} value={String(value.subject.type || '')} onChange={(nextValue) => updateSubject({ type: Number(nextValue) || 0 })} />
            </label>
            <label>
              <span>站点评分</span>
              <Input type="number" min="0" max="10" step="0.1" value={value.subject.score || ''} onChange={(event) => updateSubject({ score: Number(event.target.value) || 0 })} />
            </label>
            <label>
              <span>原始名称</span>
              <Input value={value.subject.name} onChange={(event) => updateSubject({ name: event.target.value })} />
            </label>
            <label>
              <span>中文名称</span>
              <Input value={value.subject.name_cn} onChange={(event) => updateSubject({ name_cn: event.target.value })} />
            </label>
            <label>
              <span>发售 / 放送日期</span>
              <Input value={value.subject.date} onChange={(event) => updateSubject({ date: event.target.value })} />
            </label>
            <label>
              <span>集数</span>
              <Input type="number" min="0" value={value.subject.eps || ''} onChange={(event) => updateSubject({ eps: Number(event.target.value) || 0 })} />
            </label>
            <label>
              <span>卷数</span>
              <Input type="number" min="0" value={value.subject.volumes || ''} onChange={(event) => updateSubject({ volumes: Number(event.target.value) || 0 })} />
            </label>
            <label>
              <span>来源</span>
              <Input value={value.subject.source} onChange={(event) => updateSubject({ source: event.target.value })} />
            </label>
            <label>
              <span>源 ID</span>
              <Input value={value.subject.source_id || value.subject.id || ''} onChange={(event) => updateSubject({ source_id: event.target.value })} />
            </label>
            <label className={styles.fieldWide}>
              <span>封面地址</span>
              <Input value={value.cover || ''} onChange={(event) => onChange({ ...value, cover: event.target.value })} />
            </label>
            <label className={styles.fieldWide}>
              <span>作品简介</span>
              <TextArea resize={false} rows={4} value={value.subject.short_summary} onChange={(event) => updateSubject({ short_summary: event.target.value })} />
            </label>
          </div>
        )}
      </section>

      <section className={styles.collectionSection} aria-label="我的收藏">
        <div className={styles.sectionHeading}>
          <div>
            <h3>我的收藏</h3>
            <p>记录观看状态、进度和个人评价。</p>
          </div>
        </div>

        <div className={styles.collectionFields}>
          <label>
            <span>收藏状态</span>
            <Select options={collectionTypeOptions} value={String(value.collectionType || 1)} onChange={(nextValue) => onChange({ ...value, collectionType: Number(nextValue) || 1 })} />
          </label>
          <label>
            <span>我的评分</span>
            <div className={styles.rating}><Rate count={10} value={value.rate || 0} onChange={(rate) => onChange({ ...value, rate })} allowClear size="small" /></div>
          </label>
          <label>
            <span>已看集数</span>
            <Input type="number" min="0" placeholder="0" value={value.epStatus || ''} onChange={(event) => onChange({ ...value, epStatus: Number(event.target.value) || 0 })} />
          </label>
          <label>
            <span>已读卷数</span>
            <Input type="number" min="0" placeholder="0" value={value.volStatus || ''} onChange={(event) => onChange({ ...value, volStatus: Number(event.target.value) || 0 })} />
          </label>
          <label className={styles.fieldWide}>
            <span>个人标签</span>
            <Input placeholder="用逗号分隔，例如：治愈、周末观看" value={value.tags || ''} onChange={(event) => onChange({ ...value, tags: event.target.value })} />
          </label>
          <label className={styles.fieldWide}>
            <span>短评</span>
            <TextArea resize={false} rows={3} placeholder="写下值得记住的感受" value={value.comment || ''} onChange={(event) => onChange({ ...value, comment: event.target.value })} />
          </label>
        </div>
      </section>
    </div>
  );
};

export default SubjectForm;
