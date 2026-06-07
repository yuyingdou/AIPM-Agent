/**
 * 飞书开放平台 API 客户端（服务端 only）
 *
 * 功能：
 * - 获取 tenant_access_token（带内存缓存）
 * - 创建飞书文档
 * - 将 Markdown 转换为飞书文档 Blocks 并写入
 *
 * 文档 API: https://open.feishu.cn/document/server-docs/docs/docs/docx-v1
 */

// ============================================================
// 常量
// ============================================================

const FEISHU_HOST = "https://open.feishu.cn/open-apis";

/** 飞书 Block 类型枚举 */
const BLOCK_TYPE: Record<string, number> = {
  text: 2,
  heading1: 3, heading2: 4, heading3: 5,
  heading4: 6, heading5: 7, heading6: 8,
  heading7: 9, heading8: 10, heading9: 11,
  bullet: 12,
  ordered: 13,
  code: 14,
  divider: 15,
  table: 31,
};

/** 单次 API 可追加的最大块数 */
const MAX_BLOCKS_PER_REQUEST = 50;

// ============================================================
// Token 缓存
// ============================================================

let cachedToken: string | null = null;
let tokenExpireAt: number = 0;

// ============================================================
// 类型定义
// ============================================================

interface TextRun {
  text_run: {
    content: string;
    text_element_style?: {
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      inline_code?: boolean;
    };
  };
}

interface FeishuBlock {
  block_type: number;
  [key: string]: unknown;
}

interface FeishuApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

// ============================================================
// API 认证
// ============================================================

export async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("FEISHU_APP_ID 或 FEISHU_APP_SECRET 未配置");
  }

  // 缓存命中（提前 5 分钟刷新）
  if (cachedToken && Date.now() < tokenExpireAt - 300_000) {
    return cachedToken;
  }

  const res = await fetch(`${FEISHU_HOST}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const json: any = await res.json();

  if (json.code !== 0) {
    // 常见错误码的特殊处理
    if (json.code === 99991668 || json.code === 99991672) {
      throw new Error(
        `飞书应用未发布（状态为"待上线"）。请前往飞书开放平台 → 应用 → 版本管理与发布 → 创建版本并发布。\n详情: [${json.code}] ${json.msg}`
      );
    }
    throw new Error(`获取飞书 token 失败: [${json.code}] ${json.msg}`);
  }

  // 飞书 API 的 tenant_access_token 可能在顶层也可能在 data 中
  const token = json.tenant_access_token || json.data?.tenant_access_token;
  const expire = json.expire || json.data?.expire || 7200;

  if (!token) {
    throw new Error(
      `飞书 API 响应异常：未返回 token。完整响应: ${JSON.stringify(json)}`
    );
  }

  cachedToken = token;
  tokenExpireAt = Date.now() + expire * 1000;
  return token;
}

// ============================================================
// 文档操作
// ============================================================

export async function createDocument(
  title: string,
  folderToken?: string
): Promise<{ documentId: string; url: string }> {
  const token = await getTenantAccessToken();

  const body: Record<string, string> = { title };
  if (folderToken) {
    body.folder_token = folderToken;
  }

  const res = await fetch(`${FEISHU_HOST}/docx/v1/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();

  let json: any;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(
      `创建飞书文档失败：API 返回非 JSON。HTTP ${res.status}: ${rawText.slice(0, 200)}`
    );
  }

  if (json.code !== 0) {
    throw new Error(`创建飞书文档失败: [${json.code}] ${json.msg}`);
  }

  // 飞书 API 的 data 可能在顶层也可能在 data 字段中
  const doc = json.data?.document || json.document;

  if (!doc?.document_id) {
    throw new Error(
      `飞书创建文档响应异常。完整响应: ${JSON.stringify(json)}`
    );
  }

  // 飞书文档访问地址：https://{tenant}.feishu.cn/docx/{document_id}
  // API 返回的 url 可能为空，需要自行拼接
  const feishuDomain = process.env.FEISHU_DOMAIN || "bytedance.feishu.cn";
  const url = doc.url || `https://${feishuDomain}/docx/${doc.document_id}`;

  return {
    documentId: doc.document_id,
    url,
  };
}

async function appendBlocksRaw(
  documentId: string,
  parentBlockId: string,
  blocks: FeishuBlock[]
): Promise<void> {
  const token = await getTenantAccessToken();

  const res = await fetch(
    `${FEISHU_HOST}/docx/v1/documents/${documentId}/blocks/${parentBlockId}/children`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        children: blocks,
      }),
    }
  );

  const json: any = await res.json();

  if (json.code !== 0) {
    throw new Error(`追加文档内容失败: [${json.code}] ${json.msg}`);
  }
}

