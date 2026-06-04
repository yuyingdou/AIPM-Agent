"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

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
    ],
  },
  {
    label: "产品设计",
    skills: [
      { id: "huashu_design", label: "原型设计", icon: "🎨" },
    ],
  },
  {
    label: "知识管理",
    skills: [
      { id: "obsidian_saver", label: "知识沉淀", icon: "💾" },
      { id: "article_cowriter", label: "文章共创", icon: "✍️" },
    ],
  },
];

const QUICK_PROMPTS = [
  { icon: "📊", text: "帮我评估这个方向值不值得做" },
  { icon: "🔍", text: "帮我挖掘用户在抱怨什么" },
  { icon: "⚡", text: "帮我把想法转成项目规范" },
  { icon: "🎨", text: "帮我做一个AI写作App原型" },
  { icon: "📱", text: "帮我设计一个番茄钟iOS界面" },
];

// ============================================================
// Component
// ============================================================
export default function Home() {
  const { messages, sendMessage, status, error, stop } = useChat({
    onError: (err) => console.error("Chat error:", err),
  });

  const [input, setInput] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string>("auto");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

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
    if (paletteOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [paletteOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;
    sendMessage({ text: input.trim() }, { body: { skill: selectedSkill } });
    setInput("");
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
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-root)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
    >
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
                className="absolute right-0 top-full mt-2 w-72 rounded-2xl py-3 px-2 z-50 shadow-2xl animate-enter"
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
        </div>
      </header>

      {/* ================================================================ */}
      {/* Messages */}
      {/* ================================================================ */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Empty state — editorial cover */}
          {messages.length === 0 && (
            <div className="text-center py-20 animate-enter">
              <div
                className="text-6xl mb-8 select-none"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
              >
                AI PM Agent
              </div>
              <p
                className="mb-10 max-w-md mx-auto leading-relaxed text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                从商业判断到需求分析到原型设计，内置多个 AI PM 专业技能。
                <br />
                直接说你想做的事，Agent 会自动匹配对应的 Skill。
              </p>

              {/* Quick prompts — editorial cards */}
              <div className="grid grid-cols-1 gap-2 max-w-lg mx-auto">
                {QUICK_PROMPTS.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => fillQuickPrompt(item.text)}
                    className="text-left w-full px-5 py-3 rounded-xl transition-all duration-200 group"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      animationDelay: `${i * 60}ms`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-default)";
                      e.currentTarget.style.background = "var(--bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-subtle)";
                      e.currentTarget.style.background = "var(--bg-surface)";
                    }}
                  >
                    <span className="text-sm flex items-center gap-3">
                      <span className="text-base">{item.icon}</span>
                      <span style={{ color: "var(--text-secondary)" }}>{item.text}</span>
                      <span
                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        style={{ color: "var(--accent-dim)" }}
                      >
                        ↵
                      </span>
                    </span>
                  </button>
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
                          <div style={{color:"#EDE8E0",whiteSpace:"pre-wrap",lineHeight:1.8,fontSize:"0.95rem"}}>
                            {textContent}
                          </div>
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
                          <div className="mt-4 space-y-1">
                            {tools.map((tool, i) => (
                              <div
                                key={`${message.id}-tool-${i}`}
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
                                    : tool.type === "tool-result"
                                    ? "执行完成"
                                    : "工具调用"}
                                </span>
                              </div>
                            ))}
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
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="说说你想做的事，Agent 会自动匹配对应的 Skill..."
                rows={2}
                className="w-full rounded-2xl px-5 py-3 text-sm resize-none transition-all duration-200"
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
              <div
                className="absolute bottom-2.5 right-4 text-xs select-none"
                style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}
              >
                Enter 发送 · Shift+Enter 换行
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

      {/* ================================================================ */}
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
