import React from 'react';
import { ActionIcon, Tooltip } from '@lobehub/ui';
import { X, Tv, Film, Book, Clock } from 'lucide-react';
import { useAppTheme } from '@/components/providers/LobeProvider';
import CoverImage from '@/components/media/CoverImage';
import { getSubjectCover } from '@/lib/coverImage';
import { type BangumiItem, WatchType } from '@/services/bangumiService';

// 样式配置表 (Light/Dark 分离，物理隔离)
const CATEGORY_STYLES: Record<string, { light: string; dark: string }> = {
  Meal: {
    light: 'bg-orange-50/90 border-orange-200 text-orange-900',
    dark:  'bg-orange-500/10 border-orange-400/20 shadow-[0_0_15px_-3px_rgba(249,115,22,0.15)]'
  },
  Backlog: {
    light: 'bg-blue-50/90 border-blue-200 text-blue-900',
    dark:  'bg-blue-500/10 border-blue-400/20 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]'
  },
  Reading: {
    light: 'bg-emerald-50/90 border-emerald-200 text-emerald-900',
    dark:  'bg-emerald-500/10 border-emerald-400/20 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]'
  },
  New: {
    light: 'bg-purple-50/90 border-purple-200 text-purple-900',
    dark:  'bg-purple-500/10 border-purple-400/20 shadow-[0_0_15px_-3px_rgba(168,85,247,0.15)]'
  },
  default: {
    light: 'bg-white/90 border-gray-200 text-gray-900',
    dark:  'bg-white/5 border-white/10'
  }
};

const WATCH_TYPE_CATEGORY: Partial<Record<WatchType, keyof typeof CATEGORY_STYLES>> = {
  [WatchType.MEAL]: 'Meal',
  [WatchType.LEISURE]: 'Reading',
  [WatchType.LONG_GRASS]: 'Backlog',
  [WatchType.NEW]: 'New',
};

interface TimelineMediaCardProps {
  data: BangumiItem;
  category?: string;
  currentHeight?: number;
  onOpenDetail?: (data: BangumiItem) => void;
  onDelete?: (data: BangumiItem) => void;
  noBorder?: boolean;
  transparent?: boolean;
  width?: number;
  isPanel?: boolean;
}

