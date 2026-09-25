import { Client, Events, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder, type Guild } from "discord.js";
import { rollChance } from "./chance/command.js";
import { colorInteger, isColorRoleName, normalizeHexColor } from "./color/command.js";
import { loadEnvironment } from "./config/environment.js";
import { provisionPrivateTestWorld, removePrivateTestWorld } from "./pokemon/setup/test-world.js";
import { initializeRegionBiomeDatabase } from "./pokemon/persistence/region-biome-database.js";
import { logger } from "./utils/logger.js";
import { SpeechIntroductionTracker, speechRequestFromMessage } from "./voice/command.js";
import { shouldAnnouncePresenceBoundary, shouldSpeakMemberArrival, shouldWelcomeFirstVoiceMember, watchedVoiceTransition } from "./voice/arrival.js";
import { SpeakerManager } from "./voice/speaker.js";
import { replaceUserMentionsForSpeech } from "./voice/mentions.js";

const WATCHED_USER_ID = "493076491106779148";
const VOICE_ARRIVAL_CHANNEL_ID = "1513220978816319538";

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const database = initializeRegionBiomeDatabase(environment.databasePath);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent],
  });
  const speakers = new SpeakerManager();
  const introductions = new SpeechIntroductionTracker();
  const watchedPresenceByGuild = new Map<string, string>();
  let shuttingDown = false;

  const chanceCommand = new SlashCommandBuilder()
    .setName("chance")
    .setDescription("Quay xác suất cho một câu hỏi")
    .addStringOption((option) => option
      .setName("question")
      .setDescription("Câu hỏi của bạn")
      .setRequired(true));
  const colorCommand = new SlashCommandBuilder()
    .setName("color")
    .setDescription("Đổi màu tên của bạn")
    .addStringOption((option) => option
      .setName("x")
      .setDescription("Mã màu dạng #000000")
      .setRequired(true));
  const pokemonSetupCommand = new SlashCommandBuilder().setName("pk-stup").setDescription("Tạo Pokémon test world riêng tư").setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  const pokemonRemoveCommand = new SlashCommandBuilder().setName("pk-rm").setDescription("Xóa Pokémon test world riêng tư").setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const registerCommands = async (guild: Guild): Promise<void> => {
    await guild.commands.set([chanceCommand, colorCommand, pokemonSetupCommand, pokemonRemoveCommand]);
    logger.info("Registered guild commands", { guildId: guild.id });
  };

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info("Discord client is ready", { username: readyClient.user.tag, userId: readyClient.user.id });
    await Promise.all(readyClient.guilds.cache.map((guild) => registerCommands(guild)));
    for (const guild of readyClient.guilds.cache.values()) {
      watchedPresenceByGuild.set(guild.id, guild.presences.cache.get(WATCHED_USER_ID)?.status ?? "offline");
    }
  });

  client.on(Events.GuildCreate, (guild) => {
    void registerCommands(guild).catch((error: unknown) => {
      logger.error("Could not register guild commands", { guildId: guild.id, message: error instanceof Error ? error.message : String(error) });
    });
  });

  client.on(Events.Error, (error) => {
    logger.error("Discord client error", { message: error.message, name: error.name });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot) return;

    const speechRequest = speechRequestFromMessage(message.content);
    if (!speechRequest) return;

    if (speechRequest.deleteSource) {
      void message.delete().catch((error: unknown) => {
        logger.error("Could not delete speech command", {
          channelId: message.channelId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (speakers.isGreeting(message.guildId)) {
      await message.reply("Tao đang nói, đợi một chút!").catch(() => undefined);
      return;
    }

    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      await message.reply("Bạn cần tham gia một voice channel trước khi dùng `-s`.").catch(() => undefined);
      return;
    }

    const textToSpeak = introductions.format(
      message.guildId,
      message.author.id,
      message.member?.displayName ?? message.author.username,
      replaceUserMentionsForSpeech(
        speechRequest.content,
        (userId) => message.mentions.members.get(userId)?.displayName
          ?? message.guild?.members.cache.get(userId)?.displayName
          ?? message.mentions.users.get(userId)?.globalName
          ?? message.mentions.users.get(userId)?.username,
      ),
      speechRequest.language,
      speechRequest.whisper,
      speechRequest.shouting,
    );

    try {
      await speakers.speak(voiceChannel, textToSpeak, speechRequest.language, speechRequest.provider);
      introductions.remember(message.guildId, message.author.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Voice message failed", { guildId: message.guildId, channelId: voiceChannel.id, message: errorMessage });
      await message.reply("Tao không nói được lúc này, thử lại sau.").catch(() => undefined);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "chance") {
      const question = interaction.options.getString("question", true);
      const chance = rollChance();
      await interaction.reply(`> ${question}\n**${chance.percent}%** — ${chance.response}`);
      return;
    }

    if (interaction.commandName === "pk-stup") {
      if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Lệnh này chỉ dành cho Administrator.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await provisionPrivateTestWorld(interaction.guild, interaction.client.user.id);
        await interaction.editReply(`Đã setup private Pokémon test world. Category: ${result.createdCategory ? "đã tạo" : "đã có"}; biome: ${result.createdAreas} tạo mới, ${result.existingAreas} có sẵn; ${result.pinnedMessages} status message đã ghim.`);
        logger.info("Provisioned private Pokémon test world", { guildId: interaction.guild.id, userId: interaction.user.id, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Could not provision private Pokémon test world", { guildId: interaction.guild.id, userId: interaction.user.id, message });
        await interaction.editReply("Không thể setup Pokémon test world. Bot cần quyền Manage Channels, Send Messages và Manage Messages.");
      }
      return;
    }

    if (interaction.commandName === "pk-rm") {
      if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Lệnh này chỉ dành cho Administrator.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await removePrivateTestWorld(interaction.guild);
        await interaction.editReply(result.removedCategory
          ? `Đã xóa Pokémon test world: ${result.removedAreas} biome channels và category.`
          : "Không tìm thấy Pokémon test world để xóa.");
        logger.info("Removed private Pokémon test world", { guildId: interaction.guild.id, userId: interaction.user.id, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Could not remove private Pokémon test world", { guildId: interaction.guild.id, userId: interaction.user.id, message });
        await interaction.editReply("Không thể xóa Pokémon test world. Bot cần quyền Manage Channels.");
      }
      return;
    }

    if (interaction.commandName !== "color" || !interaction.guild) return;

    const hex = normalizeHexColor(interaction.options.getString("x", true));
    if (!hex) {
      await interaction.reply({ content: "Mã màu phải có dạng `#000000`.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const botMember = await interaction.guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error("Bot needs the Manage Roles permission.");
      }

      const oldColorRoles = member.roles.cache.filter((role) => isColorRoleName(role.name));
      const rolesToCleanUp = [...oldColorRoles.values()];
      await member.roles.remove(rolesToCleanUp, "Replacing the member's color role");

      for (const role of rolesToCleanUp) {
        const refreshedRole = await interaction.guild.roles.fetch(role.id);
        if (refreshedRole && refreshedRole.members.size === 0 && refreshedRole.editable) {
          await refreshedRole.delete("Unused color role");
        }
      }

      const colorRole = await interaction.guild.roles.create({
        name: hex,
        colors: { primaryColor: colorInteger(hex) },
        reason: `Color selected by ${interaction.user.tag}`,
      });
      // Discord displays the color of a member's highest colored role. Put the
      // new role just under the bot so it wins over ordinary member roles.
      const positionedColorRole = await colorRole.setPosition(Math.max(1, botMember.roles.highest.position - 1));
      await member.roles.add(positionedColorRole, "Member selected a color");
      await interaction.editReply(`Màu tên của bạn đã đổi thành \`${hex}\`.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Could not set member color", { guildId: interaction.guildId, userId: interaction.user.id, message });
      await interaction.editReply("Không thể đổi màu. Bot cần quyền **Manage Roles** và role của bot phải nằm cao hơn các role màu.");
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot || oldState.channelId === newState.channelId) return;

    if (oldState.channel) speakers.leaveIfAlone(oldState.channel);

    const botChannelId = speakers.getVoiceChannelId(newState.guild.id);
    if (shouldWelcomeFirstVoiceMember(oldState.channelId, newState.channelId, botChannelId) && newState.channel) {
      try {
        await speakers.speakArrival(newState.channel, `${member.displayName} đã đến.`);
      } catch (error) {
        logger.error("Could not welcome the first voice member", {
          guildId: newState.guild.id,
          userId: member.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (shouldSpeakMemberArrival(oldState.channelId, newState.channelId, botChannelId) && newState.channel) {
      try {
        await speakers.speakArrival(newState.channel, `${member.displayName} đã đến.`);
      } catch (error) {
        logger.error("Could not speak member-arrival announcement", {
          guildId: newState.guild.id,
          userId: member.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const watchedTransition = watchedVoiceTransition(
      member.id,
      oldState.channelId,
      newState.channelId,
      WATCHED_USER_ID,
    );
    if (!watchedTransition) return;

    try {
      const notificationChannel = await newState.guild.channels.fetch(VOICE_ARRIVAL_CHANNEL_ID);
      if (!notificationChannel?.isTextBased()) {
        throw new Error("The configured voice-arrival channel is not text-based or is unavailable.");
      }

      const transitionMessage = watchedTransition === "joined"
        ? `${member.displayName} vừa vào voice <#${newState.channelId}>.`
        : watchedTransition === "left"
          ? `${member.displayName} vừa rời voice <#${oldState.channelId}>.`
          : `${member.displayName} vừa chuyển voice từ <#${oldState.channelId}> sang <#${newState.channelId}>.`;
      await notificationChannel.send({
        content: `@everyone 🟢 ${transitionMessage}`,
        allowedMentions: { parse: ["everyone"] },
      });
    } catch (error) {
      logger.error("Could not send voice-arrival notification", {
        guildId: newState.guild.id,
        userId: member.id,
        channelId: VOICE_ARRIVAL_CHANNEL_ID,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
    const guild = newPresence.guild;
    if (!guild) return;
    if (newPresence.userId !== WATCHED_USER_ID) return;

    const previousStatus = watchedPresenceByGuild.get(guild.id) ?? oldPresence?.status ?? "offline";
    watchedPresenceByGuild.set(guild.id, newPresence.status);

    if (!shouldAnnouncePresenceBoundary(
      newPresence.userId,
      previousStatus,
      newPresence.status,
      WATCHED_USER_ID,
    )) return;

    try {
      const notificationChannel = await guild.channels.fetch(VOICE_ARRIVAL_CHANNEL_ID);
      if (!notificationChannel?.isTextBased()) {
        throw new Error("The configured presence-notification channel is not text-based or is unavailable.");
      }

      const displayName = newPresence.member?.displayName ?? "Người dùng được theo dõi";
      await notificationChannel.send({
        content: `@everyone 🔄 ${displayName} chuyển status từ \`${previousStatus}\` sang \`${newPresence.status}\`.`,
        allowedMentions: { parse: ["everyone"] },
      });
    } catch (error) {
      logger.error("Could not send presence-change notification", {
        guildId: guild.id,
        userId: newPresence.userId,
        channelId: VOICE_ARRIVAL_CHANNEL_ID,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down Discord client", { signal });
    client.destroy();
    database.close();
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
  void speakers.warmUpTts().catch((error: unknown) => {
    logger.error("Edge TTS warm-up failed", { message: error instanceof Error ? error.message : String(error) });
  });
  await client.login(environment.token);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Bot startup failed", { message });
  process.exitCode = 1;
});
