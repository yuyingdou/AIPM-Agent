import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { BRD_SYSTEM_PROMPT, detectSkillIntent } from "@/lib/brd-prompt";
import { MRD_SYSTEM_PROMPT } from "@/lib/mrd-prompt";
import {
  INTERACTIVE_LEARNING_PROMPT,
  OBSIDIAN_KNOWLEDGE_SAVER_PROMPT,
  SIMIN_ARTICLE_COWRITER_PROMPT,
} from "@/lib/learning-skills-prompt";
import {
  PRODUCT_INSIGHT_MINER_PROMPT,
} from "@/lib/insight-miner-prompt";
import { HUASHU_DESIGN_PROMPT } from "@/lib/huashu-design-prompt";
import { AI_AGENT_PRD_WRITER_PROMPT } from "@/lib/ai-prd-prompt";
import { CHAPTER_GROUPS, EXTRACTION_PROMPT, chapterPrompt, assemblePrd } from "@/lib/prd-chapters";
import { PRODUCT_TEARDOWN_PROMPT } from "@/lib/product-teardown-prompt";
import { ACCELERATED_LEARNING_PROMPT } from "@/lib/accelerated-learning-prompt";

export const maxDuration = 300;

const deepseek = createOpenAICompatible({
  name: "deepseek",
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// 模型注册表 — 动态展示已配置 key 的模型
const MODEL_REGISTRY: Record<string, { name: string; getModel: () => any }> = {};

if (process.env.DEEPSEEK_API_KEY) {
  MODEL_REGISTRY["deepseek-chat"] = {
    name: "DeepSeek",
    getModel: () => deepseek("deepseek-chat"),
  };
}

if (process.env.ANTHROPIC_API_KEY) {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  MODEL_REGISTRY["claude-sonnet-4-6"] = {
    name: "Claude Sonnet",
    getModel: () => anthropic("claude-sonnet-4-6"),
  };
  MODEL_REGISTRY["claude-haiku-4-5"] = {
    name: "Claude Haiku",
    getModel: () => anthropic("claude-haiku-4-5"),
  };
}

if (process.env.OPENAI_API_KEY) {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  MODEL_REGISTRY["gpt-4o"] = {
    name: "GPT-4o",
    getModel: () => openai("gpt-4o"),
  };
}

const DEFAULT_MODEL = Object.keys(MODEL_REGISTRY)[0] || "deepseek-chat";

// ============================================================
// Skill 注册表
// ============================================================
const SKILL_REGISTRY: Record<string, { prompt: string; intro: string }> = {
  // 产品决策链（完整）
  insight_miner: {
    prompt: PRODUCT_INSIGHT_MINER_PROMPT,
    intro: "🔍 **产品灵感挖掘** — 从三平台挖掘用户痛点和产品机会",
  },
  brd: {
    prompt: BRD_SYSTEM_PROMPT,
    intro: "📊 **BRD Writer** — 帮你判断方向值不值得做",
  },
  mrd: {
    prompt: MRD_SYSTEM_PROMPT,
    intro: "📋 **MRD Writer** — 深入分析市场需求",
  },
  ai_prd: {
    prompt: AI_AGENT_PRD_WRITER_PROMPT,
    intro: "📝 **正式 PRD Writer** — 给开发团队看的完整需求文档",
  },
  // 能力建设 + 知识沉淀
  interactive_learning: {
    prompt: INTERACTIVE_LEARNING_PROMPT,
    intro: "🎓 **交互式学习** — 苏格拉底式一对一深度学习",
  },
  obsidian_saver: {
    prompt: OBSIDIAN_KNOWLEDGE_SAVER_PROMPT,
    intro: "💾 **知识沉淀** — 把对话提炼为原子笔记",
  },
  article_cowriter: {
    prompt: SIMIN_ARTICLE_COWRITER_PROMPT,
    intro: "✍️ **文章共创** — 帮你写出有深度、可传播的干货长文",
  },
  // 原型设计
  huashu_design: {
    prompt: HUASHU_DESIGN_PROMPT,
    intro: "🎨 **花叔原型设计** — 用 HTML 做高保真产品原型、交互 Demo、App mockup",
  },
  // 产品拆解
  product_teardown: {
    prompt: PRODUCT_TEARDOWN_PROMPT,
    intro: "🔧 **产品拆解** — 六层逆向工程，系统性拆解AI产品的完整架构",
  },
  // 48h加速学习
  accelerated_learning: {
    prompt: ACCELERATED_LEARNING_PROMPT,
    intro: "⏱️ **48h加速学习** — 三个关键问题快速建立领域认知全景图，达到能与专家对话",
  },
};

// ============================================================
// 路由逻辑
// ============================================================
// 通用 PM Agent prompt — 未匹配到具体 Skill 时的默认身份
const GENERAL_PM_PROMPT = `你是 AI PM Agent，一个全能型产品经理助手。你拥有以下专业技能，根据用户需求自动匹配：

**产品决策链**：灵感挖掘 🔍 / BRD 📊 / MRD 📋 / 正式 PRD 📝
**产品设计**：原型设计 🎨
**能力建设**：交互式学习 🎓 / 48h加速学习 ⏱️ / 产品拆解 🔧 / 文章共创 ✍️
**知识沉淀**：知识沉淀 💾

当用户的需求明确匹配某个技能时，直接以该技能的身份工作。如果用户需求不明确，简要介绍你能做什么，引导用户说清需求。`;

function getSystemPrompt(skillIntent: string | null): string {
  if (skillIntent && SKILL_REGISTRY[skillIntent]) {
    return SKILL_REGISTRY[skillIntent].prompt;
  }
  return GENERAL_PM_PROMPT;
}

function getSkillTools() {
  const tavilyKey = process.env.TAVILY_API_KEY;

  return {
    searchWeb: tool({
      description: "搜索互联网获取信息，返回标题、摘要、链接。",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词"),
        platform: z
          .enum(["general", "reddit", "zhihu", "twitter"])
          .optional()
          .describe("限定搜索平台"),
      }),
      execute: async ({ query, platform }) => {
        let searchQuery = query;
        if (platform === "reddit") searchQuery = `site:reddit.com ${query}`;
        else if (platform === "zhihu") searchQuery = `site:zhihu.com ${query}`;
        else if (platform === "twitter") searchQuery = `site:x.com ${query}`;

        console.log(`[Agent] Searching: ${searchQuery}`);

        if (!tavilyKey) {
          return { query: searchQuery, note: "搜索 API 未配置，请设置 TAVILY_API_KEY。" };
        }

        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: tavilyKey,
              query: searchQuery,
              search_depth: "basic",
              max_results: 5,
              include_domains: platform === "zhihu" ? ["zhihu.com"] : undefined,
            }),
          });
          const data = await res.json();
          console.log(`[Agent] Search done: ${data.results?.length || 0} results`);

          return {
            query: searchQuery,
            results: data.results?.map((r: any) => ({
              title: r.title,
              url: r.url,
              content: r.content,
            })) || [],
          };
        } catch (err) {
          console.error("[Agent] Search error:", err);
          return { query: searchQuery, error: "搜索请求失败，请稍后重试" };
        }
      },
    }),

    fetchWebContent: tool({
      description: "获取指定 URL 的网页内容。",
      inputSchema: z.object({
        url: z.string().describe("网页 URL"),
        reason: z.string().describe("为什么想读这篇"),
      }),
      execute: async ({ url, reason }) => {
        console.log(`[Agent] Fetching: ${url}`);

        if (!tavilyKey) {
          return { url, reason, note: "网页抓取 API 未配置，请手动访问。" };
        }

        try {
          const res = await fetch("https://api.tavily.com/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, urls: [url] }),
          });
          const data = await res.json();
          const content = data.results?.[0]?.raw_content || data.results?.[0]?.content || "";
          console.log(`[Agent] Extract done: ${content.length} chars`);

          return { url, reason, content };
        } catch (err) {
          console.error("[Agent] Extract error:", err);
          return { url, reason, error: "网页抓取失败，请稍后重试" };
        }
      },
    }),

    saveDocument: tool({
      description: "将产出的完整文档保存为可下载的 Markdown 文件。当你生成BRD、MRD、PRD、拆解报告、学习笔记、文章、知识沉淀等完整文档时，调用此工具让用户下载。",
      inputSchema: z.object({
        filename: z.string().describe("文件名，如 PRD_智能写作助手_20260606.md"),
        content: z.string().describe("完整的 Markdown 格式文档内容"),
      }),
      execute: async ({ filename, content }) => {
        console.log(`[Agent] saveDocument: ${filename} (${content.length} chars)`);
        return { filename, content };
      },
    }),
  };
}

