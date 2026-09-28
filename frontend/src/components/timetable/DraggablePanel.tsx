import React, { useEffect, useMemo, useState } from 'react';
import { DraggablePanel, Segmented } from '@lobehub/ui';
import { Dropdown } from 'antd';
import { ChevronDown, Filter, LibraryBig, RotateCcw } from 'lucide-react';
import TimelineMediaCard from './TimelineMediaCard';
import DraggableItemWrapper from './DraggableItemWrapper';
import SubjectModal from '../Modal/SubjectModal';
import { BangumiItem } from '@/services/bangumiService';

const CATEGORY_OPTIONS = [
  { label: '全部', type: undefined, value: 'all' },
  { label: '动画', type: 2, value: 'anime' },
  { label: '书籍', type: 1, value: 'book' },
  { label: '游戏', type: 4, value: 'game' },
  { label: '影视', type: 6, value: 'movie' },
] as const;

const STATUS_OPTIONS = [
  { label: '全部状态', status: undefined, value: 'all' },
  { label: '想看', status: 1, value: 'wish' },
  { label: '在看', status: 3, value: 'watching' },
  { label: '看过', status: 2, value: 'watched' },
  { label: '搁置', status: 4, value: 'on_hold' },
] as const;

type CategoryValue = (typeof CATEGORY_OPTIONS)[number]['value'];
type StatusValue = (typeof STATUS_OPTIONS)[number]['value'];

interface CollectionPanelProps {
  searchQuery?: string;
  collections?: BangumiItem[];
  openSignal?: number;
}

export const CollectionPanel = ({
  searchQuery = '',
  collections = [],
  openSignal = 0,
}: CollectionPanelProps) => {
  const [expand, setExpand] = useState(true);
  const [isCompact, setIsCompact] = useState(false);
  const [activeType, setActiveType] = useState<CategoryValue>('all');
  const [activeStatus, setActiveStatus] = useState<StatusValue>('all');
  const [selectedSubject, setSelectedSubject] = useState<BangumiItem | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px)');
    const updateLayout = () => {
      setIsCompact(mediaQuery.matches);
      setExpand(!mediaQuery.matches);
    };

    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (openSignal === 0) return;
    const timer = window.setTimeout(() => setExpand(true), 0);
    return () => window.clearTimeout(timer);
  }, [openSignal]);

  const activeStatusOption = STATUS_OPTIONS.find(({ value }) => value === activeStatus)
    ?? STATUS_OPTIONS[0];

  const filteredList = useMemo(() => {
    const type = CATEGORY_OPTIONS.find(({ value }) => value === activeType)?.type;
    const status = activeStatusOption.status;
    const keyword = searchQuery.trim().toLocaleLowerCase();

    return collections.filter((item) =>
      (type === undefined || item.subject.type === type)
      && (status === undefined || item.collection?.type === status)
      && (!keyword || [item.subject.name, item.subject.name_cn || '']
        .some((value) => value.toLocaleLowerCase().includes(keyword)))
    );
  }, [activeStatusOption.status, activeType, collections, searchQuery]);

  const hasActiveFilters = activeType !== 'all' || activeStatus !== 'all';
  const resetFilters = () => {
    setActiveType('all');
    setActiveStatus('all');
  };

  const emptyMessage = collections.length === 0
    ? '收藏会显示在这里'
    : searchQuery.trim()
      ? `没有找到“${searchQuery.trim()}”`
      : '没有符合筛选的收藏';

  return (
    <>
      <DraggablePanel
        className="collection-panel"
        defaultSize={{ height: '100%', width: 320 }}
        expand={expand}
        maxWidth={400}
        minWidth={280}
        mode={isCompact ? 'float' : 'fixed'}
        placement="right"
        showHandleWhenCollapsed
        onExpandChange={setExpand}
      >
        <div className="collection-panel__content">
          <header className="collection-panel__header">
            <div className="collection-panel__heading">
              <LibraryBig aria-hidden="true" size={18} />
              <div>
                <h2>我的收藏</h2>
                <p>{collections.length > 0 ? `${collections.length} 个条目，可拖入左侧计划` : '从收藏页添加作品后再安排'}</p>
              </div>
            </div>
          </header>

          <div className="collection-panel__filters" aria-label="收藏筛选">
            <div className="collection-panel__category-scroll">
              <Segmented
                aria-label="按类型筛选"
                options={CATEGORY_OPTIONS.map(({ label, value }) => ({ label, value }))}
                value={activeType}
                variant="borderless"
                onChange={(value) => setActiveType(value as CategoryValue)}
              />
            </div>
            <Dropdown
              menu={{
                items: STATUS_OPTIONS.map(({ label, value }) => ({ key: value, label })),
                onClick: ({ key }) => setActiveStatus(key as StatusValue),
                selectable: true,
                selectedKeys: [activeStatus],
              }}
              trigger={['click']}
            >
              <button
                aria-label={`收藏状态：${activeStatusOption.label}`}
                className={`collection-panel__status ${activeStatus !== 'all' ? 'is-active' : ''}`}
                type="button"
              >
                <Filter aria-hidden="true" size={15} />
                <span>{activeStatusOption.label}</span>
                <ChevronDown aria-hidden="true" size={14} />
              </button>
            </Dropdown>
          </div>

          <div className="collection-panel__list" aria-live="polite">
            {filteredList.length > 0 ? (
              filteredList.map((item) => {
                const itemKey = `${item.subject.source}-${item.subject.source_id}`;
                return (
                  <div className="collection-panel__item" key={itemKey}>
                    <DraggableItemWrapper id={`panel-${itemKey}`} data={item}>
                      <TimelineMediaCard
                        currentHeight={72}
                        data={item}
                        isPanel
                        transparent
                        onOpenDetail={setSelectedSubject}
                      />
                    </DraggableItemWrapper>
                  </div>
                );
              })
            ) : (
              <div className="collection-panel__empty">
                <LibraryBig aria-hidden="true" size={24} />
                <strong>{emptyMessage}</strong>
                <span>
                  {collections.length === 0
                    ? '在收藏库添加作品，它们会出现在这里。'
                    : '调整搜索词或筛选条件后再试。'}
                </span>
                {hasActiveFilters && (
                  <button type="button" onClick={resetFilters}>
                    <RotateCcw aria-hidden="true" size={14} />
                    清除筛选
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </DraggablePanel>

      <SubjectModal
        initialValues={selectedSubject}
        isOpen={selectedSubject !== null}
        onClose={() => setSelectedSubject(null)}
      />
    </>
  );
};

export default CollectionPanel;
