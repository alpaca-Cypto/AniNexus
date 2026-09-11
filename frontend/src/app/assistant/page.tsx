"use client";

import ChatPage from "@/components/chat";
import ChatHeader from "@/components/header/ChatHeader";

export default function AssistantPage() {
  return <div className="nexus-workspace-page flex h-full flex-col overflow-hidden"><ChatHeader /><ChatPage /></div>;
}
