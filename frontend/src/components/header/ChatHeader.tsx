"use client";

import { Header } from './Header';
import { useAppTheme } from '@/components/providers/LobeProvider';
import { Bot } from 'lucide-react';

export default function ChatHeader() {
  const { primaryColor } = useAppTheme();

  return (
    <Header
      leftArea={
        <div className="flex items-center gap-3">
          <Bot size={20} style={{ color: primaryColor }} aria-hidden="true" />
          <span className="text-xl font-bold font-sans tracking-tight" style={{ color: primaryColor }}>
            AI 动漫助手
          </span>
        </div>
      }
    />
  );
}