/**
 * 分批追加块到文档（单次最多 50 块）
 */
async function appendBlocks(
  documentId: string,
  blocks: FeishuBlock[]
): Promise<void> {
  // 文档 root block_id 即 document_id 本身
  const rootBlockId = documentId;

  console.log(`[Feishu] Pushing ${blocks.length} blocks in batches of ${MAX_BLOCKS_PER_REQUEST}`);
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_REQUEST) {
    const batch = blocks.slice(i, i + MAX_BLOCKS_PER_REQUEST);
    console.log(`[Feishu] Batch ${Math.floor(i / MAX_BLOCKS_PER_REQUEST) + 1}: ${batch.length} blocks, types: [${batch.map(b => b.block_type).join(",")}]`);
    await appendBlocksRaw(documentId, rootBlockId, batch);
  }
}

// ============================================================
// Markdown → Feishu Blocks 转换器
// ============================================================

/**
 * 解析行内格式：**bold** *italic* ~~strikethrough~~ `code`
 * 返回 text_run 数组
 */
function parseInlineElements(line: string): TextRun[] {
  const runs: TextRun[] = [];
  // 匹配：**bold** | *italic* | ~~strikethrough~~ | `code` | 普通文本
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(`(.+?)`)|([^*~`]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match[2] !== undefined) {
      // **bold**
      runs.push({
        text_run: {
          content: match[2],
          text_element_style: { bold: true },
        },
      });
    } else if (match[4] !== undefined) {
      // *italic*
      runs.push({
        text_run: {
          content: match[4],
          text_element_style: { italic: true },
        },
      });
    } else if (match[6] !== undefined) {
      // ~~strikethrough~~
      runs.push({
        text_run: {
          content: match[6],
          text_element_style: { strikethrough: true },
        },
      });
    } else if (match[8] !== undefined) {
      // `code`
      runs.push({
        text_run: {
          content: match[8],
          text_element_style: { inline_code: true },
        },
      });
    } else if (match[9] !== undefined) {
      // 普通文本
      runs.push({
        text_run: {
          content: match[9],
          text_element_style: {},
        },
      });
    }
  }

  // 处理空行或未匹配的行
  if (runs.length === 0 && line.trim()) {
    runs.push({
      text_run: { content: line, text_element_style: {} },
    });
  }

  return runs;
}

/**
 * 构建标题块
 */
function makeHeadingBlock(level: number, elements: TextRun[]): FeishuBlock {
  const blockType = BLOCK_TYPE[`heading${level}`] || BLOCK_TYPE.text;
  return {
    block_type: blockType,
    [`heading${level}`]: { elements },
  };
}

/**
 * 构建文本块
 */
function makeTextBlock(elements: TextRun[]): FeishuBlock {
  return {
    block_type: BLOCK_TYPE.text,
    text: { elements },
  };
}

/**
 * 构建列表块（bullet 或 ordered）
 */
function makeListBlock(
  type: "bullet" | "ordered",
  elements: TextRun[]
): FeishuBlock {
  return {
    block_type: type === "bullet" ? BLOCK_TYPE.bullet : BLOCK_TYPE.ordered,
    [type]: { elements },
  };
}

/**
 * 构建代码块
 */
function makeCodeBlock(code: string, _language?: string): FeishuBlock {
  // 去掉末尾多余空行
  const cleaned = code.replace(/\n+$/, "");
  return {
    block_type: BLOCK_TYPE.code,
    code: {
      elements: [{ text_run: { content: cleaned, text_element_style: {} } }],
      style: {},
    },
  };
}

/**
 * 构建分割线块
 */
function makeDividerBlock(): FeishuBlock {
  return {
    block_type: BLOCK_TYPE.divider,
    divider: {},
  };
}

/**
 * 构建表格块
 */
function makeTableBlock(rows: TextRun[][][]): FeishuBlock | null {
  if (rows.length === 0) return null;

  const columnSize = Math.max(...rows.map((r) => r.length));
  const rowSize = rows.length;

  // 飞书表格要求每个 cell 是一个 block 数组（每个 cell 内含一个 text block）
  const cells = rows.map((row) => {
    const padded = [...row];
    while (padded.length < columnSize) {
      padded.push([{ text_run: { content: "", text_element_style: {} } }]);
    }
    // 每个 cell 是 block[]，这里用 text block 包裹 text elements
    return padded.map((elements) => [
      {
        block_type: BLOCK_TYPE.text,
        text: { elements, style: {} },
      },
    ]);
  });

  return {
    block_type: BLOCK_TYPE.table,
    table: {
      cells,
      property: { column_size: columnSize, row_size: rowSize },
    },
  };
}

/**
 * 将 Markdown 文本转换为飞书文档 Blocks 数组
 */
export function markdownToFeishuBlocks(markdown: string): FeishuBlock[] {
  const lines = markdown.split("\n");
  const blocks: FeishuBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // --- 空行 ---
    if (trimmed === "") {
      i++;
      continue;
    }

    // --- 代码块 ---
    const codeFence = trimmed.match(/^```(\w*)$/);
    if (codeFence) {
      const lang = codeFence[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().match(/^```$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合 ```
      blocks.push(makeCodeBlock(codeLines.join("\n"), lang));
      continue;
    }

    // --- 表格 → 转为文本段落（飞书 block API 表格格式兼容性差）---
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length) {
        const row = lines[i].trim();
        if (!row.startsWith("|") || !row.endsWith("|")) break;
        // 跳过分隔行
        if (!/^\|[\s\-:]+\|[\s\-:|\s]*$/.test(row)) {
          tableLines.push(row);
        }
        i++;
      }
      // 每行表格转为一条文本段落
      for (const row of tableLines) {
        const cellText = row
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim())
          .join("  |  ");
        blocks.push(
          makeTextBlock([{ text_run: { content: `📊 ${cellText}`, text_element_style: {} } }])
        );
      }
      continue;
    }

    // --- 标题 ---
    const headingMatch = trimmed.match(/^(#{1,9})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length; // 1-9
      const text = headingMatch[2];
      // # → Heading2（飞书文档标题用 Heading1，所以从 Heading2 开始映射）
      const headingLevel = Math.min(level + 1, 9);
      blocks.push(makeHeadingBlock(headingLevel, parseInlineElements(text)));
      i++;
      continue;
    }

    // --- 分割线 → 跳过（飞书 block API 对 divider 支持不稳定）---
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      i++;
      continue;
    }

    // --- 无序列表 ---
    const bulletMatch = trimmed.match(/^[\-\*]\s+(.+)/);
    if (bulletMatch) {
      const listItems: TextRun[][] = [];
      while (i < lines.length) {
        const li = lines[i].trim();
        const bm = li.match(/^[\-\*]\s+(.+)/);
        if (!bm) break;
        listItems.push(parseInlineElements(bm[1]));
        i++;
      }
      for (const item of listItems) {
        blocks.push(makeListBlock("bullet", item));
      }
      continue;
    }

    // --- 有序列表 ---
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (orderedMatch) {
      const listItems: TextRun[][] = [];
      while (i < lines.length) {
        const li = lines[i].trim();
        const om = li.match(/^\d+\.\s+(.+)/);
        if (!om) break;
        listItems.push(parseInlineElements(om[1]));
        i++;
      }
      for (const item of listItems) {
        blocks.push(makeListBlock("ordered", item));
      }
      continue;
    }

    // --- 普通段落：收集连续非结构行 ---
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      // 遇到结构行或空行就停止收集
      if (
        l === "" ||
        /^(#{1,9})\s/.test(l) ||
        /^```/.test(l) ||
        /^[\-\*]\s/.test(l) ||
        /^\d+\.\s/.test(l) ||
        (l.startsWith("|") && l.endsWith("|")) ||
        /^(-{3,}|\*{3,})$/.test(l) ||
        /^>/.test(l) // 跳过后面的引用检测
      ) {
        // 但先检查是否是引用（> 开头）
        if (/^>/.test(l)) {
          paraLines.push(l.replace(/^>\s?/, ""));
          i++;
          continue;
        }
        break;
      }
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const paraText = paraLines.join("\n");
      blocks.push(makeTextBlock(parseInlineElements(paraText)));
    } else {
      i++; // 防止死循环
    }
  }

  return blocks;
}

// ============================================================
// 主入口：一键推送 Markdown 到飞书文档
// ============================================================

export interface PushResult {
  url: string;
  documentId: string;
  title: string;
}

export async function pushToFeishu(
  title: string,
  markdown: string,
  folderToken?: string
): Promise<PushResult> {
  // 1. 创建空白文档
  const { documentId, url } = await createDocument(title, folderToken);

  // 2. Markdown → Blocks
  const blocks = markdownToFeishuBlocks(markdown);

  // 3. 写入内容
  if (blocks.length > 0) {
    await appendBlocks(documentId, blocks);
  }

  return { url, documentId, title };
}
