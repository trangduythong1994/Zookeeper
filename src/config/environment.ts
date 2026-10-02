import "dotenv/config";

export interface Environment {
  databasePath: string;
  googleCloudTtsApiKey?: string;
  openAiApiKey?: string;
  openAiMonthlyBudgetUsd: number;
  token: string;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadEnvironment(): Environment {
  const monthlyBudget = Number(process.env.OPENAI_AI_MONTHLY_BUDGET_USD?.trim() || "3");

  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    throw new Error("OPENAI_AI_MONTHLY_BUDGET_USD must be a positive number");
  }

  return {
    databasePath: process.env.DATABASE_PATH?.trim() || "work/zookeeper.sqlite",
    googleCloudTtsApiKey: process.env.GOOGLE_CLOUD_TTS_API_KEY?.trim() || undefined,
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openAiMonthlyBudgetUsd: monthlyBudget,
    token: requiredEnvironmentVariable("DISCORD_TOKEN"),
  };
}
