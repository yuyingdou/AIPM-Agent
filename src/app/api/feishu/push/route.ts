import { pushToFeishu } from "@/lib/feishu";

export const maxDuration = 60;

export async function POST(req: Request) {
  // 检查环境变量
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    return Response.json(
      {
        error:
          "飞书 API 未配置。请在 .env.local 中设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。获取方式：https://open.feishu.cn/app → 创建应用 → 凭证与基础信息",
      },
      { status: 401 }
    );
  }

  let title: string;
  let content: string;
  let folderToken: string | undefined;

  try {
    const body = await req.json();
    title = body.title;
    content = body.content;
    folderToken = body.folderToken;
  } catch {
    return Response.json({ error: "请求体格式错误，需要 JSON" }, { status: 400 });
  }

  if (!title || !content) {
    return Response.json(
      { error: "缺少必填字段：title（文档标题）和 content（Markdown 内容）" },
      { status: 400 }
    );
  }

  // 内容长度限制（飞书单次创建有限制，预留足够空间）
  if (content.length > 500_000) {
    return Response.json(
      { error: `文档内容过长（${content.length} 字符），请控制在 500,000 字符以内` },
      { status: 400 }
    );
  }

  try {
    const result = await pushToFeishu(title, content, folderToken);
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Feishu Push] Error:", message);

    // 区分各类错误
    if (message.includes("未配置")) {
      return Response.json({ error: message }, { status: 401 });
    }
    if (message.includes("token")) {
      return Response.json(
        { error: `飞书认证失败，请检查 FEISHU_APP_ID 和 FEISHU_APP_SECRET 是否正确。${message}` },
        { status: 500 }
      );
    }
    if (message.includes("rate") || message.includes("限流") || message.includes("99991400")) {
      return Response.json(
        { error: "飞书 API 请求频率过高，请稍后重试" },
        { status: 429 }
      );
    }

    return Response.json(
      { error: `推送到飞书失败: ${message}` },
      { status: 500 }
    );
  }
}
