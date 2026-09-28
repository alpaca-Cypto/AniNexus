import { CalendarRange, CloudSync, Compass, PanelRightOpen } from 'lucide-react';
import Link from 'next/link';
import './timetable-empty-state.css';

interface TimetableEmptyStateProps {
  bangumiSyncEnabled: boolean;
  collectionCount: number;
  collectionsReady: boolean;
  error?: string | null;
  isLoading: boolean;
  onBrowse: () => void;
  onShowCollections: () => void;
  onSync: () => void;
}

export default function TimetableEmptyState({
  bangumiSyncEnabled,
  collectionCount,
  collectionsReady,
  error,
  isLoading,
  onBrowse,
  onShowCollections,
  onSync,
}: TimetableEmptyStateProps) {
  const hasCollections = collectionCount > 0;

  return (
    <section className="timetable-empty" aria-live="polite">
      <span className="timetable-empty__icon" aria-hidden="true">
        <CalendarRange size={24} />
      </span>
      <div className="timetable-empty__copy">
        <h2>{hasCollections ? '把右侧收藏拖进计划' : '从你的第一份追番计划开始'}</h2>
        <p>{!collectionsReady
          ? '正在读取你的收藏…'
          : hasCollections
            ? `右侧“我的收藏”已有 ${collectionCount} 个条目，按住卡片拖到上方三行或下方时间格。`
            : bangumiSyncEnabled
              ? '右侧还没有收藏。可以同步“在看”作品、浏览本周新番，或先去收藏库添加作品。'
              : '右侧还没有收藏。先去收藏库添加作品，再回到这里拖入计划。'}</p>
        {error && <p className="timetable-empty__error">{error}</p>}
      </div>
      <div className="timetable-empty__actions">
        {hasCollections ? <button className="timetable-empty__open-panel" onClick={onShowCollections} type="button"><PanelRightOpen size={16} />打开右侧收藏</button>
        : !collectionsReady ? null
        : bangumiSyncEnabled ? <>
          <button className="timetable-empty__primary" disabled={isLoading} onClick={onSync} type="button">
            <CloudSync size={16} />
            {isLoading ? '正在同步' : '同步我的在看'}
          </button>
          <button disabled={isLoading} onClick={onBrowse} type="button">
            <Compass size={16} />
            浏览本周新番
          </button>
          <Link href="/collections"><Compass size={16} />打开收藏库</Link>
        </> : <Link className="timetable-empty__primary" href="/collections"><Compass size={16} />打开收藏库</Link>}
      </div>
    </section>
  );
}
