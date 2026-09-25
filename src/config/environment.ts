import "dotenv/config";

export interface Environment {
  databasePath: string;
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
  return {
    databasePath: process.env.DATABASE_PATH?.trim() || "work/zookeeper.sqlite",
    token: requiredEnvironmentVariable("DISCORD_TOKEN"),
  };
}
