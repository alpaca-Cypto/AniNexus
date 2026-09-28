"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MessageSquare, Copy, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { ChatItem } from '@lobehub/ui/chat';
import { ActionIconGroup } from '@lobehub/ui';
import type { SearchResultItem } from './SearchBar';
import ChatInput from './ChatInput';
import AssistantSidebar from './AssistantSidebar';
import CoverImage from '@/components/media/CoverImage';
import useChatStore, { Message, ToolCall } from '../../stores/useChatStore';
import { useRoleStore } from '@/store/useRoleStore';
import presetRoles from '@/store/presetRoles';
import { chatWithBackend } from '@/lib/fetcher';
import { profileService, USER_AVATAR_UPDATED_EVENT } from '@/services/profile';

const STARTER_PROMPTS = [
  '推荐三部节奏紧凑的悬疑动画',
  '帮我比较两部作品的叙事风格',
  '根据我的收藏找一部周末能看完的动画',
];

export default function ChatPage() {
  const [loading, setLoading] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  // 角色选择相关状态
  const [selectedRole, setSelectedRole] = useState('preset-1'); // 默认选择第一个预设角色
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [serverModel, setServerModel] = useState<{
    configured: boolean;
    model: string;
    provider: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const didInitializeSessionRef = useRef(false);

  // 使用聊天存储
  const {
    sessions,
    chatMessages: rawChatMessages,
    activeSessionId,
    createSession,
    sendMessage,
    updateMessage,
    switchSession,
    deleteSession,
    updateSessionTitle,
  } = useChatStore();

  // 确保 chatMessages 是一个 Map 对象
  const chatMessages = useMemo(
    () => rawChatMessages && typeof rawChatMessages.get === 'function'
      ? rawChatMessages
      : new Map<string, Message[]>(),
    [rawChatMessages],
  );

  // 确保有一个活跃会话
  useEffect(() => {
    if (didInitializeSessionRef.current) return;
    didInitializeSessionRef.current = true;
    const state = useChatStore.getState();
    if (!state.activeSessionId && state.sessions.length === 0) createSession();
  }, [activeSessionId, sessions.length, createSession]);

  useEffect(() => {
    let active = true;
    void fetch('/api/v1/assistant/config')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          configured: boolean;
          model: string;
          provider: string;
        }>;
      })
      .then((config) => {
        if (!active || !config) return;
        setServerModel(config);
        if (config.configured) {
          setSelectedModel(config.model);
          setSelectedProvider(config.provider);
        }
      })
      .catch(() => {
        if (active) setServerModel(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const handleAvatarUpdate = (event: Event) => {
      setUserAvatar((event as CustomEvent<string | null>).detail);
    };
    window.addEventListener(USER_AVATAR_UPDATED_EVENT, handleAvatarUpdate);
    void profileService.getProfile()
      .then((profile) => {
        if (active) setUserAvatar(profile.avatar_url);
      })
      .catch(() => {
        if (active) setUserAvatar(null);
      });
    return () => {
      active = false;
      window.removeEventListener(USER_AVATAR_UPDATED_EVENT, handleAvatarUpdate);
    };
  }, []);

  // 获取当前会话的消息
  const currentMessages = useMemo(
    () => activeSessionId && chatMessages && typeof chatMessages.get === 'function'
      ? chatMessages.get(activeSessionId) || []
      : [],
    [activeSessionId, chatMessages],
  );

  // 从 Store 获取所有自定义角色
  const customRoles = useRoleStore((s) => s.customRoles);

  // 处理角色选择变化
  const handleRoleChange = (roleId: string) => {
    setSelectedRole(roleId);
  };

  const handleModelChange = useCallback((modelId: string, provider: string) => {
    setSelectedModel(modelId);
    setSelectedProvider(provider);
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    const shouldCreateReplacement = sessions.length === 1;
    deleteSession(sessionId);
    if (shouldCreateReplacement) createSession();
  }, [createSession, deleteSession, sessions.length]);

  // 获取当前选中角色的详细信息
  const getSelectedRole = () => {
    // 合并预设角色和自定义角色
    const allRoles = [...presetRoles, ...customRoles];
    // 查找选中的角色
    return allRoles.find(role => role.id === selectedRole);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, loading]);

  const handleSend = async (text: string, contextItems: SearchResultItem[]) => {
    if (!text.trim() && contextItems.length === 0) return;
    if (!activeSessionId) return;
    const userMessage = {
      id: uuidv4(),
      role: 'user' as const,
      content: text || '看看这些作品',
      createdAt: new Date(),
      extra: { contextItems }
    };
    sendMessage(activeSessionId, userMessage);
    if (currentMessages.length === 0 && text.trim()) updateSessionTitle(activeSessionId, text.trim().slice(0, 18));

    const aiMessageId = uuidv4();
    sendMessage(activeSessionId, { id: aiMessageId, role: 'assistant' as const, content: '', createdAt: new Date() });
    setLoading(true);
    let answer = '';
    let reportedError = '';
    const contextText = contextItems.length
      ? `\n\n用户附带的参考作品：${contextItems.map((item) => `《${item.title}》(subject_id: ${item.subjectId})`).join('、')}`
      : '';
    const requestMessages = [
      ...currentMessages.map((message: Message) => ({ role: message.role, content: message.content })),
      { role: 'user', content: `${text || '看看这些作品'}${contextText}` },
    ];
    const selectedRoleConfig = getSelectedRole();

    try {
      await chatWithBackend({
        messages: requestMessages,
        provider: selectedProvider,
        model: selectedModel,
        temperature: selectedRoleConfig?.temperature ?? 0.7,
        prompt_config: selectedRoleConfig?.promptConfig,
        thread_id: activeSessionId,
        onMessageChunk: (chunk) => {
          answer += chunk;
          updateMessage(activeSessionId, answer, aiMessageId);
        },
        onToolStart: (name, inputs, callId) => {
          updateMessage(activeSessionId, answer, aiMessageId, {
            id: callId,
            name,
            inputs,
            status: 'running',
          });
        },
        onToolEnd: (name, output, callId) => {
          const failed = Boolean(output && typeof output === 'object' && 'error' in output);
          updateMessage(activeSessionId, answer, aiMessageId, {
            id: callId,
            name,
            output,
            status: failed ? 'error' : 'success',
          });
        },
        onError: (error) => {
          reportedError = error;
        },
      });
    } catch (error) {
      const message = reportedError || (error instanceof Error ? error.message : 'AI 助手暂时无法回答');
      updateMessage(activeSessionId, `请求失败：${message}`, aiMessageId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="assistant-layout">
      <AssistantSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onCreate={createSession}
        onDelete={handleDeleteSession}
        onSelect={switchSession}
      />

      <section className="assistant-conversation" aria-label="与 AniNexus 助手对话">
        <div className="assistant-messages">
          <div className="assistant-message-list">
            {currentMessages.length === 0 && (
              <div className="assistant-empty">
                <div className="assistant-empty__icon"><MessageSquare size={27} /></div>
                <h2>想从哪部作品聊起？</h2>
                <p>可以直接提问，也可以先引用作品，让推荐和比较更贴近你的兴趣。</p>
                <div className="assistant-empty__prompts">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button type="button" key={prompt} disabled={loading} onClick={() => handleSend(prompt, [])}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentMessages.map((msg: Message) => {
                const handleCopy = () => void navigator.clipboard.writeText(msg.content);
                const items = [
                  {
                    key: 'copy',
                    icon: Copy,
                    label: '复制',
                  },
                ];
                
                return (
                  <ChatItem
                    key={msg.id}
                    placement={msg.role === 'user' ? 'right' : 'left'}
                    message={msg.content || ' '}
                    renderMessage={(defaultMessageNode) => (
                      <div className="flex flex-col gap-2">
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="flex flex-col gap-2 mb-2">
                            {msg.toolCalls.map((tool: ToolCall) => (
                              <details key={tool.id} className="assistant-tool-call">
                                <summary>
                                  {tool.status === 'running' && <Loader2 size={16} />}
                                  {tool.status === 'success' && <CheckCircle2 size={16} />}
                                  {tool.status === 'error' && <XCircle size={16} />}
                                  {tool.status === 'running' ? `正在使用 ${tool.name}` : `${tool.name} 已完成`}
                                </summary>
                                <div className="assistant-tool-call__body">
                                  <span>输入参数</span>
                                  <pre>
                                    {typeof tool.inputs === 'string'
                                      ? tool.inputs
                                      : JSON.stringify(tool.inputs, null, 2)}
                                  </pre>
                                  {tool.output != null && (
                                    <>
                                      <span>返回结果</span>
                                      <pre>
                                        {typeof tool.output === 'string'
                                          ? tool.output
                                          : JSON.stringify(tool.output, null, 2)}
                                      </pre>
                                    </>
                                  )}
                                </div>
                              </details>
                            ))}
                          </div>
                        )}

                        {msg.content && (
                          <div className="w-full">
                            {defaultMessageNode}
                          </div>
                        )}
                        {!msg.content && loading && msg.id === currentMessages[currentMessages.length - 1]?.id && (
                          <div className="assistant-answer-loading"><Loader2 size={15} />正在整理回答</div>
                        )}
                      </div>
                    )}
                    time={msg.createdAt instanceof Date ? msg.createdAt.getTime() : Number(msg.createdAt)}
                    avatar={{
                      title: msg.role === 'user' ? '用户' : 'AniNexus',
                      avatar: msg.role === 'user' && userAvatar ? userAvatar : '/Icon.png',
                    }}
                    
                    avatarProps={{
                      size: 40,
                      style: {
                        objectFit: 'cover',
                      }
                    }}
                    messageExtra={
                      msg.role === 'user' && msg.extra?.contextItems && msg.extra.contextItems.length > 0 && (
                        <div className="assistant-reference-list">
                          {msg.extra.contextItems.map((ref) => (
                            <div className="assistant-reference" key={ref.id} title={ref.title}>
                              <span className="assistant-reference__cover"><CoverImage src={ref.cover || '/Icon.png'} alt="" fill sizes="18px" /></span>
                              <span>{ref.title}</span>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    actions={
                      <ActionIconGroup
                        items={items}
                        onActionClick={(action) => {
                          if (action.key === 'copy') {
                            handleCopy();
                          }
                        }}
                      />
                    }
                  />
                );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <ChatInput
          onSend={handleSend}
          loading={loading}
          selectedRole={selectedRole}
          onRoleChange={handleRoleChange}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          serverModel={serverModel}
        />
      </section>
    </div>
  );
}
