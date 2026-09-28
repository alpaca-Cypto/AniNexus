'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  pointerWithin,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useAppTheme } from '@/components/providers/LobeProvider';
import { ActionIcon, Button, toast } from '@lobehub/ui';
import {
  ChevronDown,
  ChevronUp,
  CalendarPlus,
  CloudSync,
  Utensils,
  Archive,
  BookOpen,
  Sparkles,
  Trash2
} from 'lucide-react';
import {
  BangumiItem as ScheduleItem,
  getBangumiCalendar,
  getBangumiConnectionStatus,
} from '@/services/bangumiService';
import {
  COLLECTIONS_UPDATED_EVENT,
  collectionService,
  type CollectionListResponse,
} from '@/services/collections';
import TimetableHeader from '@/components/header/TimetableHeader';
import TimelineBoard from '@/components/timetable/TimelineBoard';
import TimetableEmptyState from '@/components/timetable/TimetableEmptyState';
import TimetableDragGuide from '@/components/timetable/TimetableDragGuide';
import StandardLanes from '@/components/timetable/StandardLanes';
import TimelineMediaCard from '@/components/timetable/TimelineMediaCard';
import { ExportTickTickModal } from '@/components/Modal/ExportTickTickModal';
import dynamic from 'next/dynamic';
import { clearTimetableDraft } from '@/lib/timetableDraft';
import { accountService } from '@/services/account';
import { useOwnerStatus } from '@/components/auth/useOwnerStatus';
import {
  getDraggedItemKey,
  getScheduleItemKey,
  getTimetableDropPatch,
} from '@/lib/timetableDnD';
import './timetable.css';

const CollectionPanel = dynamic(() => import('@/components/timetable/DraggablePanel'), {
  ssr: false,
});



// 获取当前星期几 (0-6, 0=周一, 1=周二, ..., 6=周日)
const getCurrentDay = (): number => {
  const day = new Date().getDay();
  // 转换为 0=周一, 1=周二, ..., 6=周日
  return day === 0 ? 6 : day - 1;
};

const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 泳道配置
const SWIMLANES = [
  {
    id: 'Meal',
    title: '饭点动画',
    icon: Utensils,
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-100 dark:border-orange-800/30'
  },
  {
    id: 'Backlog',
    title: '长草动画',
    icon: Archive,
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-100 dark:border-blue-800/30'
  },
  {
    id: 'Reading',
    title: '闲暇阅读',
    icon: BookOpen,
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-100 dark:border-emerald-800/30'
  },
  {
    id: 'New',
    title: '新番时间',
    icon: Sparkles,
    color: 'text-purple-700 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-100 dark:border-purple-800/30'
  },
];

