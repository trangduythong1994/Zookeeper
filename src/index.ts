import { Client, Events, GatewayIntentBits, type Interaction } from "discord.js";
import { commandsByName } from "./commands/index.js";
import { loadEnvironment } from "./config/environment.js";
import { registerCommands } from "./register-commands.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let shuttingDown = false;

  client.once(Events.ClientReady, (readyClient) => {
    logger.info("Discord client is ready", { username: readyClient.user.tag, userId: readyClient.user.id });
  });

  client.on(Events.Error, (error) => {
    logger.error("Discord client error", { message: error.message, name: error.name });
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandsByName.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Command execution failed", { command: interaction.commandName, message });

      const reply = { content: "Something went wrong while running that command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => undefined);
      } else {
        await interaction.reply(reply).catch(() => undefined);
      }
    }
  });

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down Discord client", { signal });
    client.destroy();
    logger.info("Discord client shut down");
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { message: error.message, name: error.name });
    shutdown("uncaughtException");
  });

  logger.info("Registering Discord application commands");
  await registerCommands(environment);
  logger.info("Logging in to Discord");
  await client.login(environment.token);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Bot startup failed", { message });
  process.exitCode = 1;
});
