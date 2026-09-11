"use client";

import {Header} from './Header';
import { useAppTheme } from '@/components/providers/LobeProvider';
import SearchBar from './SearchBar';
import { Button, Popover, Flexbox, toast } from '@lobehub/ui';
import { Calendar, Database, ChevronDown, Download, Upload, Share, CalendarArrowUp, ListTodo } from 'lucide-react';
import { useState, useRef } from 'react';
import { ExportCalendarModal } from '../Modal/ExportCalendarModal';
import { ExportTickTickModal } from '../Modal/ExportTickTickModal';
import { generateCalendarEvents, generateCSVString, generateVoiceCommand } from '@/services/CalendarService';
import { BangumiItem } from '@/services/bangumiService';

interface TimetableHeaderProps {
  onSearch?: (value: string) => void;
  schedules?: any[];
  onSyncData?: (data: any[]) => void;
  onExportTickTick?: () => void;
}

export default function TimetableHeader({ 
  onSearch, 
  schedules = [],
  onSyncData,
  onExportTickTick
}: TimetableHeaderProps) {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTickTickModalOpen, setIsTickTickModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);
  const [exportData, setExportData] = useState({
    subjectName: '',
    csvString: '',
    voiceCommand: ''
  });
  
  // 添加 ref 用于控制 Popover
  const syncPopoverRef = useRef<any>(null);

  const handleSaveSchedules = () => {
    setIsSyncMenuOpen(false);
    if (schedules.length === 0) {
      toast.warning('没有可保存的日程');
      return;
    }
    try {
      localStorage.setItem('aninexus-demo-schedules', JSON.stringify(schedules));
      toast.success('日程已保存到当前浏览器');
    } catch {
      toast.error('浏览器无法保存这份日程');
    }
  };

  const handleSyncData = () => {
    setIsSyncMenuOpen(false);
    try {
      const saved = localStorage.getItem('aninexus-demo-schedules');
      if (!saved) {
        toast.info('当前浏览器还没有保存过日程');
        return;
      }
      onSyncData?.(JSON.parse(saved));
      toast.success('已恢复本地日程');
    } catch {
      toast.error('本地日程数据无法读取');
    }
  };

  const handleExportCalendar = () => {
    if (schedules.length === 0) {
      toast.warning('没有可导出的日程');
      return;
    }

    // 关闭菜单
    setIsExportMenuOpen(false);

    // 使用所有日程项
    const bangumiItems = schedules as BangumiItem[];
    const subjectName = `动画日程 (共${bangumiItems.length}项)`;

    // 生成日历事件
    const events = generateCalendarEvents(bangumiItems);
    const csvString = generateCSVString(events);
    
    // 为所有项目生成语音指令
    const voiceCommands = bangumiItems.map(item => generateVoiceCommand(item));
    const voiceCommand = voiceCommands.length > 0 ? voiceCommands.join('\n\n') : '提醒我看动画';

    // 设置导出数据
    setExportData({
      subjectName,
      csvString,
      voiceCommand
    });

    // 打开Modal
    setIsExportModalOpen(true);
  };

  const handleExportTickTick = () => {
    if (schedules.length === 0) {
      toast.warning('没有可导出的日程');
      return;
    }

    // 关闭菜单
    setIsExportMenuOpen(false);

    // 调用父组件传递的回调函数
    onExportTickTick?.();
  };
  const { primaryColor } = useAppTheme();
  // 搜索框使用SearchBar组件内部的状态管理和防抖功能

  return (
    <div className="w-full">
      <Header
        leftArea={
          <div className="flex items-center gap-3">
            <Calendar size={20} style={{ color: primaryColor }} />
            <span className="text-xl font-bold font-sans tracking-tight" style={{ color: primaryColor }}>
              动画时间表
            </span>
          </div>
        }
        centerArea={
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* 数据同步菜单 */}
            <Popover
              ref={syncPopoverRef}
              arrow={false}
              placement="bottomLeft"
              open={isSyncMenuOpen}
              onOpenChange={setIsSyncMenuOpen}
              content={
                <Flexbox gap={6} style={{ minWidth: 160, padding: '8px' }}>
                  <div
                    style={{
                      color: 'var(--lobe-color-text-3)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                      padding: '4px 8px',
                      textTransform: 'uppercase',
                    }}
                  >
                    本地数据
                  </div>
                  <Flexbox
                    horizontal
                    align="center"
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      transition: 'all 0.2s',
                    }}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={handleSaveSchedules}
                  >
                    <Download size={16} style={{ marginRight: 10 }} />
                    <span style={{ flex: 1, fontSize: 14 }}>保存到浏览器</span>
                  </Flexbox>
                  <Flexbox
                    horizontal
                    align="center"
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      transition: 'all 0.2s',
                    }}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={handleSyncData}
                  >
                    <Upload size={16} style={{ marginRight: 10 }} />
                    <span style={{ flex: 1, fontSize: 14 }}>恢复本地日程</span>
                  </Flexbox>
                </Flexbox>
              }
            >
              <Button icon={<Database size={16} />} style={{ gap: 6 }} type="text">
                本地数据
                <ChevronDown size={14} style={{ opacity: 0.6 }} />
              </Button>
            </Popover>

            {/* 导出分享菜单 */}
            <Popover
              arrow={false}
              placement="bottomLeft"
              open={isExportMenuOpen}
              onOpenChange={setIsExportMenuOpen}
              content={
                <Flexbox gap={6} style={{ minWidth: 160, padding: '8px' }}>
                  <div
                    style={{
                      color: 'var(--lobe-color-text-3)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                      padding: '4px 8px',
                      textTransform: 'uppercase',
                    }}
                  >
                    导出日程
                  </div>
                  <Flexbox
                    horizontal
                    align="center"
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      transition: 'all 0.2s',
                    }}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={handleExportCalendar}
                  >
                    <CalendarArrowUp size={16} style={{ marginRight: 10 }} />
                    <span style={{ flex: 1, fontSize: 14 }}>导出到日历</span>
                  </Flexbox>
                  <Flexbox
                    horizontal
                    align="center"
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      transition: 'all 0.2s',
                    }}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={handleExportTickTick}
                  >
                    <ListTodo size={16} style={{ marginRight: 10 }} />
                    <span style={{ flex: 1, fontSize: 14 }}>导出至滴答清单</span>
                  </Flexbox>
                </Flexbox>
              }
            >
              <Button icon={<Share size={16} />} style={{ gap: 6 }} type="text">
                导出数据
                <ChevronDown size={14} style={{ opacity: 0.6 }} />
              </Button>
            </Popover>

            <div style={{ marginLeft: 'auto' }}>
              <SearchBar 
                placeholder="搜索时间表..." 
                enableShortKey 
                shortKey="k"
                onSearch={onSearch}
                debounceDelay={500}
                // 建议加上 allowClear 方便用户一键清除
                allowClear 
                style={{ width: 240 }}
              />
            </div>
          </div>
        }
      />
      
      <ExportCalendarModal
        open={isExportModalOpen}
        onCancel={() => setIsExportModalOpen(false)}
        subjectName={exportData.subjectName}
        csvString={exportData.csvString}
        voiceCommand={exportData.voiceCommand}
      />
      
      <ExportTickTickModal
        open={isTickTickModalOpen}
        onCancel={() => setIsTickTickModalOpen(false)}
        items={schedules as BangumiItem[]}
      />
    </div>
  );
}
