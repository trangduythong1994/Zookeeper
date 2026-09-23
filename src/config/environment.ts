import "dotenv/config";

export interface Environment {
  clientId: string;
  guildId?: string;
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
    token: requiredEnvironmentVariable("DISCORD_TOKEN"),
    clientId: requiredEnvironmentVariable("DISCORD_CLIENT_ID"),
    guildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
  };
}