// 主页面组件
export default function WeeklyBoardPage() {
  const { isDarkMode } = useAppTheme();
  const { user, isOwner, loading: accountLoading } = useOwnerStatus();
  const currentDay = getCurrentDay();
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [collectionItems, setCollectionItems] = useState<ScheduleItem[]>([]);
  const [collectionsReady, setCollectionsReady] = useState(false);
  const [openCollectionsSignal, setOpenCollectionsSignal] = useState(0);
  const [activeDragItem, setActiveDragItem] = useState<ScheduleItem | null>(null);
  const [overSlotId, setOverSlotId] = useState<string | null>(null);
  const [isLanesCollapsed, setIsLanesCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bangumiSyncEnabled, setBangumiSyncEnabled] = useState(false);
  const [isTickTickModalOpen, setIsTickTickModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 配置传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

  useEffect(() => {
    let active = true;
    void accountService.config()
      .then((config) => { if (active) setBangumiSyncEnabled(config.bangumi_sync_enabled); })
      .catch(() => { if (active) setBangumiSyncEnabled(false); });
    return () => { active = false; };
  }, []);
  
  // 前三个分类 (Meal, Backlog, Reading)
  const standardLanes = SWIMLANES.filter(swimlane => swimlane.id !== 'New');
  
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const draggedItem = active.data.current as ScheduleItem | undefined;
    const activeKey = getDraggedItemKey(String(active.id));
    setActiveDragItem(
      draggedItem ?? scheduleItems.find((item) => getScheduleItemKey(item) === activeKey) ?? null,
    );
    setOverSlotId(null);
  };
  
  // 拖拽过程处理器
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      setOverSlotId(String(over.id));
    } else {
      setOverSlotId(null);
    }
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const draggedItem = active.data.current as ScheduleItem | undefined;
    const activeKey = getDraggedItemKey(String(active.id));
    const dropPatch = over ? getTimetableDropPatch(String(over.id)) : null;

    setOverSlotId(null);
    setActiveDragItem(null);

    if (!dropPatch) return;

    setScheduleItems((prevItems) => {
      const existingItem = prevItems.find((item) => getScheduleItemKey(item) === activeKey);
      const activeItem = existingItem ?? draggedItem ?? activeDragItem ?? undefined;
      if (!activeItem) return prevItems;
      if (!existingItem) return [...prevItems, { ...activeItem, ...dropPatch }];

      return prevItems.map((item) =>
        getScheduleItemKey(item) === activeKey ? { ...item, ...dropPatch } : item,
      );
    });
  };

  // 处理卡片删除事件
  const handleDelete = useCallback((id: string) => {
    setScheduleItems(prev => prev.filter(item => getScheduleItemKey(item) !== id));
  }, []);
  
  // 处理获取 Bangumi 日历数据
  const handleFetchBangumiCalendar = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [calendarResult, connectionResult] = await Promise.allSettled([
        getBangumiCalendar(),
        getBangumiConnectionStatus(),
      ]);
      if (calendarResult.status === 'rejected') {
        throw calendarResult.reason;
      }
      const items = calendarResult.value;
      setScheduleItems(items);
      toast.success(`已从 Bangumi 导入 ${items.length} 部本周新番`);
      if (connectionResult.status === 'fulfilled') {
        const connection = connectionResult.value;
        if (connection.configured && !connection.connected) {
          toast.warning(connection.detail || 'Bangumi Access Token 无效，当前显示公开日历');
        } else if (connection.connected && connection.username) {
          toast.info(`Bangumi 已连接：${connection.username}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bangumi 日历导入失败';
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSavedCollections = useCallback(async () => {
    const items: CollectionListResponse['items'] = [];
    let offset = 0;
    while (true) {
      const page = await collectionService.getCollections({ limit: 100, offset });
      items.push(...page.items);
      offset += page.items.length;
      if (page.items.length === 0 || offset >= page.total) break;
    }

    const savedCollections: ScheduleItem[] = items.map((item) => ({
      collection: item.collection ? {
        ...item.collection,
        source: item.subject.source,
        source_id: String(item.subject.source_id),
        user_id: 1,
      } : null,
      subject: {
        ...item.subject,
        source_id: String(item.subject.source_id),
      },
    }));
    setCollectionItems(savedCollections);
    return savedCollections;
  }, []);

  useEffect(() => {
    const refreshCollections = () => {
      void loadSavedCollections().catch(() => {
        toast.error('无法刷新我的收藏');
      }).finally(() => setCollectionsReady(true));
    };
    refreshCollections();
    window.addEventListener(COLLECTIONS_UPDATED_EVENT, refreshCollections);
    return () => window.removeEventListener(COLLECTIONS_UPDATED_EVENT, refreshCollections);
  }, [loadSavedCollections]);

  const handleSyncPersonalCalendar = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const syncResult = await collectionService.syncBgm({ subject_type: 2 });
      const personalCollections = await loadSavedCollections();

      const watchingIds = new Set(
        personalCollections
          .filter((item) => item.collection?.type === 3 && item.subject.source === 'bangumi')
          .map((item) => String(item.subject.source_id)),
      );
      const publicCalendar = await getBangumiCalendar();
      const personalCalendar = publicCalendar.filter((item) =>
        watchingIds.has(String(item.subject.source_id)),
      );
      setScheduleItems(personalCalendar);

      if (syncResult.sync_count === 0) {
        toast.info('Bangumi 账号已连接，但当前没有动画收藏');
      } else if (watchingIds.size === 0) {
        toast.info(`已同步 ${syncResult.import_count} 部动画，当前没有“在看”作品`);
      } else if (personalCalendar.length === 0) {
        toast.info(`已同步 ${watchingIds.size} 部“在看”作品，本周日历暂无匹配`);
      } else {
        toast.success(`已同步个人日历，本周匹配 ${personalCalendar.length} 部“在看”作品`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bangumi 个人收藏同步失败';
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [loadSavedCollections]);
  // 恢复浏览器中的本地草稿
  const handleRestoreDraft = useCallback((data: ScheduleItem[]) => {
    setScheduleItems(data);
    setLoadError(null);
  }, []);

  // 搜索处理函数
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);
  
  // 清空所有卡片
  const handleClearAll = useCallback(() => {
    setScheduleItems([]);
    setLoadError(null);
    if (user) clearTimetableDraft(user.id, isOwner);
    toast.success('已清空当前计划和本地草稿');
  }, [user, isOwner]);

  const openTickTickModal = useCallback(() => setIsTickTickModalOpen(true), []);
  const closeTickTickModal = useCallback(() => setIsTickTickModalOpen(false), []);
  const toggleLanesCollapse = useCallback(() => setIsLanesCollapsed(v => !v), []);

  return (
    <DndContext 
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      collisionDetection={pointerWithin}
    >
      <div className={`nexus-workspace-page timetable-page h-full flex flex-col overflow-hidden ${isDarkMode ? 'dark:bg-neutral-950' : 'bg-white'}`}>
        <div className="flex-none z-10">
          <TimetableHeader 
            userId={user?.id ?? null}
            isOwner={isOwner}
            schedules={scheduleItems}
            onRestoreDraft={handleRestoreDraft}
            onExportTickTick={openTickTickModal}
            onSearch={handleSearch}
          />
        </div>

        <TimetableDragGuide userId={user?.id ?? null} ready={!accountLoading} />

        <div className="timetable-layout flex-1 flex overflow-hidden">
          <div className="timetable-planner flex-1 flex flex-col overflow-hidden">
            <div className={`flex-none ${isDarkMode ? 'bg-gray-900' : 'bg-white'} z-20 shadow-sm`}>
              <div className={`timetable-week-header flex w-full border-b ${isDarkMode ? 'border-gray-800 bg-gray-800' : 'border-gray-100 bg-white'}`}>
                <div className="w-20"></div>
                <div className="flex-1 grid grid-cols-7">
                  {WEEK_DAYS.map((day, index) => {
                    const isToday = index === currentDay;
                    return (
                      <div 
                        key={index} 
                        className={`text-center py-3 ${isToday ? 'bg-blue-50/30' : ''}`}
                      >
                        <div className={`text-xs font-semibold uppercase tracking-widest ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>
                          {day}
                        </div>
                        {isToday && (
                          <div className="mt-1 flex justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {!isLanesCollapsed && (
                <StandardLanes 
                  standardLanes={standardLanes}
                  scheduleItems={scheduleItems}
                  isDarkMode={isDarkMode}
                  overSlotId={overSlotId}
                  activeDragItem={activeDragItem}
                  currentDay={currentDay}
                  onDelete={handleDelete}
                />
              )}

              {scheduleItems.length === 0 && (
                <TimetableEmptyState
                  bangumiSyncEnabled={bangumiSyncEnabled}
                  collectionCount={collectionItems.length}
                  collectionsReady={collectionsReady}
                  error={loadError}
                  isLoading={isLoading}
                  onBrowse={handleFetchBangumiCalendar}
                  onShowCollections={() => setOpenCollectionsSignal((value) => value + 1)}
                  onSync={handleSyncPersonalCalendar}
                />
              )}

              {scheduleItems.length > 0 && (
                <div className="timetable-actions" aria-label="追番计划操作">
                  <div className="timetable-actions__summary">
                    <strong>{scheduleItems.length}</strong>
                    <span>个计划</span>
                  </div>
                  {bangumiSyncEnabled && <div className="timetable-actions__primary">
                    <Button
                      type="primary"
                      onClick={handleSyncPersonalCalendar}
                      disabled={isLoading}
                      loading={isLoading}
                      icon={<CloudSync size={16} />}
                    >
                      同步我的在看
                    </Button>
                    <Button
                      type="text"
                      onClick={handleFetchBangumiCalendar}
                      disabled={isLoading}
                      icon={<CalendarPlus size={16} />}
                    >
                      浏览本周新番
                    </Button>
                  </div>}
                  <div className="timetable-actions__secondary">
                    <ActionIcon
                      icon={isLanesCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      title={isLanesCollapsed ? '展开生活泳道' : '收起生活泳道'}
                      onClick={toggleLanesCollapse}
                      variant="borderless"
                      size="small"
                    />
                    <ActionIcon
                      icon={<Trash2 size={16} />}
                      title="清空当前计划"
                      onClick={handleClearAll}
                      variant="borderless"
                      size="small"
                    />
                  </div>
                </div>
              )}
            </div>

            <TimelineBoard 
              scheduleItems={scheduleItems} 
              isDarkMode={isDarkMode} 
              currentDay={currentDay}
              overSlotId={overSlotId || undefined}
              activeDragItem={activeDragItem || undefined}
              onDelete={handleDelete}
              isLoading={isLoading}
              error={loadError || undefined}
            />
          </div>
          
          <CollectionPanel searchQuery={searchQuery} collections={collectionItems} openSignal={openCollectionsSignal} />
        </div>
      </div>
      
      {/* 全局悬浮残影 */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem && (
          <div
            style={{ width: '200px', height: '60px', zIndex: 9999 }}
            className="shadow-2xl opacity-90 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
          >
            <TimelineMediaCard
              data={activeDragItem}
              currentHeight={60}
            />
          </div>
        )}
      </DragOverlay>
      
      {/* 批量导出到滴答清单 Modal */}
      <ExportTickTickModal
        open={isTickTickModalOpen}
        onCancel={closeTickTickModal}
        items={scheduleItems}
      />
    </DndContext>
  );
}
