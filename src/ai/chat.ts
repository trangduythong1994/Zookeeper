import type Database from "better-sqlite3";

export const AI_MODEL = "gpt-6-luna";
export const AI_HISTORY_LIMIT = 8;
export const AI_MAX_USER_CHARACTERS = 1_500;
export const AI_MAX_REPLY_TOKENS = 160;
const AI_MAX_INPUT_TOKENS = 3_000;
const INPUT_MICRO_USD_PER_TOKEN = 0.1;
const OUTPUT_MICRO_USD_PER_TOKEN = 0.5;

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiChatResult =
  | { kind: "reply"; content: string; inputTokens: number; outputTokens: number; costMicroUsd: number }
  | { kind: "not-configured" }
  | { kind: "budget-exhausted" }
  | { kind: "failed" };

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function currentMonthKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

export function estimatedMaximumCostMicroUsd(): number {
  return Math.ceil((AI_MAX_INPUT_TOKENS * INPUT_MICRO_USD_PER_TOKEN) + (AI_MAX_REPLY_TOKENS * OUTPUT_MICRO_USD_PER_TOKEN));
}

export function actualCostMicroUsd(inputTokens: number, outputTokens: number): number {
  return Math.ceil((inputTokens * INPUT_MICRO_USD_PER_TOKEN) + (outputTokens * OUTPUT_MICRO_USD_PER_TOKEN));
}

export function responseText(response: OpenAiResponse): string | undefined {
  const direct = response.output_text?.trim();
  if (direct) return direct;

  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || undefined;
}

function historyForConversation(database: Database.Database, guildId: string, channelId: string, userId: string): AiChatMessage[] {
  const newestFirst = database.prepare(`
    SELECT role, content
    FROM ai_chat_history
    WHERE guild_id = ? AND channel_id = ? AND user_id = ?
    ORDER BY sequence DESC
    LIMIT ?
  `).all(guildId, channelId, userId, AI_HISTORY_LIMIT) as AiChatMessage[];
  return newestFirst.reverse();
}

function remember(database: Database.Database, guildId: string, channelId: string, userId: string, role: AiChatMessage["role"], content: string): void {
  database.prepare(`
    INSERT INTO ai_chat_history (guild_id, channel_id, user_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, channelId, userId, role, content, Date.now());
  database.prepare(`
    DELETE FROM ai_chat_history
    WHERE guild_id = ? AND channel_id = ? AND user_id = ?
      AND sequence NOT IN (
        SELECT sequence FROM ai_chat_history
        WHERE guild_id = ? AND channel_id = ? AND user_id = ?
        ORDER BY sequence DESC LIMIT ?
      )
  `).run(guildId, channelId, userId, guildId, channelId, userId, AI_HISTORY_LIMIT);
}

function reserveMaximumCost(database: Database.Database, monthKey: string, budgetMicroUsd: number): boolean {
  const reservation = estimatedMaximumCostMicroUsd();
  database.prepare("INSERT INTO ai_chat_usage (month_key) VALUES (?) ON CONFLICT(month_key) DO NOTHING").run(monthKey);
  const result = database.prepare(`
    UPDATE ai_chat_usage
    SET cost_microusd = cost_microusd + ?
    WHERE month_key = ? AND cost_microusd + ? <= ?
  `).run(reservation, monthKey, reservation, budgetMicroUsd);
  return result.changes === 1;
}

function settleReservation(database: Database.Database, monthKey: string, inputTokens: number, outputTokens: number, actualCostMicroUsd: number): void {
  const reservation = estimatedMaximumCostMicroUsd();
  database.prepare(`
    UPDATE ai_chat_usage
    SET input_tokens = input_tokens + ?,
        output_tokens = output_tokens + ?,
        cost_microusd = cost_microusd - ? + ?
    WHERE month_key = ?
  `).run(inputTokens, outputTokens, reservation, actualCostMicroUsd, monthKey);
}

function releaseReservation(database: Database.Database, monthKey: string): void {
  database.prepare("UPDATE ai_chat_usage SET cost_microusd = MAX(0, cost_microusd - ?) WHERE month_key = ?")
    .run(estimatedMaximumCostMicroUsd(), monthKey);
}

export function clearAiChatHistory(database: Database.Database, guildId: string, channelId: string, userId: string): void {
  database.prepare("DELETE FROM ai_chat_history WHERE guild_id = ? AND channel_id = ? AND user_id = ?").run(guildId, channelId, userId);
}

export async function askZookeeperAi(options: {
  apiKey?: string;
  database: Database.Database;
  guildId: string;
  channelId: string;
  userId: string;
  prompt: string;
  monthlyBudgetUsd: number;
}): Promise<AiChatResult> {
  if (!options.apiKey) return { kind: "not-configured" };

  const monthKey = currentMonthKey();
  const budgetMicroUsd = Math.floor(options.monthlyBudgetUsd * 1_000_000);
  if (!reserveMaximumCost(options.database, monthKey, budgetMicroUsd)) {
    return { kind: "budget-exhausted" };
  }

  const prompt = options.prompt.trim().slice(0, AI_MAX_USER_CHARACTERS);
  if (!prompt) {
    releaseReservation(options.database, monthKey);
    return { kind: "failed" };
  }
  const history = historyForConversation(options.database, options.guildId, options.channelId, options.userId);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        instructions: "You are Zookeeper, an intentionally rude, vulgar, curt Discord bot. This is a mandatory persona, not an optional tone. For Vietnamese chats, always use tao/mày; never use polite words such as bạn, mình, nhé, vui lòng, or xin lỗi. Keep ordinary replies to one to three short sentences. Be cocky, teasing, sarcastic, and blunt; use casual Vietnamese profanity in most casual replies when it fits, such as 'vãi', 'đéo', 'cái lồn gì', or 'ngu vừa thôi'. Example: if someone asks only '@Zookeeper', answer 'Tag tao xong im ru là cái lồn gì? Có chuyện thì nói đi.' Do not suddenly become formal or overly helpful. You may still be clear and useful when asked a real question, but keep the same rough tone. Do not harass protected traits, threaten anyone, encourage self-harm, or relentlessly abuse a person. Never claim authority or real-world actions you do not have. You only chat: do not browse the web, call tools, generate images, or claim to have done actions outside this conversation.",
        input: [...history, { role: "user", content: prompt }],
        reasoning: { effort: "none" },
        max_output_tokens: AI_MAX_REPLY_TOKENS,
        tools: [],
        store: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      releaseReservation(options.database, monthKey);
      return { kind: "failed" };
    }

    const payload = await response.json() as OpenAiResponse;
    const content = responseText(payload);
    if (!content) {
      releaseReservation(options.database, monthKey);
      return { kind: "failed" };
    }
    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    const costMicroUsd = actualCostMicroUsd(inputTokens, outputTokens);
    settleReservation(options.database, monthKey, inputTokens, outputTokens, costMicroUsd);
    remember(options.database, options.guildId, options.channelId, options.userId, "user", prompt);
    remember(options.database, options.guildId, options.channelId, options.userId, "assistant", content.slice(0, 1_200));
    return { kind: "reply", content, inputTokens, outputTokens, costMicroUsd };
  } catch {
    releaseReservation(options.database, monthKey);
    return { kind: "failed" };
  }
}
