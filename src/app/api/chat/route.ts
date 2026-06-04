import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { BRD_SYSTEM_PROMPT, detectSkillIntent } from "@/lib/brd-prompt";
import { MRD_SYSTEM_PROMPT } from "@/lib/mrd-prompt";
import { VIBE_PRD_SYSTEM_PROMPT } from "@/lib/vibe-prd-prompt";
import {
  INTERACTIVE_LEARNING_PROMPT,
  OBSIDIAN_KNOWLEDGE_SAVER_PROMPT,
  SIMIN_ARTICLE_COWRITER_PROMPT,
} from "@/lib/learning-skills-prompt";
import {
  PRODUCT_INSIGHT_MINER_PROMPT,
  AI_AGENT_PRD_WRITER_PROMPT,
} from "@/lib/product-chain-prompt";

export const maxDuration = 60;

const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

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
  vibe_prd: {
    prompt: VIBE_PRD_SYSTEM_PROMPT,
    intro: "⚡ **Vibe PRD Writer** — 把想法变成可执行的项目规范",
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
};

// ============================================================
// 路由逻辑
// ============================================================
function getSystemPrompt(skillIntent: string | null): string {
  if (skillIntent && SKILL_REGISTRY[skillIntent]) {
    return SKILL_REGISTRY[skillIntent].prompt;
  }
  return BRD_SYSTEM_PROMPT;
}

function getSkillTools() {
  return {
    searchWeb: tool({
      description: "搜索互联网获取信息。",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词"),
        platform: z
          .enum(["general", "reddit", "zhihu", "twitter"])
          .describe("限定搜索平台"),
      }),
      execute: async ({ query, platform }) => {
        let searchQuery = query;
        if (platform === "reddit") searchQuery = `site:reddit.com ${query}`;
        else if (platform === "zhihu") searchQuery = `site:zhihu.com ${query}`;
        else if (platform === "twitter") searchQuery = `site:x.com ${query}`;

        console.log(`[Agent] Searching: ${searchQuery}`);
        return {
          query: searchQuery,
          platform,
          note: "搜索功能需要配置搜索 API。可手动搜索后将结果粘贴到对话中。",
          suggestedQueries: [`${query}`, `${query} site:reddit.com`],
        };
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
        return { url, reason, note: "建议手动访问该链接并粘贴相关内容到对话中。" };
      },
    }),
  };
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const userMessages = messages.filter(
    (m: { role: string }) => m.role === "user"
  );
  const firstUserText: string =
    userMessages.length > 0 ? userMessages[0].content || "" : "";

  const skillIntent = detectSkillIntent(firstUserText);
  const systemPrompt = getSystemPrompt(skillIntent);
  const tools = getSkillTools();

  if (skillIntent) {
    console.log(`[Agent] Skill: ${skillIntent}`);
  }

  const modeHint =
    skillIntent && SKILL_REGISTRY[skillIntent]
      ? `\n\n【当前模式】${SKILL_REGISTRY[skillIntent].intro}\n`
      : "";

  const result = streamText({
    model: deepseek("deepseek-chat"),
    system: systemPrompt + modeHint,
    messages,
    tools,
    stopWhen: stepCountIs(10),
    temperature: 0.7,
  });

  return result.toUIMessageStreamResponse();
}
