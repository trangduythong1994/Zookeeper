import { REST, Routes } from "discord.js";
import type { Environment } from "./config/environment.js";
import { commands } from "./commands/index.js";
import { logger } from "./utils/logger.js";

export async function registerCommands(environment: Environment): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(environment.token);
  const body = commands.map((command) => command.data.toJSON());

  if (environment.guildId) {
    await rest.put(Routes.applicationGuildCommands(environment.clientId, environment.guildId), { body });
    logger.info("Registered guild commands", { commandCount: body.length, guildId: environment.guildId });
    return;
  }

  await rest.put(Routes.applicationCommands(environment.clientId), { body });
  logger.info("Registered global commands", { commandCount: body.length });
}
