"use client";

import { Header } from './Header';
import { useAppTheme } from '@/components/providers/LobeProvider';

export default function ChatHeader() {
  const { primaryColor } = useAppTheme();

  return (
    <Header
      leftArea={
        <div className="flex items-center gap-3">
          <span className="nexus-brand-mark" aria-hidden="true">A</span>
          <span className="text-xl font-bold font-sans tracking-tight" style={{ color: primaryColor }}>
            AniNexus
          </span>
        </div>
      }
    />
  );
}
