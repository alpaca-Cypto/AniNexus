"use client";

import { theme } from 'antd';

interface HeaderProps {
  leftArea?: React.ReactNode;
  centerArea?: React.ReactNode;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ leftArea, centerArea, className = '' }) => {
  const { token } = theme.useToken();

  return (
    <div className={`workspace-toolbar h-16 flex items-center justify-between px-4 ${className}`} style={{
      borderBottom: `1px solid ${token.colorSplit}`,
      background: `rgba(${parseInt(token.colorBgContainer.slice(1, 3), 16)}, ${parseInt(token.colorBgContainer.slice(3, 5), 16)}, ${parseInt(token.colorBgContainer.slice(5, 7), 16)}, 0.8)`,
      backdropFilter: 'saturate(180%) blur(10px)',
      zIndex: 50
    }}>
      
      {/* 左侧：可变区域 (插槽) */}
      <div className="workspace-toolbar__left flex items-center gap-3 w-48">
        {leftArea}
      </div>

      {/* 中间：可变区域 (插槽) */}
      <div className="workspace-toolbar__center flex-1 flex justify-center">
        {centerArea}
      </div>

    </div>
  );
};
