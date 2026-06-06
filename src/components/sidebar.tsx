"use client";

import { useState, useEffect } from "react";

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  starred: boolean;
}

const STORAGE_KEY = "ai-pm-agent-conversations";
const ACTIVE_KEY = "ai-pm-agent-active-id";
const MESSAGES_PREFIX = "ai-pm-agent-msgs-";

export function getConvMessages(id: string): any[] {
  try {
    const raw = localStorage.getItem(MESSAGES_PREFIX + id);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConvMessages(id: string, messages: any[]) {
  const nonSystem = messages.filter((m: any) => m.role !== "system");
  try {
    localStorage.setItem(MESSAGES_PREFIX + id, JSON.stringify(nonSystem));
  } catch {}
}

export function getConversations(): ConversationMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(list: ConversationMeta[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function getActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function createConversation(title: string): string {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const meta: ConversationMeta = { id, title, createdAt: now, lastMessageAt: now, starred: false };
  const list = [meta, ...getConversations()];
  saveConversations(list);
  setActiveId(id);
  return id;
}

export function updateConversation(id: string, updates: Partial<ConversationMeta>) {
  const list = getConversations().map((c) => (c.id === id ? { ...c, ...updates } : c));
  saveConversations(list);
}

export function toggleStar(id: string) {
  const list = getConversations().map((c) =>
    c.id === id ? { ...c, starred: !c.starred } : c
  );
  saveConversations(list);
}

export function deleteConversation(id: string) {
  const list = getConversations().filter((c) => c.id !== id);
  saveConversations(list);
  try {
    localStorage.removeItem(MESSAGES_PREFIX + id);
  } catch {}
  if (getActiveId() === id) {
    setActiveId(list[0]?.id || null);
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Sidebar({
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [list, setList] = useState<ConversationMeta[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [starFilter, setStarFilter] = useState(false);

  useEffect(() => {
    setList(getConversations());
    const timer = setInterval(() => setList(getConversations()), 5000);
    return () => clearInterval(timer);
  }, [activeId]);

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleStar(id);
    setList(getConversations());
  };

  const handleSelectStarFilter = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStarFilter(!starFilter);
  };

  const displayList = starFilter ? list.filter((c) => c.starred) : list;

  if (collapsed) {
    return (
      <div
        className="flex-none flex flex-col items-center py-4 px-2 gap-3"
        style={{
          width: 48,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <button
          onClick={() => setCollapsed(false)}
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
          title="展开侧边栏"
        >
          ▶
        </button>
        <button
          onClick={onNew}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors hover:opacity-80"
          style={{ background: "var(--accent)", color: "#fff" }}
          title="新建对话"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex-none flex flex-col h-full"
      style={{
        width: 260,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 py-3 flex-none">
        <span
          className="text-xs font-semibold tracking-wider select-none"
          style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
        >
          {starFilter ? "⭐ 收藏夹" : "历史对话"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSelectStarFilter}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all duration-150 ${starFilter ? "" : ""}`}
            style={{
              background: starFilter ? "var(--accent-glow)" : "transparent",
              color: starFilter ? "var(--accent)" : "var(--text-muted)",
            }}
            title={starFilter ? "显示全部" : "只看收藏"}
          >
            ⭐
          </button>
          <button
            onClick={onNew}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:opacity-80"
            style={{ background: "var(--accent)", color: "#fff" }}
            title="新建对话"
          >
            +
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
            title="收起侧边栏"
          >
            ◀
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {displayList.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>
            {starFilter ? "暂无收藏对话" : "暂无历史对话"}
          </p>
        )}
        {displayList.map((conv) => (
          <div
            key={conv.id}
            className="group relative"
          >
            <button
              onClick={() => onSelect(conv.id)}
              className="w-full text-left px-3 pr-16 py-2.5 rounded-xl transition-all duration-150"
              style={{
                background: activeId === conv.id ? "var(--accent-glow)" : "transparent",
                color: activeId === conv.id ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <div
                className="text-xs leading-tight line-clamp-2 mb-1"
                style={{ color: activeId === conv.id ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                {conv.title}
              </div>
              <div className="text-[0.6rem]" style={{ color: "var(--text-muted)" }}>
                {formatTime(conv.lastMessageAt)}
              </div>
            </button>
            {/* Star button — always visible */}
            <button
              onClick={(e) => handleToggleStar(conv.id, e)}
              className="absolute right-10 top-1.5 w-8 h-8 rounded flex items-center justify-center text-lg transition-all duration-150 hover:scale-125 active:scale-90"
              style={{
                color: conv.starred ? "#F5C518" : "var(--text-muted)",
                opacity: conv.starred ? 1 : 0.4,
                animation: conv.starred ? "starPop 0.35s ease-out" : "none",
              }}
              title={conv.starred ? "取消收藏" : "收藏"}
            >
              {conv.starred ? "⭐" : "☆"}
            </button>
            {/* Delete button — visible on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("确定删除这条对话？")) onDelete(conv.id);
              }}
              className="absolute right-2 top-2 w-6 h-6 rounded hidden group-hover:flex items-center justify-center text-xs transition-opacity"
              style={{ color: "var(--text-muted)" }}
              title="删除"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="flex-none px-4 py-3 text-[0.6rem] text-center select-none"
        style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}
      >
        AI PM Agent 工作台
      </div>
    </div>
  );
}
