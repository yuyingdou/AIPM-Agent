"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

// 从 UIMessage 的 parts 中提取文本内容
function getMessageText(message: { parts: Array<{ type: string; text?: string }> }): string {
  return message.parts
    ?.filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("") || "";
}

// 从 UIMessage 的 parts 中提取 tool invocations
function getToolInvocations(message: { parts: Array<{ type: string; [key: string]: unknown }> }) {
  return message.parts?.filter(
    (p) =>
      p.type === "tool-invocation" ||
      p.type === "tool-result" ||
      p.type === "tool-approval-request"
  ) || [];
}

// 检查是否有正在流式输出的文本
function isStreaming(message: { parts: Array<{ type: string; state?: string }> }): boolean {
  return message.parts?.some((p) => p.type === "text" && p.state === "streaming") || false;
}

export default function Home() {
  const { messages, sendMessage, status, error, stop } = useChat({
    onError: (err) => console.error("Chat error:", err),
  });

  const [input, setInput] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string>("auto");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  const fillQuickPrompt = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-screen bg-[#1A1A1A] text-white">
      {/* Header */}
      <header className="flex-none border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-wide">AI PM Agent</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              AI 产品经理工作台 · 12 Skills
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300
                         focus:outline-none focus:border-gray-500 cursor-pointer"
            >
              <option value="auto">🤖 自动识别</option>
              <option value="" disabled>── 产品决策链 ──</option>
              <option value="insight_miner">🔍 产品灵感挖掘</option>
              <option value="brd">📊 商业需求 BRD</option>
              <option value="mrd">📋 市场需求 MRD</option>
              <option value="vibe_prd">⚡ Vibe PRD</option>
              <option value="" disabled>── 求职链路 ──</option>
              <option value="resume">📝 简历优化</option>
              <option value="interview">🎯 面试诊断</option>
              <option value="product_teardown">🔬 产品拆解</option>
              <option value="learning_48h">📚 48h 加速学习</option>
              <option value="" disabled>── 其他 ──</option>
              <option value="obsidian">💾 知识沉淀</option>
              <option value="article">✍️ 文章共创</option>
            </select>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === "streaming"
                    ? "bg-green-400 animate-pulse"
                    : status === "error"
                    ? "bg-red-400"
                    : "bg-gray-600"
                }`}
              />
              {status === "streaming" ? "回复中" : "就绪"}
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-6">🛠️</div>
              <h2 className="text-xl font-semibold mb-3">
                AI 产品经理工作台
              </h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
                内置 12 个 AI PM 专业技能。从商业判断、需求分析到求职辅导，
                直接说你想做的事，Agent 会自动匹配对应的 Skill。
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto text-left">
                {[
                  {
                    icon: "📊",
                    text: "帮我评估这个方向值不值得做",
                    skill: "BRD",
                  },
                  {
                    icon: "🔍",
                    text: "帮我挖掘用户在抱怨什么",
                    skill: "Insight",
                  },
                  {
                    icon: "⚡",
                    text: "帮我把想法转成项目规范",
                    skill: "PRD",
                  },
                  {
                    icon: "📝",
                    text: "帮我优化AI PM的简历",
                    skill: "Resume",
                  },
                  {
                    icon: "🎯",
                    text: "帮我分析这场面试的表现",
                    skill: "Interview",
                  },
                  {
                    icon: "🔬",
                    text: "帮我拆解一下Cursor产品",
                    skill: "Teardown",
                  },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => fillQuickPrompt(item.text)}
                    className="text-left p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800
                               border border-gray-700/50 hover:border-gray-600
                               transition-all text-sm group cursor-pointer"
                  >
                    <span className="mr-2">{item.icon}</span>
                    <span className="text-gray-400 group-hover:text-gray-200 transition-colors">
                      {item.text}
                    </span>
                    <span className="ml-2 text-xs text-gray-600">
                      /{item.skill}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages
            .filter((m) => m.role !== "system")
            .map((message) => {
              const textContent = getMessageText(message);
              const tools = getToolInvocations(message);
              const isAssistantStreaming =
                message.role === "assistant" && isStreaming(message);

              return (
                <div
                  key={message.id}
                  className={`flex gap-4 ${
                    message.role === "user" ? "justify-end" : ""
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold flex-none mt-1">
                      AI
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] ${
                      message.role === "user" ? "order-first" : ""
                    }`}
                  >
                    {/* User message */}
                    {message.role === "user" && (
                      <div className="px-4 py-2.5 rounded-2xl bg-blue-600 text-white text-sm leading-relaxed whitespace-pre-wrap">
                        {textContent}
                      </div>
                    )}

                    {/* Assistant message with markdown */}
                    {message.role === "assistant" && (
                      <div className="text-sm leading-relaxed text-gray-200">
                        {textContent ? (
                          <ReactMarkdown
                            components={{
                              h1: ({ children }) => (
                                <h1 className="text-lg font-bold mt-6 mb-3 text-white border-b border-gray-700 pb-2">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-base font-bold mt-5 mb-2 text-white">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-sm font-semibold mt-4 mb-2 text-gray-200">
                                  {children}
                                </h3>
                              ),
                              p: ({ children }) => (
                                <p className="my-2 leading-relaxed">{children}</p>
                              ),
                              ul: ({ children }) => (
                                <ul className="my-2 pl-5 space-y-1 list-disc">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="my-2 pl-5 space-y-1 list-decimal">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => (
                                <li className="text-gray-300">{children}</li>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold text-white">
                                  {children}
                                </strong>
                              ),
                              code: ({
                                className,
                                children,
                              }: {
                                className?: string;
                                children?: React.ReactNode;
                              }) => {
                                const isInline = !className;
                                if (isInline) {
                                  return (
                                    <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-blue-300 font-mono">
                                      {children}
                                    </code>
                                  );
                                }
                                return (
                                  <pre className="bg-gray-800 p-4 rounded-xl text-xs text-gray-200 font-mono overflow-x-auto my-3 border border-gray-700">
                                    <code>{children}</code>
                                  </pre>
                                );
                              },
                              table: ({ children }) => (
                                <div className="overflow-x-auto my-3 rounded-xl border border-gray-700">
                                  <table className="min-w-full text-xs">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => (
                                <thead className="bg-gray-800">{children}</thead>
                              ),
                              th: ({ children }) => (
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider border-b border-gray-700">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="px-3 py-2 border-b border-gray-800 text-gray-300">
                                  {children}
                                </td>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-2 border-blue-500 pl-4 my-3 text-gray-400 italic">
                                  {children}
                                </blockquote>
                              ),
                              hr: () => <hr className="my-4 border-gray-800" />,
                            }}
                          />
                        ) : isAssistantStreaming ? (
                          <div className="flex items-center gap-2 text-gray-500 py-2">
                            <span className="animate-pulse">●</span>
                            思考中...
                          </div>
                        ) : null}

                        {/* Tool invocation indicators */}
                        {tools.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {tools.map((tool, i) => (
                              <div
                                key={`${message.id}-tool-${i}`}
                                className="px-3 py-1.5 bg-gray-800/50 rounded-lg border border-gray-700/50 text-xs text-gray-500 flex items-center gap-2"
                              >
                                {tool.type === "tool-approval-request" ? (
                                  <>
                                    <span>🔧</span>
                                    <span>请求使用工具</span>
                                  </>
                                ) : tool.type === "tool-result" ? (
                                  <>
                                    <span>✅</span>
                                    <span>工具执行完成</span>
                                  </>
                                ) : (
                                  <>
                                    <span>🔧</span>
                                    <span>工具调用</span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-xs font-bold flex-none mt-1">
                      U
                    </div>
                  )}
                </div>
              );
            })}

          {/* Error display */}
          {error && (
            <div className="max-w-3xl mx-auto px-4 py-3 bg-red-900/30 border border-red-800 rounded-xl text-sm text-red-300">
              <p className="font-semibold">⚠️ 出错了</p>
              <p className="text-xs text-red-400 mt-1">{error.message}</p>
              <p className="text-xs text-red-400 mt-1">
                请确认 .env.local 中已设置 ANTHROPIC_API_KEY
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="flex-none border-t border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  selectedSkill === "brd"
                    ? "说说你想评估的方向，比如：我想做一个 AI 写作辅助工具..."
                    : "说说你想做的事，Agent 会自动匹配对应的 Skill..."
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3
                           text-sm text-white placeholder-gray-500
                           focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500
                           resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
              />
              <div className="absolute bottom-2 right-3 text-xs text-gray-600 select-none">
                Enter 发送 · Shift+Enter 换行
              </div>
            </div>
            {status === "streaming" ? (
              <button
                type="button"
                onClick={() => stop()}
                className="px-5 py-3 bg-red-600 hover:bg-red-500
                           text-white text-sm font-medium rounded-xl transition-colors
                           flex items-center gap-2 flex-none"
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500
                           text-white text-sm font-medium rounded-xl transition-colors
                           flex items-center gap-2 flex-none"
              >
                <span>→</span>
                发送
              </button>
            )}
          </form>
        </div>
      </footer>
    </div>
  );
}
