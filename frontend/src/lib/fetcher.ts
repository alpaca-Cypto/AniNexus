import { useApiStore } from "@/store/useApiStore";

interface PromptConfig { persona: string; tone: string; rules: string; }
interface ChatMessage { role: string; content: string; }
interface StreamEvent { type: string; data: Record<string, unknown>; }

interface ChatWithBackendOptions {
  messages: ChatMessage[];
  provider: string;
  model?: string;
  temperature?: number;
  prompt_config?: PromptConfig;
  thread_id?: string;
  onMessageChunk?: (chunk: string) => void;
  onToolStart?: (name: string, inputs: unknown, callId: string) => void;
  onToolEnd?: (name: string, output: unknown, callId: string) => void;
  onError?: (error: string) => void;
  onComplete?: (threadId?: string) => void;
}

const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  yi: 'https://api.lingyiwanwu.com/v1',
  stepfun: 'https://api.stepfun.com/v1',
  ollama: 'http://localhost:11434/v1',
  groq: 'https://api.groq.com/openai/v1',
  perplexity: 'https://api.perplexity.ai',
  mistral: 'https://api.mistral.ai/v1',
};

function parseSSE(text: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  let type = "message";
  let data = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
    else if (!line && data) {
      try { events.push({ type, data: JSON.parse(data) as Record<string, unknown> }); } catch { /* Ignore malformed server events. */ }
      type = "message"; data = "";
    }
  }
  return events;
}

export async function chatWithBackend({
  messages, provider, model = "gpt-3.5-turbo", temperature = 0.7,
  prompt_config, thread_id, onMessageChunk, onToolStart, onToolEnd, onError, onComplete,
}: ChatWithBackendOptions) {
  const providers = useApiStore.getState().config as Record<string, { apiKey?: string; endpoint?: string }>;
  const config = providers[provider] as { apiKey?: string; endpoint?: string; proxyUrl?: string } | undefined;
  const endpoint = config?.proxyUrl || config?.endpoint || DEFAULT_ENDPOINTS[provider] || '';

  const response = await fetch("/api/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": config?.apiKey || '',
      "X-Provider-Endpoint": endpoint,
    },
    body: JSON.stringify({ messages, provider, model, temperature, prompt_config, thread_id }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(error?.detail || `聊天请求失败: ${response.status}`);
  }
  if (!response.body) throw new Error("聊天服务没有返回内容");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError = '';
  let completedThreadId: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventText = buffer.slice(0, boundary + 2);
      buffer = buffer.slice(boundary + 2);
      for (const event of parseSSE(eventText)) {
        const name = typeof event.data.name === "string" ? event.data.name : "";
        const callId = typeof event.data.id === "string" ? event.data.id : `${name}-${Date.now()}`;
        if (event.type === "message_chunk" && typeof event.data.content === "string") onMessageChunk?.(event.data.content);
        if (event.type === "tool_start" && name) onToolStart?.(name, event.data.inputs, callId);
        if (event.type === "tool_end" && name) onToolEnd?.(name, event.data.output, callId);
        if (event.type === "done" && typeof event.data.thread_id === "string") completedThreadId = event.data.thread_id;
        if (event.type === "error" && typeof event.data.detail === "string") {
          streamError = event.data.detail;
          onError?.(streamError);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (streamError) throw new Error(streamError);
  onComplete?.(completedThreadId);
}

export async function fetchChatHistory(threadId: string): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
  const response = await fetch(`/api/v1/chat/history?thread_id=${encodeURIComponent(threadId)}`);
  if (!response.ok) return [];
  const data = await response.json() as { messages?: Array<{ role: "user" | "assistant" | "system"; content: string }> };
  return data.messages || [];
}