export async function POST(req: Request) {
  const { messages, skill: manualSkill, model: selectedModel } = await req.json();

  // 选择模型
  const modelKey = selectedModel && MODEL_REGISTRY[selectedModel]
    ? selectedModel
    : DEFAULT_MODEL;
  const modelProvider = MODEL_REGISTRY[modelKey]?.getModel() || deepseek("deepseek-chat");

  const userMessages = messages.filter(
    (m: { role: string }) => m.role === "user"
  );
  const firstUserText: string =
    userMessages.length > 0 ? userMessages[0].content || "" : "";

  // 手动选择的 skill 优先于自动检测
  const skillIntent =
    manualSkill && manualSkill !== "auto"
      ? manualSkill
      : detectSkillIntent(firstUserText);
  const systemPrompt = getSystemPrompt(skillIntent);
  const tools = getSkillTools();

  // 检测原型迭代：对话中已有 HTML 原型 → 用轻量迭代 prompt 加速
  const hasExistingPrototype = messages.some((m: any) => {
    if (m.role !== "assistant") return false;
    const text = m.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text || "").join("") || "";
    return /```html/i.test(text) || /<!DOCTYPE html>/i.test(text);
  });
  // 迭代场景判断：对话已有原型 && (用户选中了原型设计 || 没命中任何 skill → 大概率是迭代)
  const isPrototypeIteration = hasExistingPrototype && (
    skillIntent === "huashu_design" ||
    manualSkill === "huashu_design" ||
    !skillIntent
  );

  if (skillIntent) {
    console.log(`[Agent] Skill: ${skillIntent}${isPrototypeIteration ? " (iteration mode → short prompt)" : ""}`);
  }

  // 迭代场景用极短 prompt（省 150 行 → 模型处理速度显著提升）
  const ITERATION_PROMPT = `你是一位原型设计师。现在用户要对已有原型做修改。

## 必须遵守
1. 从对话历史中找到**最新一条包含 HTML 代码的消息**，提取完整 HTML
2. **在它的基础上只做用户要求的修改**，其他部分一丝不变
3. 输出完整 HTML，**必须**用 \`\`\`html ... \`\`\` 包裹（小写 html，不要大写）
4. 不要重新设计、不要加新功能、不要改风格——除非用户明确要求

## 禁止
- ❌ 重新设计整个页面
- ❌ 添加用户没要求的功能
- ❌ 修改用户没提到的部分`;

  const effectiveSystemPrompt = isPrototypeIteration ? ITERATION_PROMPT : systemPrompt;

  const modeHint = skillIntent && SKILL_REGISTRY[skillIntent]
    ? `\n\n【当前模式】${SKILL_REGISTRY[skillIntent].intro}${isPrototypeIteration ? " (迭代修改)" : ""}\n`
    : `\n\n【当前模式】🤖 通用 AI PM Agent — 自动识别用户意图，匹配合适的技能\n`;

  const saveDocHint = `\n\n【文档输出规则】当你需要输出完整文档（BRD、MRD、PRD、拆解报告、学习笔记、文章、知识笔记等）时：
1. 必须在对话中完整输出文档的全部内容，以 # 标题开头，用 Markdown 格式
2. 不要说"文档已保存"或"已生成文件"之类的话——直接把内容展示出来
3. 文档输出完毕后，调用 saveDocument 工具保存文件
4. 用户会在消息下方看到下载按钮`;

  console.log(`[Agent] Using model: ${modelKey}`);

  // ============================================================
  // PRD 专用路由：多步并行生成 + 代码组装 + LLM 复印输出
  // ============================================================
  let result: any; // 提前声明，PRD 和其他 skill 共用

  if (skillIntent === "ai_prd") {
    const lastUserMsg = userMessages[userMessages.length - 1]?.content || firstUserText;

    try {
      // Phase 1: 提取用户需求
      console.log("[PRD] Phase 1: Extracting requirements...");
      const extraction = await generateText({
        model: modelProvider,
        system: EXTRACTION_PROMPT,
        messages: [{ role: "user", content: lastUserMsg }],
        temperature: 0.3,
      });
      const extractedInfo = extraction.text.trim();

      // Phase 2: 解析元信息
      let productName = "产品", version = "V1.0.0", author = "PM";
      try {
        const parsed = JSON.parse(extractedInfo.replace(/```json\n?/g, "").replace(/```/g, "").trim());
        productName = parsed.productName || "产品";
        version = parsed.version || "V1.0.0";
        author = parsed.author || "PM";
      } catch { /* ok */ }

      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const docTitle = `【${version}】${productName} PRD`;

      // Phase 3: Web 搜索
      let searchResults = "";
      if (process.env.TAVILY_API_KEY) {
        try {
          const sr = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: `${productName} AI 大模型API价格 竞品 2026`, search_depth: "basic", max_results: 5 }),
          });
          const sd = await sr.json();
          searchResults = (sd.results || []).map((r: any) => `- ${r.title}: ${r.content}`).join("\n");
        } catch { /* ok */ }
      }

      // Phase 4: 5 个章节组并行生成
      console.log("[PRD] Phase 4: Parallel chapter generation...");
      const chapterResults = await Promise.all(
        CHAPTER_GROUPS.map(async (group) => {
          try {
            const r = await generateText({
              model: modelProvider,
              system: chapterPrompt(group.id, group.title, group.chapters, extractedInfo, docTitle, searchResults),
              messages: [{ role: "user", content: `生成 ${group.title}` }],
              temperature: 0.7,
              maxOutputTokens: 8000,
            });
            return r.text;
          } catch (e) { console.error(`[PRD] ${group.id} failed:`, e); return null; }
        })
      );

      // Phase 5: 代码组装文档
      const assembledDoc = assemblePrd(docTitle, author, dateStr, chapterResults);
      const filename = `PRD_${productName}_${dateStr}.md`;
      console.log(`[PRD] Assembled: ${assembledDoc.length} chars`);

      // Phase 6: 用 streamText 输出组装好的文档（LLM 原样转述，保证前端兼容）
      result = streamText({
        model: modelProvider,
        system: `你是文档输出工具。用户给你一份已经写好的 Markdown 文档，你必须逐字输出它，不得改动一个字符。不要加前言、不要加后语、不要加任何解释。直接输出文档。`,
        messages: [
          { role: "user", content: `请输出以下文档，一字不改：\n\n${assembledDoc}` }
        ],
        tools,
        temperature: 0,
      });
    } catch (err: any) {
      console.error("[PRD] Multi-step failed, falling back:", err);
      // 降级继续走普通 streamText
    }
  }

  // PRD 处理完毕时 result 已设置，直接返回
  if (result) {
    return result.toUIMessageStreamResponse();
  }

  // ============================================================
  // 普通路由（非 PRD skill 或 PRD 降级）
  // ============================================================

  // 过滤掉停止后残留的空消息，避免后续请求出错
  const cleanMessages = messages.filter((m: any) => {
    if (m.role === "assistant") {
      const text = m.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text || "").join("") || "";
      return text.trim().length > 0;
    }
    return true;
  });

  // 压缩历史消息中的 HTML 代码块，避免上下文溢出
  // 保留最新一条 HTML 完整（迭代需要），更早的用占位符替代
  const compressedMessages = (() => {
    let foundLatest = false;
    return cleanMessages.map((m: any) => {
      if (m.role !== "assistant") return m;
      const textParts = m.parts?.filter((p: any) => p.type === "text") || [];
      if (textParts.length === 0) return m;

      const newParts = m.parts.map((p: any) => {
        if (p.type !== "text" || !p.text) return p;
        // 如果文本中包含 HTML 代码块，且不是最新的一条，则压缩
        if (/```html[\s\S]*?```/i.test(p.text)) {
          if (!foundLatest) {
            foundLatest = true;
            return p; // 保留最新 HTML 完整，供迭代修改
          }
          // 更早的 HTML 替换为占位符
          return {
            ...p,
            text: p.text.replace(/```html[\s\S]*?```/gi, '[已省略上轮原型 HTML 代码，详见历史消息]'),
          };
        }
        return p;
      });
      return { ...m, parts: newParts };
    });
  })();

  // 安全检查：如果压缩后消息仍然过大（估计 > 50K token），截断最早的消息
  let safeMessages = compressedMessages;
  const totalChars = JSON.stringify(compressedMessages).length;
  if (totalChars > 200_000) {
    // 保留 system prompt 级别的第一条 + 最近的 N 条
    const keepRecent = Math.max(2, Math.floor(compressedMessages.length / 2));
    safeMessages = [
      compressedMessages[0],
      ...compressedMessages.slice(-keepRecent),
    ];
    console.log(`[Agent] Messages trimmed: ${compressedMessages.length} → ${safeMessages.length} (${totalChars} chars total)`);
  }

  const modelMessages = await convertToModelMessages(safeMessages);

  try {
    result = streamText({
      model: modelProvider,
      system: effectiveSystemPrompt + modeHint + saveDocHint,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10),
      temperature: 0.7,
    });
  } catch (err: any) {
    console.error("[Agent] streamText error:", err);
    // 降级：用更短的消息重试
    const fallbackMessages = modelMessages.slice(-6); // 只保留最近 3 轮
    console.log(`[Agent] Retrying with ${fallbackMessages.length} messages`);
    try {
      result = streamText({
        model: modelProvider,
        system: effectiveSystemPrompt + modeHint + saveDocHint,
        messages: fallbackMessages,
        tools,
        stopWhen: stepCountIs(10),
        temperature: 0.7,
      });
    } catch (retryErr: any) {
      console.error("[Agent] Fallback also failed:", retryErr);
      return Response.json(
        { error: "模型调用失败，请检查 API 配置或稍后重试。" },
        { status: 500 }
      );
    }
  }

  return result.toUIMessageStreamResponse();
}

// 返回可用模型列表
export async function GET() {
  const models = Object.entries(MODEL_REGISTRY).map(([id, info]) => ({
    id,
    name: info.name,
  }));
  return Response.json({ models, defaultModel: DEFAULT_MODEL });
}
