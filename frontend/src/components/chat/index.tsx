"use client";

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
// 1. 引入图标并重命名，防止命名冲突
import { Plus, Trash2, MessageSquare, Copy, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { theme } from 'antd';
import { ChatItem } from '@lobehub/ui/chat';
import { ActionIcon, ActionIconGroup, DraggablePanel, Avatar } from '@lobehub/ui';
import { useAppTheme } from '@/components/providers/LobeProvider';
import type { SearchResultItem } from './SearchBar';
import ChatInput from './ChatInput';
import useChatStore, { Message, ToolCall } from '../../stores/useChatStore';
import { useRoleStore } from '@/store/useRoleStore';
import presetRoles from '@/store/presetRoles';

export default function ChatPage() {
  const [loading, setLoading] = useState(false);
  // 角色选择相关状态
  const [selectedRole, setSelectedRole] = useState('preset-1'); // 默认选择第一个预设角色

  const { token } = theme.useToken();
  const { isDarkMode } = useAppTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  const chatMessages = rawChatMessages && typeof rawChatMessages.get === 'function' 
    ? rawChatMessages 
    : new Map();

  // 确保有一个活跃会话
  useEffect(() => {
    if (!activeSessionId && sessions.length === 0) {
      createSession();
    }
  }, [activeSessionId, sessions.length, createSession]);

  // 获取当前会话的消息
  const currentMessages = activeSessionId && chatMessages && typeof chatMessages.get === 'function' 
    ? chatMessages.get(activeSessionId) || [] 
    : [];

  // 从 Store 获取所有自定义角色
  const customRoles = useRoleStore((s) => s.customRoles);

  // 处理角色选择变化
  const handleRoleChange = (roleId: string) => {
    setSelectedRole(roleId);
  };

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
    await new Promise((resolve) => setTimeout(resolve, 220));

    const roleName = getSelectedRole()?.name || 'AniNexus 助手';
    const related = contextItems.length ? `你附带了 ${contextItems.map((item) => `《${item.title}》`).join('、')}。` : '';
    const answer = `${related}这是 ${roleName} 的前端演示回复。当前版本不会发送网络请求，你可以继续测试会话、角色切换、作品引用和消息布局。${text.trim() ? `\n\n关于“${text.trim()}”，接入内容数据后，这里会展示对应的推荐理由、题材对比和观看建议。` : ''}`;
    updateMessage(activeSessionId, answer, aiMessageId);
    setLoading(false);
  };

  return (
    <div 
      className="flex-1 flex min-h-0 w-full relative overflow-hidden"
      style={{ background: 'transparent' }} 
    >
      {/* 侧边栏：会话列表 */}
      <DraggablePanel
        defaultExpand={true}
        expandable={true}
        minWidth={200}
        mode="fixed"
        pin={true}
        placement="left"
        showBorder={true}
        style={{
          background: isDarkMode ? '#1e1e1e' : '#ffffff',
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16 }}>
          {/* 侧边栏标题和新建按钮 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>会话</h3>
            <ActionIcon 
              icon={Plus} 
              title="新建会话" 
              onClick={createSession}
              style={{ cursor: 'pointer' }}
            />
          </div>

          {/* 会话列表 */}
          <div style={{ flex: 1, overflowY: 'auto', gap: 8, display: 'flex', flexDirection: 'column' }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  backgroundColor: activeSessionId === session.id 
                    ? (isDarkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 0.8)')
                    : 'transparent',
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                  transition: 'all 0.2s ease',
                }}
                onClick={() => switchSession(session.id)}
              >
                <div style={{ flex: 1, marginRight: 8 }}>
                  <div style={{ fontWeight: '500', fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {session.title}
                  </div>
                  <div style={{ fontSize: 12, color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                    {new Date(session.updatedAt).toLocaleString()}
                  </div>
                </div>
                <ActionIcon 
                  icon={Trash2} 
                  title="删除会话" 
                  size={16}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.id);
                  }}
                  style={{ color: isDarkMode ? '#ef4444' : '#dc2626', cursor: 'pointer' }}
                />
              </div>
            ))}

            {/* 空会话提示 */}
            {sessions.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                <MessageSquare size={24} style={{ margin: '0 auto 8px' }} />
                <p>没有会话</p>
                <p style={{ fontSize: 12 }}>点击上方按钮创建新会话</p>
              </div>
            )}
          </div>
        </div>
      </DraggablePanel>

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        <div 
          className="flex-1 overflow-y-auto p-4"
          style={{ paddingBottom: 200 }} 
        >
          <div className="max-w-3xl mx-auto space-y-6">
            
              {/* 显示空消息提示 */}
              {currentMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: 48, color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                  <MessageSquare size={32} style={{ margin: '0 auto 16px' }} />
                  <p style={{ fontSize: 16, marginBottom: 8 }}>没有消息</p>
                  <p style={{ fontSize: 14 }}>开始与 AniNexus 聊天吧</p>
                </div>
              )}

              {/* 显示消息列表 */}
              {currentMessages.length > 0 && currentMessages.map((msg: Message) => {
                // 复制功能处理
                const handleCopy = () => {
                  navigator.clipboard.writeText(msg.content);
                };
                
                // 定义actions项目
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
                    
                    // 1. 核心修复：这里必须老老实实传纯字符串，为空时传个空格占位，防止 LobeHub 报错
                    message={msg.content || ' '}
                    
                    // 2. 魔法在这里：使用 renderMessage 劫持内部渲染逻辑
                    // 这里的 defaultMessageNode 已经是 LobeHub 帮你用 Markdown 渲染好的 React 节点了
                    renderMessage={(defaultMessageNode) => (
                      <div className="flex flex-col gap-2">
                        
                        {/* === A. 在上方渲染大模型的“工具调用/思考过程” === */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="flex flex-col gap-2 mb-2">
                            {msg.toolCalls.map((tool: ToolCall) => (
                              <details
                                key={tool.id}
                                className="bg-black/5 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm overflow-hidden"
                              >
                                <summary className="cursor-pointer select-none p-2 font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-2">
                                  {tool.status === 'running' && <Loader2 className="animate-spin" size={16} />}
                                  {tool.status === 'success' && <CheckCircle2 size={16} />}
                                  {tool.status === 'error' && <XCircle size={16} />}
                                  {tool.status === 'running' ? `正在调用工具: ${tool.name}...` : `调用完毕: ${tool.name}`}
                                </summary>
                                
                                <div className="p-3 bg-black/5 dark:bg-white/5 border-t border-gray-200 dark:border-gray-800">
                                  <div className="text-xs text-gray-500 mb-1">输入参数:</div>
                                  <pre className="text-xs overflow-x-auto bg-white dark:bg-black/50 p-2 rounded mt-2 font-mono whitespace-pre-wrap">
                                    {/* 修复可能出现的参数二次 stringify 问题 */}
                                    {typeof tool.inputs === 'string'
                                      ? tool.inputs
                                      : JSON.stringify(tool.inputs, null, 2)}
                                  </pre>
                                  {tool.output != null && (
                                    <>
                                      <div className="text-xs text-gray-500 mb-1 mt-3">返回结果:</div>
                                      <pre className="text-xs overflow-x-auto bg-white dark:bg-black/50 p-2 rounded mt-2 font-mono whitespace-pre-wrap">
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

                        {/* === B. 在下方渲染正常的正文 === */}
                        {/* 只有当正文有内容时才渲染，避免出现一个空的气泡块 */}
                        {msg.content && (
                          <div className="w-full">
                            {defaultMessageNode}
                          </div>
                        )}
                        
                      </div>
                    )}
                    
                    time={msg.createdAt instanceof Date ? msg.createdAt.getTime() : Number(msg.createdAt)}
                    
                    // 使用图标作为头像
                    avatar={{
                      title: msg.role === 'user' ? '用户' : 'AniNexus',
                      avatar: '/Icon.png',
                    }}
                    
                    avatarProps={{
                      size: 40,
                      style: {
                        imageRendering: 'auto',
                        WebkitFontSmoothing: 'antialiased',
                        objectFit: 'cover',
                        backgroundColor: msg.role === 'user' ? token.colorWarning : undefined,
                      }
                    }}
                    
                    // 🌟 优化点 1: 将引用胶囊移到 messageExtra，作为消息的附件显示
                    messageExtra={
                      msg.role === 'user' && msg.extra?.contextItems && msg.extra.contextItems.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          {msg.extra.contextItems.map((ref) => (
                            <div
                              key={ref.id}
                              title={ref.title}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                borderRadius: 16,
                                // 使用与输入框一致的毛玻璃与半透明质感
                                backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(229, 231, 235, 0.6)',
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'}`,
                                backdropFilter: 'saturate(180%) blur(12px)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(75, 85, 99, 0.6)' : 'rgba(229, 231, 235, 0.9)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(229, 231, 235, 0.6)';
                                e.currentTarget.style.transform = 'translateY(0)';
                              }}
                              onClick={() => {
                                // 如果胶囊有链接，可以在这里处理跳转逻辑
                                // if (ref.url) window.open(ref.url, '_blank');
                              }}
                            >
                              {/* 🌟 优化点 2: 使用 Avatar 组件替代原生 img，自带 fallback 和统一尺寸管理 */}
                              <Avatar
                                size={18}
                                avatar={ref.cover || '/Icon.png'}
                                style={{ borderRadius: 4, objectFit: 'cover' }}
                              />
                              {/* 🌟 优化点 3: 添加文本截断，防止超长标题撑爆气泡 */}
                              <span style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: isDarkMode ? '#e5e7eb' : '#374151',
                                maxWidth: 180,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {ref.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    
                    // 🌟 优化点 4: 让 actions 纯粹只保留复制等操作按钮
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

              {/* 修复：只有当消息列表最后一条不是 assistant 角色时，才显示 Loading 气泡 */}
              {loading && currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role !== 'assistant' && (
                <ChatItem
                  placement="left"
                  loading={true}
                  
                  // 使用图标作为头像，避免 Image 组件警告
                  avatar={{ 
                    title: 'AniNexus',
                    avatar: '/Icon.png',
                  }}
                  
                  avatarProps={{
                    size: 40,
                  }}
                  
                  // 添加actions接口
                  actions={
                    <ActionIconGroup
                      items={[]}
                    />
                  }
                />
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <ChatInput
            onSend={handleSend}
            loading={loading}
            selectedRole={selectedRole}
            onRoleChange={handleRoleChange}
          />
        </div>
      </div>
  );
}
