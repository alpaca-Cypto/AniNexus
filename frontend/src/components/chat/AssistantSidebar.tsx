'use client';

import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { Session } from '@/stores/useChatStore';

interface AssistantSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onCreate: () => void;
  onDelete: (sessionId: string) => void;
  onSelect: (sessionId: string) => void;
}

const sessionDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function AssistantSidebar({
  sessions,
  activeSessionId,
  onCreate,
  onDelete,
  onSelect,
}: AssistantSidebarProps) {
  return (
    <aside className="assistant-sidebar" aria-label="助手会话">
      <div className="assistant-sidebar__heading">
        <div>
          <strong>会话</strong>
          <span>{sessions.length} 个记录</span>
        </div>
        <button type="button" onClick={onCreate} aria-label="新建会话" title="新建会话">
          <Plus size={18} />
        </button>
      </div>

      <div className="assistant-sidebar__list">
        {sessions.map((session) => (
          <div
            role="button"
            tabIndex={0}
            className="assistant-session"
            data-active={activeSessionId === session.id}
            aria-current={activeSessionId === session.id ? 'true' : undefined}
            key={session.id}
            onClick={() => onSelect(session.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onSelect(session.id);
            }}
          >
            <span className="assistant-session__copy">
              <strong>{session.title}</strong>
              <time>{sessionDateFormatter.format(new Date(session.updatedAt))}</time>
            </span>
            <button
              type="button"
              className="assistant-session__delete"
              aria-label={`删除会话：${session.title}`}
              title="删除会话"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(session.id);
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="assistant-sidebar__empty">
            <MessageSquare size={20} />
            <span>新建会话后开始提问</span>
          </div>
        )}
      </div>
    </aside>
  );
}
