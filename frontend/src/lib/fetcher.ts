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
  onToolStart?: (name: string, inputs: unknown) => void;
  onToolEnd?: (name: string, output: unknown) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

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
  const config = providers[provider];
  if (!config?.apiKey) throw new Error(`请先在设置中填写 ${provider} 的 API Key`);

  const response = await fetch("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": config.apiKey, "X-Provider-Endpoint": config.endpoint || "" },
    body: JSON.stringify({ messages, model, temperature, prompt_config, thread_id }),
  });
  if (!response.ok) throw new Error(`聊天请求失败: ${response.status}`);
  if (!response.body) throw new Error("聊天服务没有返回内容");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
        if (event.type === "message_chunk" && typeof event.data.content === "string") onMessageChunk?.(event.data.content);
        if (event.type === "tool_start" && name) onToolStart?.(name, event.data.inputs);
        if (event.type === "tool_end" && name) onToolEnd?.(name, event.data.output);
        if (event.type === "error" && typeof event.data.detail === "string") onError?.(event.data.detail);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  onComplete?.();
}

export async function fetchChatHistory(threadId: string): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
  const token = localStorage.getItem("token");
  const response = await fetch(`/api/v1/chat/history?thread_id=${encodeURIComponent(threadId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) return [];
  const data = await response.json() as { messages?: Array<{ role: "user" | "assistant" | "system"; content: string }> };
  return data.messages || [];
}
