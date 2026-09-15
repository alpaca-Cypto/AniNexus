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
import {
  ActionIcon,
  Button,
  Flexbox,
  Header,
  PopoverGroup,
  toast,
} from '@lobehub/ui';
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
  WatchType,
} from '@/services/bangumiService';
import {
  COLLECTIONS_UPDATED_EVENT,
  collectionService,
  type CollectionListResponse,
} from '@/services/collections';
import { DEMO_SCHEDULES } from '@/data/demoContent';
import TimetableHeader from '@/components/header/TimetableHeader';
import TimelineBoard from '@/components/timetable/TimelineBoard';
import StandardLanes from '@/components/timetable/StandardLanes';
import TimelineMediaCard from '@/components/timetable/TimelineMediaCard';
import { ExportTickTickModal } from '@/components/Modal/ExportTickTickModal';
import dynamic from 'next/dynamic';

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
  const currentDay = getCurrentDay();
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>(() => DEMO_SCHEDULES.map((item) => ({ ...item, subject: { ...item.subject } })));
  const [collectionItems, setCollectionItems] = useState<ScheduleItem[]>(() => DEMO_SCHEDULES.map((item) => ({ ...item, subject: { ...item.subject } })));
  const [activeDragItem, setActiveDragItem] = useState<ScheduleItem | null>(null);
  const [overSlotId, setOverSlotId] = useState<string | null>(null);
  const [isLanesCollapsed, setIsLanesCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const error = null;
  const [isTickTickModalOpen, setIsTickTickModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 配置传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );
  
  // 前三个分类 (Meal, Backlog, Reading)
  const standardLanes = SWIMLANES.filter(swimlane => swimlane.id !== 'New');
  
  // 辅助方法：去除ID前缀，获取真实ID
  const getRealId = (id: string) => id.replace(/^(panel-|board-|timeline-|lane-)/, '');
  
  // 拖拽开始处理器
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    
    // 首先尝试从active.data中获取拖动的项目（适用于从CollectionPanel拖动的情况）
    if (active.data && active.data.current) {
      setActiveDragItem(active.data.current as ScheduleItem);
    } else {
      // 然后尝试从scheduleItems中查找（适用于从已有泳道拖动的情况）
      const realId = getRealId(String(active.id));
      const draggedItem = scheduleItems.find(item => `${item.subject.source}-${item.subject.source_id}` === realId);
      setActiveDragItem(draggedItem || null);
    }
    
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
    
    if (typeof setOverSlotId === 'function') setOverSlotId(null);
    if (typeof setActiveDragItem === 'function') setActiveDragItem(null);

    if (!over) return;

    // 强制转换为字符串，防止因 Number 和 String 不一致导致匹配失败
    const activeIdWithPrefix = String(active.id);
    const realActiveId = getRealId(activeIdWithPrefix);
    const overId = String(over.id);

    // 在调用 setScheduleItems 之前，先将当前的 activeDragItem 状态提取到一个局部变量中
    const currentActiveItem = activeDragItem;

    setScheduleItems((prevItems) => {
      // 首先尝试从prevItems中找到activeItem（适用于从已有泳道拖动的情况）
      let activeItem = prevItems.find((item) => `${item.subject.source}-${item.subject.source_id}` === realActiveId);
      
      // 如果找不到，优先将外层的 currentActiveItem 赋值给 activeItem
      if (!activeItem) {
        activeItem = currentActiveItem || undefined;
      }
      
      // 如果还是找不到，尝试从active.data中获取（适用于从CollectionPanel拖动的情况）
      if (!activeItem && active.data && active.data.current) {
        activeItem = active.data.current as ScheduleItem;
      }
      
      if (!activeItem) return prevItems;

      let newDay = activeItem.watch_day ?? 0;
      let newTime = activeItem.watch_time || '';
      let newType = activeItem.watch_type || WatchType.NEW;
      let newDuration = activeItem.duration || 1;

      if (overId.startsWith('lane-')) {
        // 情况 A: 拖入标准泳道
        const parts = overId.split('-');
        if (parts.length >= 3) {
          const laneStr = parts[1].toUpperCase();
          newDay = parseInt(parts[2], 10);
          
          // 使用更宽松的匹配，防止 swimlane.id 格式不同导致匹配失败
          if (laneStr.includes('MEAL') || laneStr === '1') newType = WatchType.MEAL;
          else if (laneStr.includes('READING') || laneStr === '2' || laneStr.includes('LEISURE')) newType = WatchType.LEISURE;
          else if (laneStr.includes('BACKLOG') || laneStr === '3' || laneStr.includes('LONG')) newType = WatchType.LONG_GRASS;
          else if (laneStr.includes('NEW') || laneStr === '4') newType = WatchType.NEW;
          
          newTime = ''; // 移入泳道后，清空具体时间
          newDuration = 1; // 标准泳道中默认持续时间为1天
        }
      } else if (overId.includes('-') && !overId.startsWith('board-')) {
        // 情况 B: 拖入时间网格，排除拖到其他卡片上的情况
        const parts = overId.split('-');
        if (parts.length === 2) {
          const visualDay = parseInt(parts[0], 10);
          const slotIndex = parseInt(parts[1], 10);
          
          const START_HOUR = 18;
          const hour = START_HOUR + Math.floor(slotIndex / 3);
          const minute = (slotIndex % 3) * 20;
          
          let logicalDay = visualDay;
          
          // 🌟 核心跨天修正：如果落入的是深夜档(hour>=24)
          // 视觉上它属于 visualDay 的深夜，但在真实逻辑中，它的物理时间是下一天的凌晨。
          // 所以存储数据的 watch_day 必须是视觉天数 +1，才能被正确渲染在深夜档网格。
          if (hour >= 24) {
            logicalDay = (visualDay + 1) % 7;
          }
          
          newDay = logicalDay;
          const displayHour = hour >= 24 ? hour - 24 : hour;
          newTime = `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          newType = WatchType.NEW;
          newDuration = 1; // 时间网格中默认持续时间为1天
        }
      } else if (overId.startsWith('board-')) {
        // 情况 C: 拖到其他卡片上，忽略此操作
        return prevItems;
      } else {
        return prevItems;
      }

      // 检查项目是否已存在于prevItems中
      const itemExists = prevItems.some((item) => `${item.subject.source}-${item.subject.source_id}` === realActiveId);
      
      if (itemExists) {
        // 如果项目已存在，更新它
        return prevItems.map((item) =>
          `${item.subject.source}-${item.subject.source_id}` === realActiveId
            ? {
                ...item,
                watch_day: newDay,
                watch_time: newTime,
                watch_type: newType,
                duration: newDuration
              }
            : item
        );
      } else {
        // 如果项目不存在（从CollectionPanel拖动的新项），添加它
        return [
          ...prevItems,
          {
            ...activeItem,
            watch_day: newDay,
            watch_time: newTime,
            watch_type: newType,
            duration: newDuration
          }
        ];
      }
    });
  };

  // 处理卡片拉伸事件
  const handleResize = useCallback((id: string, newDay: number, newDuration: number) => {
    setScheduleItems(prev => prev.map(item => {
      if (`${item.subject.source}-${item.subject.source_id}` === id) {
        return {
          ...item,
          watch_day: newDay,
          duration: newDuration
        };
      }
      return item;
    }));
  }, []);
  
  // 处理卡片删除事件
  const handleDelete = useCallback((id: string) => {
    setScheduleItems(prev => prev.filter(item => `${item.subject.source}-${item.subject.source_id}` !== id));
  }, []);
  
  // 处理获取 Bangumi 日历数据
  const handleFetchBangumiCalendar = useCallback(async () => {
    setIsLoading(true);
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
      toast.error(error instanceof Error ? error.message : 'Bangumi 日历导入失败');
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
      });
    };
    refreshCollections();
    window.addEventListener(COLLECTIONS_UPDATED_EVENT, refreshCollections);
    return () => window.removeEventListener(COLLECTIONS_UPDATED_EVENT, refreshCollections);
  }, [loadSavedCollections]);

  const handleSyncPersonalCalendar = useCallback(async () => {
    setIsLoading(true);
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
      toast.error(error instanceof Error ? error.message : 'Bangumi 个人收藏同步失败');
    } finally {
      setIsLoading(false);
    }
  }, [loadSavedCollections]);
  // 同步数据回调
  const handleSyncData = useCallback((data: ScheduleItem[]) => {
    setScheduleItems(data);
  }, []);
  
  // 搜索处理函数
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);
  
  // 清空所有卡片
  const handleClearAll = useCallback(() => {
    setScheduleItems([]);
    localStorage.removeItem('aninexus-demo-schedules');
    toast.success('已清空当前演示日程');
  }, []);

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
      <div className={`nexus-workspace-page h-full flex flex-col overflow-hidden ${isDarkMode ? 'dark:bg-neutral-950' : 'bg-white'}`}>
        {/* 顶部 Header 区域 - 固定不滚动 */}
        <div className="flex-none z-10">
          <TimetableHeader 
            schedules={scheduleItems}
            onSyncData={handleSyncData}
            onExportTickTick={openTickTickModal}
            onSearch={handleSearch}
          />
        </div>

        {/* 主内容区域 - 包含左侧时间轴和右侧控制面板 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧内容区域 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* --- FIXED AREA --- */}
            <div className={`flex-none ${isDarkMode ? 'bg-gray-900' : 'bg-white'} z-20 shadow-sm`}>
              {/* 1. Global Week Header (Mon-Sun) */}
              <div className={`flex w-full border-b ${isDarkMode ? 'border-gray-800 bg-gray-800' : 'border-gray-100 bg-white'}`}>
                {/* 左侧空白占位符 */}
                <div className="w-20"></div>
                {/* 右侧星期表头 */}
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
              
              {/* 2. Standard Lanes (Meal, Backlog, Reading) - Static content */}
              {!isLanesCollapsed && (
                <StandardLanes 
                  standardLanes={standardLanes}
                  scheduleItems={scheduleItems}
                  isDarkMode={isDarkMode}
                  overSlotId={overSlotId}
                  activeDragItem={activeDragItem}
                  currentDay={currentDay}
                  onResize={handleResize}
                  onDelete={handleDelete}
                />
              )}

              <Header
                logo={
                  <PopoverGroup contentLayoutAnimation>
                    <Flexbox horizontal gap={4} justify="center" style={{ width: '100%' }}>
                      <Button
                        type="primary"
                        onClick={handleSyncPersonalCalendar}
                        disabled={isLoading}
                        loading={isLoading}
                        icon={<CloudSync size={16} />}
                        style={{ height: '36px' }}
                      >
                        同步我的在看
                      </Button>
                      <Button
                        type="text"
                        onClick={handleFetchBangumiCalendar}
                        disabled={isLoading}
                        icon={<CalendarPlus size={16} style={{ color: '#9333ea' }} />}
                        variant="text"
                        style={{ height: '36px' }}
                      >
                        浏览本周新番
                      </Button>
                      {/* 折叠/展开标准泳道 */}
                    </Flexbox>
                  </PopoverGroup>
                }
                actions={
                  <PopoverGroup contentLayoutAnimation>
                    <Flexbox horizontal gap={4} justify="center" style={{ width: '100%' }}>
                      {/* 清空所有卡片 */}
                      <ActionIcon
                        icon={<Trash2 size={16} />}
                        title="清空所有卡片"
                        onClick={handleClearAll}
                        variant="borderless"
                        size="small"
                      />
                      {/* 导出菜单 */}
                      <ActionIcon
                        icon={isLanesCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        title={isLanesCollapsed ? "展开标准泳道" : "折叠标准泳道"}
                        onClick={toggleLanesCollapse}
                        variant="borderless"
                        size="small"
                      />
                    </Flexbox>
                  </PopoverGroup>
                }
                className="h-12"
              />
            </div>

            {/* --- SCROLLABLE AREA (Replaced with TimelineBoard component) --- */}
            <TimelineBoard 
              scheduleItems={scheduleItems} 
              isDarkMode={isDarkMode} 
              currentDay={currentDay}
              overSlotId={overSlotId || undefined}
              activeDragItem={activeDragItem || undefined}
              onDelete={handleDelete}
              isLoading={isLoading}
              error={error || undefined}
            />
          </div>
          
          {/* 右侧可拖拽面板 */}
          <CollectionPanel searchQuery={searchQuery} collections={collectionItems} />
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
