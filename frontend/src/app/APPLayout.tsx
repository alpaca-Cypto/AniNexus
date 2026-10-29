"use client";

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { theme } from 'antd';
import { ToastHost } from '@lobehub/ui';
import { SiteHeader } from '@/components/navigation/SiteHeader';
import { useAppTheme } from '@/components/providers/LobeProvider';

export interface APPLayoutProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}


export const APPLayout = ({
  children,
  className,
  maxWidth = 'xl',
  padding = 'md'
}: APPLayoutProps) => {
  const pathname = usePathname();

  const { token } = theme.useToken();
  const { isDarkMode } = useAppTheme();
  const isPublicPreview = pathname.startsWith('/preview');
  
  // 判断是否为聊天页面，逻辑覆盖根路径和包含 /chat 的路径
  const isFullScreenPage = isPublicPreview || pathname === '/' || pathname.startsWith('/subjects/') || pathname === '/assistant' || pathname === '/collections' || pathname === '/timetable' || pathname === '/updates' || pathname.startsWith('/personal');

  // 样式映射表
  const paddingMap: Record<string, string> = {
    none: '0',
    sm: '16px',
    md: '24px',
    lg: '32px'
  };

  const maxWidthMap: Record<string, string> = {
    sm: '384px',
    md: '448px',
    lg: '512px',
    xl: '576px',
    '2xl': '672px',
    full: '100%'
  };

  // 普通页面的内联样式计算
  const contentStyle = {
    width: '100%',
    maxWidth: maxWidthMap[maxWidth] || '576px',
    padding: paddingMap[padding] || '24px',
    margin: '0 auto',
  };

  return (
    <div className={isPublicPreview ? 'aninexus-preview-shell' : 'aninexus-shell'} data-mode={isDarkMode ? 'dark' : 'light'} style={{ background: token.colorBgLayout, color: token.colorTextBase }}>
      {!isPublicPreview && <SiteHeader />}
      <div className="aninexus-stage">
        
        <main className="aninexus-main" style={{ overflow: 'hidden' }}>
          {isFullScreenPage ? (
            // ✅ 全屏模式：无 Padding，无默认滚动，高度 100%
            // 这时候你的 CollectionPage 就必须自己写 flex flex-col 和 overflow-y-auto
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              {children}
            </div>
          ) : (
            // ❌ 普通文档模式（设置页等）：有 Padding，Layout 负责滚动
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={contentStyle} className={className}>
                {children}
              </div>
            </div>
          )}
        </main>
      </div>
      {!isPublicPreview && (
        <footer style={{ flexShrink: 0, padding: '6px 12px', textAlign: 'center', fontSize: 12, color: token.colorTextSecondary }}>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
            皖ICP备2026037333号
          </a>
        </footer>
      )}
      <ToastHost />
    </div>
  );
};

export default APPLayout;