const TimelineMediaCardInner = ({ data, category, currentHeight, onOpenDetail, onDelete, noBorder, transparent, isPanel }: TimelineMediaCardProps) => {
  const { isDarkMode } = useAppTheme();
  
  // --- 数据清洗 (逻辑封装在内部) ---
  const subject = data.subject;
  const title = subject.name_cn || subject.name;
  const cover = getSubjectCover(subject);
  const eps = subject.eps || 'N/A';
  
  // 计算分类样式
  const categoryKey = category || (data.watch_type && WATCH_TYPE_CATEGORY[data.watch_type]) || 'default';
  const styleConfig = CATEGORY_STYLES[categoryKey] || CATEGORY_STYLES.default;
  // 根据模式选择对应的样式字符串
  const activeStyle = isDarkMode ? styleConfig.dark : styleConfig.light;
  // 组合最终类名
  const themeClass = `
    ${transparent ? 'bg-transparent' : activeStyle}
    backdrop-blur-md
    ${noBorder || transparent ? 'border-none' : 'border'}
    ${transparent ? 'shadow-none' : 'shadow-sm hover:shadow-md'}
    ${isPanel ? 'rounded-none overflow-visible' : 'rounded-xl overflow-hidden'}
    transition-all duration-200
  `;

  // 尺寸控制逻辑
  const sizeConfig = {
    width: '100%',
    showTags: false,
    titleLines: 1,
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(data);
  };
  
  const h = currentHeight || 60; // 默认高
  const isTinyHeight = h < 40;            // 极限矮：需要缩小图标

  const iconSize = isTinyHeight ? 12 : 16;

  // 选择类别图标占位
  const getCategoryIcon = () => {
    switch (categoryKey) {
      case 'Meal': return <Tv size={iconSize} />;
      case 'Backlog': return <Film size={iconSize} />;
      case 'Reading': return <Book size={iconSize} />;
      default: return <Clock size={iconSize} />;
    }
  };

  const time = data.watch_time;
  const tooltipContent = `${title}${time ? ` - ${time}` : ''}`;

  // ==========================================
  // 2. 统一的 DOM 渲染结构
  // ==========================================
  const renderContent = () => {
    // 核心判断：如果是在 DraggablePanel 中渲染，使用宽宽度模式；否则使用窄宽度模式
    const isNarrowMode = !isPanel;

    // --- 模式 B：竖排文字模式 (在非 DraggablePanel 中渲染) ---
    if (isNarrowMode) {
      return (
        <div className="relative w-full h-full overflow-hidden group/spine">
          {/* A. 封面作为全量背景，撑满不留白 */}
          <CoverImage
            src={cover}
            alt={title}
            fill
            sizes="(max-width: 900px) 14vw, 160px"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/spine:scale-110"
            fallback={<div className={`absolute inset-0 flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>{getCategoryIcon()}</div>}
          />

          {/* B. 压黑背景遮罩，确保无论什么封面，白色文字都能看清 */}
          <div className="absolute inset-0 bg-black/40 group-hover/spine:bg-black/50 transition-colors" />

          {/* C. 居中的横排文字，根据高度自动调整行数 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-1 py-0.5 pointer-events-none">
            {/* 根据高度决定文字行数 */}
            {h > 70 ? (
              // 高度足够，显示三行文字
              <span
                className="text-white text-[10px] md:text-xs font-bold leading-tight tracking-widest opacity-95 overflow-hidden text-center line-clamp-3"
                style={{
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)', // 强阴影增加可读性
                  maxWidth: '90%', // 防止文字过长溢出格子
                }}
              >
                {title}
              </span>
            ) : h > 50 ? (
              // 高度适中，显示两行文字
              <span
                className="text-white text-[10px] md:text-xs font-bold leading-tight tracking-widest opacity-95 overflow-hidden text-center line-clamp-2"
                style={{
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)', // 强阴影增加可读性
                  maxWidth: '90%', // 防止文字过长溢出格子
                }}
              >
                {title}
              </span>
            ) : (
              // 高度不足，显示单行文字
              <span
                className="text-white text-[10px] md:text-xs font-bold leading-none tracking-widest opacity-95 overflow-hidden truncate text-center"
                style={{
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)', // 强阴影增加可读性
                  maxWidth: '90%', // 防止文字过长溢出格子
                }}
              >
                {title}
              </span>
            )}
          </div>

          {/* D. 悬浮删除按钮 (位于右侧居中) */}
          {onDelete && (
            <div className="absolute right-0 top-1/2 transform -translate-y-1/2 p-0.5 opacity-0 group-hover/spine:opacity-100 transition-opacity z-10">
              <ActionIcon
                icon={X}
                size="small"
                onClick={handleDelete}
                className="bg-black/60 text-white w-4 h-4 min-w-[16px]"
                style={{ border: 'none', color: 'white' }}
              />
            </div>
          )}
        </div>
      );
    }

    // --- 模式 A：横向图文模式 (在 DraggablePanel 中渲染) ---
    return (
      <div className="flex flex-row items-center h-full w-full overflow-hidden">
        {/* 封面：固定为 3:4 比例，靠左显示 */}
        <div className="relative h-full aspect-[3/4] flex-shrink-0 overflow-hidden rounded-[12px]">
          <CoverImage
            src={cover}
            alt={title}
            fill
            sizes="96px"
            className="w-full h-full object-cover"
            fallback={<div className={`w-full h-full flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>{getCategoryIcon()}</div>}
          />
        </div>

        {/* 文字区域：横向正常显示，内部自动截断 */}
        <div className="flex flex-col flex-1 min-w-0 justify-center px-2 py-1">
          <h3 className={`font-medium text-xs truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`} title={title}>
            {title}
          </h3>
          {h > 40 && (
             <span className="text-[10px] opacity-60 truncate mt-0.5">
               {time || (eps !== 'N/A' ? `${eps}集` : '')}
             </span>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <Tooltip title={tooltipContent}>
      <div 
        className={`group flex flex-row cursor-pointer
                    transition-all duration-300 group-hover:shadow-md z-10
                    ${themeClass}`}
        style={{ width: sizeConfig.width, height: currentHeight }}
        onClick={() => onOpenDetail?.(data)}
      >
        {renderContent()}
      </div>
    </Tooltip>
  );
};

const arePropsEqual = (prev: TimelineMediaCardProps, next: TimelineMediaCardProps) => {
  if (prev.category !== next.category) return false;
  if (prev.currentHeight !== next.currentHeight) return false;
  if (prev.noBorder !== next.noBorder) return false;
  if (prev.transparent !== next.transparent) return false;
  if (prev.width !== next.width) return false;
  if (prev.isPanel !== next.isPanel) return false;

  const prevSubject = prev.data.subject;
  const nextSubject = next.data.subject;
  if (prevSubject.source !== nextSubject.source) return false;
  if (prevSubject.source_id !== nextSubject.source_id) return false;
  if (prevSubject.name_cn !== nextSubject.name_cn) return false;
  if (prevSubject.name !== nextSubject.name) return false;
  if (prev.data.watch_time !== next.data.watch_time) return false;
  if (prev.data.watch_day !== next.data.watch_day) return false;
  if (prev.data.watch_type !== next.data.watch_type) return false;

  const prevImage = prevSubject?.images?.large;
  const nextImage = nextSubject?.images?.large;
  if (prevImage !== nextImage) return false;

  return true;
};

export const TimelineMediaCard = React.memo(TimelineMediaCardInner, arePropsEqual);
export default TimelineMediaCard;
