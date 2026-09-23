import { Client, Events, GatewayIntentBits } from "discord.js";
import { loadEnvironment } from "./config/environment.js";
import { logger } from "./utils/logger.js";
import { speechTextForMessage } from "./voice/command.js";
import { SpeakerManager } from "./voice/speaker.js";

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent],
  });
  const speakers = new SpeakerManager();
  let shuttingDown = false;

  client.once(Events.ClientReady, (readyClient) => {
    logger.info("Discord client is ready", { username: readyClient.user.tag, userId: readyClient.user.id });
  });

  client.on(Events.Error, (error) => {
    logger.error("Discord client error", { message: error.message, name: error.name });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot) return;

    const textToSpeak = speechTextForMessage(message.member?.displayName ?? message.author.username, message.content);
    if (!textToSpeak) return;

    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      await message.reply("Bạn cần tham gia một voice channel trước khi dùng `-s`.").catch(() => undefined);
      return;
    }

    try {
      const result = await speakers.speak(voiceChannel, textToSpeak);
      if (result === "busy") {
        await message.reply("Tao đang nói, đợi một chút!").catch(() => undefined);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Voice message failed", { guildId: message.guildId, channelId: voiceChannel.id, message: errorMessage });
      await message.reply("Tao không thể nói lúc này, thử lại sau nhé.").catch(() => undefined);
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const channel = oldState.channel ?? newState.channel;
    if (channel) speakers.leaveIfAlone(channel);
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

  logger.info("Logging in to Discord");
  await client.login(environment.token);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Bot startup failed", { message });
  process.exitCode = 1;
});
