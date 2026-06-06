"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import Sidebar, {
  getConversations,
  getActiveId,
  setActiveId,
  createConversation,
  updateConversation,
  deleteConversation,
  getConvMessages,
  saveConvMessages,
} from "@/components/sidebar";

// ============================================================
// Helpers
// ============================================================
function getMessageText(message: { parts: Array<{ type: string; text?: string }> }): string {
  return message.parts
    ?.filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("") || "";
}

function getToolInvocations(message: { parts: Array<{ type: string; [key: string]: unknown }> }) {
  return message.parts?.filter(
    (p) =>
      p.type === "tool-invocation" ||
      p.type === "tool-result" ||
      p.type === "tool-approval-request"
  ) || [];
}

function isStreaming(message: { parts: Array<{ type: string; state?: string }> }): boolean {
  return message.parts?.some((p) => p.type === "text" && p.state === "streaming") || false;
}

// ============================================================
// Skill Palette — groups & skills
// ============================================================
const SKILL_GROUPS = [
  {
    label: "产品决策链",
    skills: [
      { id: "insight_miner", label: "灵感挖掘", icon: "🔍" },
      { id: "brd", label: "BRD", icon: "📊" },
      { id: "mrd", label: "MRD", icon: "📋" },
      { id: "vibe_prd", label: "Vibe PRD", icon: "⚡" },
      { id: "ai_prd", label: "正式 PRD", icon: "📝" },
    ],
  },
  {
    label: "产品设计",
    skills: [
      { id: "huashu_design", label: "原型设计", icon: "🎨" },
    ],
  },
  {
    label: "能力建设",
    skills: [
      { id: "interactive_learning", label: "交互式学习", icon: "🎓" },
      { id: "accelerated_learning", label: "48h加速学习", icon: "⏱️" },
      { id: "product_teardown", label: "产品拆解", icon: "🔧" },
      { id: "article_cowriter", label: "文章共创", icon: "✍️" },
    ],
  },
  {
    label: "知识沉淀",
    skills: [
      { id: "obsidian_saver", label: "知识沉淀", icon: "💾" },
    ],
  },
];

const GROUPED_PROMPTS = [
  {
    label: "产品决策链",
    icon: "🧭",
    prompts: [
      { tag: "挖掘", text: "帮我发现用户未被满足的痛点" },
      { tag: "评估", text: "帮我写BRD，评估这个方向值不值得做" },
      { tag: "分析", text: "帮我写MRD，分析这个赛道的市场需求" },
      { tag: "速写", text: "帮我快速输出一份轻量级 PRD" },
      { tag: "规范", text: "帮我写一份完整的正式 PRD 文档" },
    ],
  },
  {
    label: "产品设计",
    icon: "🎨",
    prompts: [
      { tag: "原型", text: "帮我做一个AI产品的高保真原型" },
    ],
  },
  {
    label: "能力建设",
    icon: "🚀",
    prompts: [
      { tag: "拆解", text: "帮我拆解一下这个AI产品" },
      { tag: "速成", text: "我想48小时快速搞懂一个陌生领域" },
      { tag: "深学", text: "我想系统深入地学习一个专业领域" },
      { tag: "共创", text: "帮我写一篇有深度的行业干货文章" },
    ],
  },
  {
    label: "知识沉淀",
    icon: "💾",
    prompts: [
      { tag: "沉淀", text: "帮我把今天聊的内容沉淀为知识笔记" },
    ],
  },
];

