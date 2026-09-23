import "dotenv/config";

export interface Environment {
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
  };
}
