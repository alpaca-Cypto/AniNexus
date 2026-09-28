'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, GripVertical, MousePointer2, Play, X } from 'lucide-react';
import './timetable-drag-guide.css';

type GuidePhase = 'closed' | 'playing' | 'choice';

interface TimetableDragGuideProps {
  userId: number | null;
  ready: boolean;
}

const GUIDE_KEY = 'aninexus-timetable-drag-guide-v1';

export default function TimetableDragGuide({ userId, ready }: TimetableDragGuideProps) {
  const [phase, setPhase] = useState<GuidePhase>('closed');
  const [run, setRun] = useState(0);
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const audience = userId ?? 'guest';
  const seenKey = `${GUIDE_KEY}:seen:${audience}`;
  const disabledKey = `${GUIDE_KEY}:disabled:${audience}`;

  useEffect(() => {
    if (!ready) return;
    try {
      if (sessionStorage.getItem(seenKey) || localStorage.getItem(disabledKey)) return;
    } catch {
      // The guide still works when browser storage is unavailable.
    }
    const timer = window.setTimeout(() => {
      try { sessionStorage.setItem(seenKey, '1'); } catch { /* Storage is optional. */ }
      setRun((value) => value + 1);
      setPhase('playing');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, seenKey, disabledKey]);

  useEffect(() => {
    if (phase !== 'playing') return;
    skipButtonRef.current?.focus();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setPhase('choice'), reduceMotion ? 900 : 3900);
    return () => window.clearTimeout(timer);
  }, [phase, run]);

  useEffect(() => {
    if (phase === 'choice') keepButtonRef.current?.focus();
  }, [phase]);

  const replay = () => {
    try { sessionStorage.setItem(seenKey, '1'); } catch { /* Storage is optional. */ }
    setRun((value) => value + 1);
    setPhase('playing');
  };

  const finish = (disableAutomatic: boolean) => {
    try {
      if (disableAutomatic) localStorage.setItem(disabledKey, '1');
      else localStorage.removeItem(disabledKey);
    } catch { /* The replay button remains available. */ }
    setPhase('closed');
  };

  return <>
    <div className="timetable-guide-bar">
      <span>把收藏拖到想看的日期和时间</span>
      <button aria-label="重播拖拽演示" onClick={replay} type="button"><Play aria-hidden="true" size={14} />观看拖拽演示</button>
    </div>

    {phase !== 'closed' && <div className="timetable-guide-backdrop">
      <section aria-describedby="timetable-guide-description" aria-labelledby="timetable-guide-title" aria-modal="true" className="timetable-guide-dialog" role="dialog">
        <div className="timetable-guide-heading">
          <div>
            <span className="timetable-guide-eyebrow">拖拽指南</span>
            <h2 id="timetable-guide-title">把收藏放进追番计划</h2>
          </div>
          {phase === 'playing' && <button aria-label="跳过动画" className="timetable-guide-close" onClick={() => setPhase('choice')} ref={skipButtonRef} type="button"><X size={18} /></button>}
        </div>
        <p id="timetable-guide-description">从右侧「我的收藏」按住卡片，拖到左侧计划中的日期或时间格。下面只演示操作，不会添加任何日程。</p>

        <div aria-hidden="true" className={`timetable-guide-scene ${phase === 'choice' ? 'is-complete' : ''}`} key={run}>
          <div className="timetable-guide-source"><span>我的收藏</span><div className="timetable-guide-source-placeholder"><GripVertical size={17} />已收藏作品</div></div>
          <ArrowRight className="timetable-guide-arrow" size={24} />
          <div className="timetable-guide-target"><span>周三 · 20:00</span><div className="timetable-guide-target-slot">拖到这里</div></div>
          <div className="timetable-guide-ghost"><GripVertical size={17} /><span>已收藏作品</span><MousePointer2 className="timetable-guide-cursor" size={21} /></div>
        </div>

        {phase === 'playing' ? <p aria-live="polite" className="timetable-guide-status">正在演示拖拽…</p> : <div className="timetable-guide-choice">
          <p>以后打开追番计划时，还要自动演示吗？</p>
          <div>
            <button className="timetable-guide-keep" onClick={() => finish(false)} ref={keepButtonRef} type="button">下次继续演示</button>
            <button className="timetable-guide-disable" onClick={() => finish(true)} type="button">不再自动演示</button>
          </div>
          <small>无论选择哪项，都可以随时点「观看拖拽演示」重播。</small>
        </div>}
      </section>
    </div>}
  </>;
}