// ============================================================
// Component
// ============================================================
export default function Home() {
  const [convId, setConvId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setConvId(getActiveId());
    setMounted(true);
  }, []);

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    messages: convId ? getConvMessages(convId) : [],
    onError: (err) => console.error("Chat error:", err),
  });

  const [input, setInput] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string>("auto");
  const [selectedModel, setSelectedModel] = useState<string>("deepseek-chat");
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [sidePanelHtml, setSidePanelHtml] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自动检测最新原型 HTML 并更新侧边预览
  useEffect(() => {
    if (status !== "ready" && status !== "error") return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;
    const txt = getMessageText(lastMsg).trim();
    const htmlMatch = txt.match(/```html\s*([\s\S]*?)```/i);
    if (htmlMatch) {
      setSidePanelHtml(htmlMatch[1]);
    }
  }, [messages, status]);

  // 获取可用模型列表
  useEffect(() => {
    fetch("/api/chat").then(r => r.json()).then(d => {
      setAvailableModels(d.models || []);
      if (d.defaultModel) setSelectedModel(d.defaultModel);
    }).catch(() => {});
  }, []);

  // 切换对话时立即替换消息列表
  const switchConversation = useCallback((id: string) => {
    setActiveId(id);
    setConvId(id);
    setMessages(getConvMessages(id));
  }, [setMessages]);

  // 新建对话时清空
  const newConversation = useCallback(() => {
    setActiveId(null);
    setConvId(null);
    setMessages([]);
  }, [setMessages]);

  // 删除对话
  const handleDelete = useCallback(
    (id: string) => {
      deleteConversation(id);
      if (convId === id) {
        setActiveId(null);
        setConvId(null);
        setMessages([]);
      }
    },
    [convId, setMessages]
  );

  // 首条消息自动创建对话标题
  const createdRef = useRef(false);
  useEffect(() => {
    if (!convId && messages.length > 0) {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser) {
        const title = getMessageText(firstUser).slice(0, 30);
        const id = createConversation(title);
        setConvId(id);
        createdRef.current = true;
      }
    }
  }, [messages, convId]);

  // 持久化到当前对话
  useEffect(() => {
    if (convId && status !== "streaming" && messages.length > 0) {
      saveConvMessages(convId, messages);
      const nonSystem = messages.filter((m) => m.role !== "system");
      if (nonSystem.length > 0) {
        updateConversation(convId, { lastMessageAt: new Date().toISOString() });
      }
    }
  }, [messages, status, convId]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close palette on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    }
    if (paletteOpen || modelOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [paletteOpen, modelOpen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    }
    if (modelOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || status === "streaming") return;
    const fileList =
      attachedFiles.length > 0
        ? (() => {
            const dt = new DataTransfer();
            attachedFiles.forEach((f) => dt.items.add(f));
            return dt.files;
          })()
        : undefined;
    sendMessage(
      { text: input.trim(), files: fileList },
      { body: { skill: selectedSkill, model: selectedModel } }
    );
    setInput("");
    setAttachedFiles([]);
  };

  // 文件上传
  const handleFileAdd = (files: FileList | File[]) => {
    setAttachedFiles((prev) => [...prev, ...Array.from(files)].slice(0, 5));
  };
  const handleFileRemove = (i: number) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  // 粘贴图片
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...imageFiles].slice(0, 5));
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, []);

  // 拖拽文件
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileAdd(e.dataTransfer.files);
    }
  };

  const selectSkill = (id: string) => {
    setSelectedSkill(id);
    setPaletteOpen(false);
  };

  const fillQuickPrompt = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const openPreview = (html: string) => setPreviewHtml(html);

  const currentSkillLabel =
    selectedSkill === "auto"
      ? "自动识别"
      : SKILL_GROUPS.flatMap((g) => g.skills).find((s) => s.id === selectedSkill)?.label || "自动识别";

  return (
    <div
      className="flex h-screen"
      style={{ background: "var(--bg-root)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
    >
      {/* Sidebar */}
      <Sidebar
        activeId={convId}
        onSelect={switchConversation}
        onNew={newConversation}
        onDelete={handleDelete}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* ================================================================ */}
      {/* Masthead */}
      {/* ================================================================ */}
      <header
        className="flex-none px-6 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {/* Logo / wordmark */}
          <div className="flex items-center gap-4">
            <h1
              className="text-lg tracking-tight select-none"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              AI PM Agent
            </h1>
            <span
              className="text-xs tracking-widest uppercase select-none"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}
            >
              工作台
            </span>
          </div>

          {/* Skill palette trigger */}
          <div className="relative" ref={paletteRef}>
            <button
              onClick={() => setPaletteOpen(!paletteOpen)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full transition-all duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              <span className="text-xs">{currentSkillLabel === "自动识别" ? "🤖" : SKILL_GROUPS.flatMap(g => g.skills).find(s => s.id === selectedSkill)?.icon || "🤖"}</span>
              <span>{currentSkillLabel}</span>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Dropdown palette */}
            {paletteOpen && (
              <div
                className="absolute -right-2 top-full mt-2 w-64 rounded-2xl py-3 px-2 z-50 shadow-2xl animate-enter"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  boxShadow: "0 24px 48px -12px rgba(0,0,0,0.6)",
                }}
              >
                <button
                  onClick={() => selectSkill("auto")}
                  className="w-full text-left px-3 py-2 rounded-xl text-sm mb-2 transition-colors"
                  style={{
                    background: selectedSkill === "auto" ? "var(--accent-glow)" : "transparent",
                    color: selectedSkill === "auto" ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  <span className="mr-2">🤖</span>自动识别
                  {selectedSkill === "auto" && (
                    <span className="float-right text-xs mt-0.5" style={{ color: "var(--accent)" }}>✓</span>
                  )}
                </button>

                {SKILL_GROUPS.map((group) => (
                  <div key={group.label} className="mb-1">
                    <div
                      className="px-3 py-1.5 text-xs tracking-wider uppercase select-none"
                      style={{ color: "var(--text-muted)", fontSize: "0.65rem", letterSpacing: "0.12em" }}
                    >
                      {group.label}
                    </div>
                    {group.skills.map((skill) => (
                      <button
                        key={skill.id}
                        onClick={() => selectSkill(skill.id)}
                        className="w-full text-left px-3 py-2 rounded-xl text-sm transition-colors"
                        style={{
                          background: selectedSkill === skill.id ? "var(--accent-glow)" : "transparent",
                          color: selectedSkill === skill.id ? "var(--accent)" : "var(--text-secondary)",
                        }}
                      >
                        <span className="mr-2">{skill.icon}</span>
                        {skill.label}
                        {selectedSkill === skill.id && (
                          <span className="float-right text-xs mt-0.5" style={{ color: "var(--accent)" }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model selector */}
          {availableModels.length > 0 && (
            <div className="relative" ref={modelRef}>
              <button
                onClick={() => setModelOpen(!modelOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-full transition-all duration-200"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                }}
              >
                {availableModels.find(m => m.id === selectedModel)?.name || "模型"}
                <svg width="8" height="5" viewBox="0 0 10 6" fill="none">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {modelOpen && (
                <div
                  className="absolute -right-2 top-full mt-2 w-40 rounded-xl py-2 px-1 z-50 shadow-2xl animate-enter"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    boxShadow: "0 24px 48px -12px rgba(0,0,0,0.6)",
                  }}
                >
                  {availableModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setModelOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs transition-colors"
                      style={{
                        background: selectedModel === m.id ? "var(--accent-glow)" : "transparent",
                        color: selectedModel === m.id ? "var(--accent)" : "var(--text-secondary)",
                      }}
                    >
                      {m.name}
                      {selectedModel === m.id && (
                        <span className="float-right text-xs" style={{ color: "var(--accent)" }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 text-xs select-none" style={{ color: "var(--text-muted)" }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  status === "streaming"
                    ? "#7CB886"
                    : status === "error"
                    ? "var(--error)"
                    : "var(--border-default)",
                boxShadow:
                  status === "streaming"
                    ? "0 0 6px rgba(124,184,134,0.5)"
                    : "none",
                transition: "all 0.3s ease",
              }}
            />
            {status === "streaming" ? "回复中" : "就绪"}
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={newConversation}
                className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all duration-200 hover:opacity-80"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                }}
              >
                <span>＋</span>
                新建对话
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* Messages */}
      {/* ================================================================ */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Empty state — editorial cover */}
          {messages.length === 0 && (
            <div className="py-16 animate-enter">
              {/* Hero */}
              <div className="text-center mb-12">
                <div
                  className="text-5xl mb-4 select-none tracking-tight"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
                >
                  AI PM Agent
                </div>
                <p
                  className="max-w-lg mx-auto leading-relaxed text-sm whitespace-nowrap"
                  style={{ color: "var(--text-muted)" }}
                >
                  覆盖产品决策、产品设计、能力建设、知识沉淀四大模块，内置 11 个 AI PM 专业技能。
                </p>
                <p
                  className="mt-2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  点击下方卡片快速体验 ↓
                </p>
              </div>

              {/* Grouped quick prompts */}
              <div className="max-w-4xl mx-auto space-y-8">
                {GROUPED_PROMPTS.map((group) => (
                  <div key={group.label}>
                    {/* Group header */}
                    <div className="flex items-center gap-2.5 mb-4 px-1">
                      <span className="text-lg">{group.icon}</span>
                      <span
                        className="text-sm font-semibold select-none"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {group.label}
                      </span>
                      <div className="flex-1 ml-2" style={{ height: 1, background: "var(--border-subtle)" }} />
                    </div>
                    {/* Prompt cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.prompts.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => fillQuickPrompt(item.text)}
                          className="text-left w-full px-4 py-2.5 rounded-xl transition-all duration-200 group"
                          style={{
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-subtle)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--accent-dim)";
                            e.currentTarget.style.background = "var(--bg-elevated)";
                            e.currentTarget.style.transform = "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border-subtle)";
                            e.currentTarget.style.background = "var(--bg-surface)";
                            e.currentTarget.style.transform = "translateY(0)";
                          }}
                        >
                          <span className="text-sm flex items-center gap-2.5">
                            <span
                              className="flex-none text-[0.65rem] px-2 py-0.5 rounded-md font-medium select-none"
                              style={{
                                background: "var(--accent-glow)",
                                color: "var(--accent)",
                              }}
                            >
                              {item.tag}
                            </span>
                            <span
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {item.text}
                            </span>
                            <span
                              className="flex-none opacity-0 group-hover:opacity-100 transition-opacity text-xs ml-auto"
                              style={{ color: "var(--accent-dim)" }}
                            >
                              ↵
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages
            .filter((m) => m.role !== "system")
            .map((message, idx) => {
              const textContent = getMessageText(message);
              const tools = getToolInvocations(message);
              const isAssistantStreaming =
                message.role === "assistant" && isStreaming(message);

              // Debug: log message structure for assistant messages
              if (message.role === "assistant") {
                console.log("[DEBUG] Assistant message:", {
                  id: message.id,
                  role: message.role,
                  partsCount: message.parts?.length,
                  parts: message.parts?.map((p: any) => ({ type: p.type, textLen: p.text?.length, state: p.state })),
                  textContent,
                  isStreaming: isAssistantStreaming,
                });
              }

              return (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === "user" ? "justify-end" : ""}`}
                  style={{
                    animation: `fadeUp 0.4s ease-out ${idx === messages.filter(m => m.role !== "system").length - 1 ? 0 : 0}s both`,
                  }}
                >
                  {/* AI avatar — refined monogram */}
                  {message.role === "assistant" && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-none mt-1 select-none"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        fontSize: "0.6rem",
                        fontWeight: 600,
                        color: "var(--accent-dim)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      AI
                    </div>
                  )}

                  <div className={`max-w-[82%] ${message.role === "user" ? "order-first" : ""}`}>
                    {/* User message */}
                    {message.role === "user" && (
                      <div
                        className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                        style={{
                          background: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        {textContent}
                      </div>
                    )}

                    {/* Assistant — editorial prose */}
                    {message.role === "assistant" && (
                      <div className="text-sm leading-relaxed" style={{ color: "#EDE8E0" }}>
                        {textContent ? (
                          <>
                            {/* 检测是否包含 HTML 原型代码 */}
                            {(() => {
                              const txt = textContent.trim();
                              const htmlBlock = txt.match(/```html\s*([\s\S]*?)```/i);
                              const isHtml = htmlBlock || /<!DOCTYPE html>/i.test(txt);
                              if (isHtml && !isAssistantStreaming) {
                                const htm = htmlBlock?.[1] || txt;
                                // 提取非代码部分（原型说明文字）
                                const beforeCode = txt.replace(/```html[\s\S]*?```/i, "").trim();
                                const now = new Date();
                                const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
                                return (
                                  <div>
                                    {beforeCode && (
                                      <div style={{color:"#EDE8E0",whiteSpace:"pre-wrap",lineHeight:1.8,fontSize:"0.95rem",marginBottom:12}}>
                                        {beforeCode}
                                      </div>
                                    )}
                                    <div
                                      className="rounded-2xl p-6 text-center"
                                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                                    >
                                      <div className="text-4xl mb-3">🎨</div>
                                      <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                                        产品原型已生成
                                      </div>
                                      <div className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                                        可在下方预览交互效果或下载 HTML 文件
                                      </div>
                                      <div className="flex gap-2 justify-center">
                                        <button
                                          onClick={() => openPreview(htm)}
                                          className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all duration-200 hover:opacity-90"
                                          style={{ background: "#4A9E6B", color: "#fff" }}
                                        >
                                          <span>🔍</span> 预览原型
                                        </button>
                                        <button
                                          onClick={() => {
                                            const blob = new Blob([htm], { type: "text/html;charset=utf-8" });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement("a");
                                            a.href = url;
                                            a.download = `prototype_${ds}.html`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                          }}
                                          className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all duration-200 hover:opacity-90"
                                          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
                                        >
                                          <span>📥</span> 下载代码
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              // 不是 HTML — 正常显示
                              return (
                                <div style={{color:"#EDE8E0",whiteSpace:"pre-wrap",lineHeight:1.8,fontSize:"0.95rem"}}>
                                  {isHtml && isAssistantStreaming ? (
                                    <div className="flex items-center gap-2 py-3" style={{ color: "var(--text-muted)" }}>
                                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent-dim)" }} />
                                      正在生成原型...
                                    </div>
                                  ) : (
                                    textContent
                                  )}
                                </div>
                              );
                            })()}
                            {/* Per-message download — show for substantial markdown docs */}
                            {(() => {
                              if (isAssistantStreaming) return null;
                              const txt = textContent.trim();
                              const hasHtml = /```html/i.test(txt);
                              if (hasHtml) return null; // HTML 消息已有下载按钮
                              const isDoc = txt.length > 200 && /^#{1,3}\s/m.test(txt);
                              if (!isDoc) return null;
                              const heading = txt.match(/^#\s+(.+)/m);
                              const fname = heading
                                ? heading[1].replace(/[\\/:*?"<>|]/g, "").slice(0, 40)
                                : `文档片段`;
                              const now = new Date();
                              const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
                              return (
                                <button
                                  onClick={() => {
                                    const blob = new Blob([txt], { type: "text/markdown;charset=utf-8" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `${fname}_${ds}.md`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                  className="mt-2 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all duration-200 hover:opacity-80"
                                  style={{
                                    background: "var(--accent)",
                                    color: "#fff",
                                    display: "inline-flex",
                                  }}
                                >
                                  <span>📥</span>
                                  下载此文档
                                </button>
                              );
                            })()}
                          </>
                        ) : isAssistantStreaming ? (
                          <div className="flex items-center gap-2 py-3" style={{ color: "var(--text-muted)" }}>
                            <span
                              className="w-1.5 h-1.5 rounded-full animate-pulse"
                              style={{ background: "var(--accent-dim)" }}
                            />
                            思考中...
                          </div>
                        ) : null}

                        {/* Tool indicators */}
                        {tools.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {tools.map((tool, i) => {
                              const toolResult = (tool as any).result || (tool as any).output;
                              const isDocResult =
                                toolResult &&
                                toolResult.filename &&
                                toolResult.content;

                              return (
                                <div key={`${message.id}-tool-${i}`}>
                                  <div
                                    className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-2"
                                    style={{
                                      background: "var(--bg-surface)",
                                      border: "1px solid var(--border-subtle)",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    <span>
                                      {tool.type === "tool-approval-request"
                                        ? "🔧"
                                        : tool.type === "tool-result"
                                        ? "✓"
                                        : "⚙"}
                                    </span>
                                    <span>
                                      {tool.type === "tool-approval-request"
                                        ? "请求工具"
                                        : isDocResult
                                        ? `文档已生成: ${toolResult.filename}`
                                        : tool.type === "tool-result"
                                        ? "执行完成"
                                        : "工具调用"}
                                    </span>
                                  </div>
                                  {isDocResult && (
                                    <button
                                      onClick={() => {
                                        const blob = new Blob([toolResult.content], { type: "text/markdown;charset=utf-8" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = toolResult.filename;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      }}
                                      className="mt-1.5 w-full px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90"
                                      style={{
                                        background: "var(--accent)",
                                        color: "#fff",
                                      }}
                                    >
                                      <span>📥</span>
                                      下载 {toolResult.filename}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* User avatar */}
                  {message.role === "user" && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-none mt-1 select-none"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        fontSize: "0.6rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                      }}
                    >
                      U
                    </div>
                  )}
                </div>
              );
            })}

          {/* Error */}
          {error && (
            <div
              className="max-w-3xl mx-auto px-5 py-4 rounded-2xl text-sm"
              style={{
                background: "var(--error-bg)",
                border: "1px solid rgba(217,113,113,0.25)",
                color: "var(--error)",
              }}
            >
              <p className="font-semibold mb-1">出错了</p>
              <p className="text-xs opacity-80">{error.message}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ================================================================ */}
      {/* Input */}
      {/* ================================================================ */}
      <footer
        className="flex-none px-6 py-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3 items-end">
            <div className="flex-1 relative" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
              {/* File previews */}
              {attachedFiles.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {attachedFiles.map((file, i) => (
                    <div
                      key={i}
                      className="relative group rounded-lg overflow-hidden flex-none"
                      style={{ width: 48, height: 48, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
                    >
                      {file.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--text-muted)" }}>
                          📄
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleFileRemove(i)}
                        className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-[0.5rem] rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Input row */}
              <div className="flex gap-2 items-end">
                {/* + button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-none w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all duration-200 hover:opacity-80"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}
                  title="上传文件或图片"
                >
                  +
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.md,.txt,.csv,.json,.doc,.docx"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFileAdd(e.target.files);
                    e.target.value = "";
                  }}
                />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="描述你想做的事，也可以拖拽或粘贴文件到这里"
                  rows={2}
                  className="flex-1 rounded-2xl px-4 py-3 text-sm resize-none transition-all duration-200 placeholder:text-sm"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-dim)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-glow)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-default)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as unknown as React.FormEvent);
                    }
                  }}
                />
              </div>
              <div
                className="absolute bottom-2 right-14 text-xs select-none"
                style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}
              >
                Enter 发送 · 贴图/拖拽上传
              </div>
            </div>

            {status === "streaming" ? (
              <button
                type="button"
                onClick={() => stop()}
                className="px-5 py-3 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-2 flex-none"
                style={{
                  background: "var(--error)",
                  color: "#fff",
                }}
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-5 py-3 rounded-2xl text-sm font-medium transition-all duration-200 flex items-center gap-2 flex-none disabled:opacity-30"
                style={{
                  background: "var(--accent)",
                  color: "var(--bg-root)",
                  fontWeight: 600,
                }}
              >
                <span>→</span>
                发送
              </button>
            )}
          </form>
        </div>
      </footer>
      </div>{/* end main area */}

      {/* Side Preview Panel */}
      {sidePanelHtml && (
        <div
          className="flex-none flex flex-col"
          style={{
            width: 420,
            background: "#fff",
            borderLeft: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-2 flex-none"
            style={{ background: "#FAFAF8", borderBottom: "1px solid #EBE8E3" }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "#7CB886" }} />
              <span className="text-xs font-medium" style={{ color: "#6B6560" }}>原型预览</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([sidePanelHtml], { type: "text/html;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const now = new Date();
                  const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
                  a.download = `prototype_${ds}.html`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-2 py-1 text-xs rounded-md transition-colors hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                📥 下载
              </button>
              <button
                onClick={() => setSidePanelHtml(null)}
                className="text-xs px-2 py-1 rounded-md transition-colors"
                style={{ background: "#F0EDE8", color: "#6B6560" }}
              >
                ✕ 关闭
              </button>
            </div>
          </div>
          <iframe
            srcDoc={sidePanelHtml}
            className="flex-1 w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="原型实时预览"
          />
        </div>
      )}

      {/* Prototype Preview Modal — warm edition */}
      {/* ================================================================ */}
      {previewHtml && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={() => setPreviewHtml(null)}
        >
          <div
            className="relative rounded-2xl shadow-2xl w-[95vw] h-[90vh] max-w-6xl flex flex-col overflow-hidden"
            style={{ background: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal chrome */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-none"
              style={{ background: "#FAFAF8", borderBottom: "1px solid #EBE8E3" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setPreviewHtml(null)}
                    className="w-3 h-3 rounded-full transition-opacity hover:opacity-80"
                    style={{ background: "#E88C8C" }}
                  />
                  <div className="w-3 h-3 rounded-full" style={{ background: "#E8CF8C" }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: "#8CC89B" }} />
                </div>
                <span className="text-xs font-medium ml-2" style={{ color: "#8B8580" }}>
                  原型预览
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([previewHtml], { type: "text/html" });
                    window.open(URL.createObjectURL(blob), "_blank");
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  <span>↗</span> 新窗口打开
                </button>
                <button
                  onClick={() => setPreviewHtml(null)}
                  className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                  style={{ background: "#F0EDE8", color: "#6B6560" }}
                >
                  关闭
                </button>
              </div>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="flex-1 w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="原型预览"
            />
          </div>
        </div>
      )}
    </div>
  );
}
