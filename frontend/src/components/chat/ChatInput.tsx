"use client";

import { useState } from 'react';
import { Eraser, X } from 'lucide-react';
import { ChatInputArea, ChatInputActionBar, ChatSendButton } from '@lobehub/ui/chat';
import { ActionIcon, toast } from '@lobehub/ui';
import CoverImage from '@/components/media/CoverImage';
import { RoleSelector } from './RoleSelector';
import { ModelSelector } from './ModelSelector';
import SearchTrigger, { SearchResultItem } from './SearchBar';

interface ChatInputProps {
  onSend: (text: string, contextItems: SearchResultItem[]) => void;
  loading: boolean;
  selectedRole: string;
  onRoleChange: (roleId: string) => void;
  selectedModel: string;
  onModelChange: (modelId: string, provider: string) => void;
  serverModel?: { configured: boolean; model: string; provider: string } | null;
}

export const ChatInput = ({
  onSend,
  loading,
  selectedRole,
  onRoleChange,
  selectedModel,
  onModelChange,
  serverModel,
}: ChatInputProps) => {
  const [isExpand, setIsExpand] = useState(false);
  const [text, setText] = useState('');
  const [contextItems, setContextItems] = useState<SearchResultItem[]>([]);
  const heights = {
    inputHeight: 160, 
    minHeight: 128,
    maxHeight: 600, 
  };

  // 处理搜索结果选择
  const handleSearchSelect = (item: SearchResultItem) => {
    // 去重：检查是否已经存在相同的项
    const isDuplicate = contextItems.some(
      existingItem => existingItem.id === item.id
    );
    
    if (!isDuplicate) {
      setContextItems(prev => [...prev, item]);
    }
  };

  // 处理胶囊删除
  const handleRemoveContextItem = (index: number) => {
    setContextItems(prev => prev.filter((_, i) => i !== index));
  };

  // 处理发送
  const handleSend = () => {
    if (!text.trim() && contextItems.length === 0) return;
    
    onSend(text, contextItems);
    // 清空文本和胶囊
    setText('');
    setContextItems([]);
  };

  // 处理清除
  const handleClear = () => {
    setText('');
    setContextItems([]);
  };

  return (
    <div className="assistant-composer">
      <div className="assistant-composer__inner">
        {contextItems.length > 0 && (
          <div className="assistant-composer__contexts">
            {contextItems.map((item, index) => (
              <div className="assistant-context-chip" key={item.id}>
                <span className="assistant-context-chip__cover">
                  <CoverImage src={item.cover || '/Icon.png'} alt="" fill sizes="24px" />
                </span>
                <span>{item.title}</span>
                <button type="button" onClick={() => handleRemoveContextItem(index)} aria-label={`移除引用：${item.title}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <ChatInputArea
          topAddons={
            <ChatInputActionBar
              leftAddons={
                <div className="assistant-composer__tools">
                  <ModelSelector
                    value={selectedModel}
                    onChange={onModelChange}
                    onOpenSettings={() => toast.info('请从右上角头像菜单打开“API管理”配置模型')}
                    serverModel={serverModel}
                  />
                  <RoleSelector 
                    value={selectedRole} 
                    onChange={onRoleChange} 
                  />
                  <SearchTrigger onSelect={handleSearchSelect} />
                  <ActionIcon icon={Eraser} title="清除" onClick={handleClear} style={{ cursor: 'pointer' }} />
                </div>
              }
            />
          }
          bottomAddons={<ChatSendButton loading={loading} onSend={handleSend} />}
          expand={isExpand}
          setExpand={setIsExpand}
          heights={heights}
          value={text}
          onInput={setText}
          onSend={handleSend}
          placeholder="可以问剧情、制作团队、推荐，或比较两部作品…"
          className="assistant-composer__box"
        />
      </div>
    </div>
  );
};

export default ChatInput;
