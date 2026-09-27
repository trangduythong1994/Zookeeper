import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, ThreadAutoArchiveDuration, type ButtonInteraction, type ChatInputCommandInteraction, type Guild, type Message, type ThreadChannel } from "discord.js";
import { rollChance } from "./chance/command.js";
import { colorInteger, isColorRoleName, normalizeHexColor } from "./color/command.js";
import { loadEnvironment } from "./config/environment.js";
import { provisionPrivateTestWorld, removePrivateTestWorld } from "./pokemon/setup/test-world.js";
import { removeKantoWorld } from "./pokemon/setup/kanto-world.js";
import { initializeRegionBiomeDatabase } from "./pokemon/persistence/region-biome-database.js";
import { explorePokemon, explorePokemonAtLocation, officialArtworkUrl, type ExploreContext, type ExploredPokemon } from "./pokemon/explore/explore.js";
import { type RegionKey } from "./pokemon/data/regions.js";
import { locationsForRegion, pokemonForLocation, regionsWithLocations, selectedLocationForPlayer, setPlayerLocation, type TravelLocation } from "./pokemon/travel/travel.js";
import { provisionExploreChannel } from "./pokemon/setup/explore-channel.js";
import { rarityBadgePng } from "./pokemon/explore/rarity-badge.js";
import { CATCH_BUTTON_ID, CATCH_SYMBOLS, EVENT_CATCH_SYMBOLS, EXPLORE_COOLDOWN_MS, SPAWN_LIFETIME_MS, activeSpawnInChannel, addPokemonSpawn, catchInputId, catchPlayId, caughtPokemonForPlayer, createCatchSession, giftCaughtPokemon, giftCooldownRemaining, parseCatchInputId, parseCatchPlayId, pokemonSpawn, previewDurationMs, resolvePokemonCaught, resolvePokemonFled, type CatchSession, type CatchSymbolIndex, type PokemonSpawn } from "./pokemon/catch/catch.js";
import { addWarpCandy, consumeWarpCandy, findsWarpCandy, setWarpCandyChance, warpCandyChance, warpCandyCount } from "./pokemon/warp/warp.js";
import { roamingChance, roamingPokemonForRegion, setRoamingChance } from "./pokemon/roaming/roaming.js";
import { logger } from "./utils/logger.js";
import { SpeechIntroductionTracker, speechRequestFromMessage } from "./voice/command.js";
import { shouldAnnouncePresenceBoundary, shouldSpeakMemberArrival, shouldWelcomeFirstVoiceMember, watchedVoiceTransition } from "./voice/arrival.js";
import { SpeakerManager } from "./voice/speaker.js";
import { replaceUserMentionsForSpeech } from "./voice/mentions.js";

const WATCHED_USER_ID = "493076491106779148";
const VOICE_ARRIVAL_CHANNEL_ID = "1513220978816319538";
const POKEMON_EXPLORE_ROLE_ID = "1453575259843461120";
const LOCATION_EXPLORE_BUTTON_ID = "pk-explore-location";
const TRAVEL_BUTTON_ID = "pk-travel-start";
const TELEPORT_BUTTON_ID = "pk-teleport";
const SHOW_OFF_BUTTON_ID = "pk-showoff-start";
const OWNERSHIP_BUTTON_ID = "pk-check-owned";
const LOCATION_PAGE_SIZE = 25;
const STARTER_EVENT_SEQUENCE_LENGTH = 8;
const STARTER_EVENT_CATCH_RATE = 6;
const STARTER_EVENT_LOCATION_KEY = "kanto-starter-event";
const STARTER_EVENT_LIFETIME_MS = 6.5 * 60 * 60 * 1_000;
const STARTER_EVENT_ENCOUNTER_RATE = 0.02;
const STARTER_EVENT_PREVIEW_EXTRA_MS = 2_000;
const STARTER_EVENT_SPAWN_LIFETIME_MS = 90_000;

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const database = initializeRegionBiomeDatabase(environment.databasePath);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent],
  });
  const speakers = new SpeakerManager();
  const introductions = new SpeechIntroductionTracker();
  const watchedPresenceByGuild = new Map<string, string>();
  const catchSessions = new Map<string, CatchSession>();
  const catchInvitations = new Map<string, Message>();
  const catchThreads = new Map<string, ThreadChannel>();
  const catchThreadDeletionTimers = new Map<string, NodeJS.Timeout>();
  const exploreCooldowns = new Map<string, number>();
  const spawnTimers = new Map<string, NodeJS.Timeout>();
  const travelDrafts = new Map<string, TravelLocation>();
  const travelThreadDeletionTimers = new Map<string, NodeJS.Timeout>();
  const managedThreadDeletionTimers = new Map<string, NodeJS.Timeout>();
  const starterEventEndTimers = new Map<string, NodeJS.Timeout>();
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
  const pokemonTestRemoveCommand = new SlashCommandBuilder().setName("pk-rm").setDescription("Xóa Pokémon test world riêng tư").setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  const pokemonExploreCommand = new SlashCommandBuilder().setName("pk-explore").setDescription("Explore Pokémon at your current location");
  const pokemonCatchCommand = new SlashCommandBuilder().setName("pk-catch").setDescription("Catch the Pokémon appearing here");
  const pokemonTravelCommand = new SlashCommandBuilder().setName("pk-travel").setDescription("Choose a Region and Location");
  const pokemonShowOffCommand = new SlashCommandBuilder().setName("pk-showoff").setDescription("Show off a Pokémon you caught");
  const pokemonGiftCommand = new SlashCommandBuilder().setName("pk-gift").setDescription("Gift a Pokémon from your Inventory");
  const pokemonWarpCandyCommand = new SlashCommandBuilder()
    .setName("pk-candy-warp-up")
    .setDescription("Set the Warp Candy discovery rate")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addNumberOption((option) => option.setName("percent").setDescription("Chance per Explore, from 0 to 100").setRequired(true).setMinValue(0).setMaxValue(100));
  const pokemonRoamingCommand = new SlashCommandBuilder()
    .setName("pk-roaming-up")
    .setDescription("Set the Roaming Pokémon encounter rate")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addNumberOption((option) => option.setName("percent").setDescription("Chance per Explore, from 0 to 100").setRequired(true).setMinValue(0).setMaxValue(100));
  const pokemonCreateCommand = new SlashCommandBuilder().setName("pk-create").setDescription("Tạo channel Pokémon #explore").setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  const pokemonRemoveCommand = new SlashCommandBuilder().setName("pk-remove").setDescription("Xóa category Kanto và toàn bộ biome").setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const registerCommands = async (guild: Guild): Promise<void> => {
    await guild.commands.set([chanceCommand, colorCommand, pokemonSetupCommand, pokemonTestRemoveCommand, pokemonExploreCommand, pokemonCatchCommand, pokemonTravelCommand, pokemonShowOffCommand, pokemonGiftCommand, pokemonWarpCandyCommand, pokemonRoamingCommand, pokemonCreateCommand, pokemonRemoveCommand]);
    logger.info("Registered guild commands", { guildId: guild.id });
  };

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info("Discord client is ready", { username: readyClient.user.tag, userId: readyClient.user.id });
    await Promise.all(readyClient.guilds.cache.map((guild) => registerCommands(guild)));
    for (const guild of readyClient.guilds.cache.values()) {
      watchedPresenceByGuild.set(guild.id, guild.presences.cache.get(WATCHED_USER_ID)?.status ?? "offline");
      const event = database.prepare("SELECT expires_at AS expiresAt FROM pokemon_event_announcements WHERE guild_id = ? AND event_key = 'starter-event'").get(guild.id) as { expiresAt: number | null } | undefined;
      const eventChannel = guild.channels.cache.find((channel) => channel.isTextBased() && channel.name === "event");
      if (event?.expiresAt && eventChannel?.isTextBased()) scheduleStarterEventEnd(guild.id, eventChannel.id, event.expiresAt);
      const activeThreads = await guild.channels.fetchActiveThreads().catch(() => undefined);
      for (const thread of activeThreads?.threads.values() ?? []) {
        if (/^(Catch |Travel ·|Inventory ·)/u.test(thread.name)) scheduleManagedThreadExpiry(thread);
      }
    }
  });

  const mayExplore = async (guild: Guild, userId: string): Promise<boolean> => {
    const member = await guild.members.fetch(userId);
    return member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(POKEMON_EXPLORE_ROLE_ID);
  };

  const displayKey = (key: string): string => key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const displayBiomes = (location: TravelLocation): string => location.biomeKeys.length > 0 ? location.biomeKeys.map(displayKey).join(", ") : "Not Classified";
  const encounterRarityLabel = (rarity: string | null): string => ({ common: "Common", uncommon: "Uncommon", rare: "Rare", ultra_rare: "Ultra Rare", mythic_rare: "Mythic Rare" }[rarity ?? ""] ?? "Unknown");
  const catchDifficulty = (rate: number): string => rate >= 40 ? "Easy" : rate >= 20 ? "Normal" : rate >= 10 ? "Challenging" : rate >= 5 ? "Hard" : "Very Hard";
  const fleeDifficulty = (rate: number | null): string => rate === null ? "Does not flee" : rate <= 5 ? "Low" : rate <= 10 ? "Medium" : rate <= 20 ? "High" : "Very High";
  const typeDisplay: Record<string, string> = { normal: "⚪Normal", fire: "🔥Fire", water: "💧Water", electric: "⚡Electric", grass: "🌿Grass", ice: "❄️Ice", fighting: "🥊Fighting", poison: "☠️Poison", ground: "⛰️Ground", flying: "🪽Flying", psychic: "🔮Psychic", bug: "🐛Bug", rock: "🪨Rock", ghost: "👻Ghost", dragon: "🐉Dragon", dark: "🌑Dark", steel: "⚙️Steel", fairy: "✨Fairy" };
  const formatTypes = (types: string[]): string => types.map((type) => typeDisplay[type] ?? displayKey(type)).join(", ");
  const locationPokemonList = (location: TravelLocation): string => {
    const lines = pokemonForLocation(database, location).map((pokemon) => `#${String(pokemon.nationalDex).padStart(3, "0")} ${pokemon.nameEn} · ${encounterRarityLabel(pokemon.rarity.key)}`);
    const result = lines.join("\n");
    return result.length <= 3000 ? result : `${result.slice(0, 2980).trimEnd()}\n…`;
  };

  const catchComponents = (messageId: string, state: "active" | "caught" | "fled" = "active") => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LOCATION_EXPLORE_BUTTON_ID).setLabel("Explore").setEmoji("🔎").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CATCH_BUTTON_ID).setLabel(state === "caught" ? "Caught" : state === "fled" ? "Fled" : "Catch").setEmoji("🎯").setStyle(ButtonStyle.Success).setDisabled(state !== "active"),
    new ButtonBuilder().setCustomId(TELEPORT_BUTTON_ID).setLabel("Teleport").setEmoji("🌀").setStyle(ButtonStyle.Secondary),
  );

  const catchNavigationComponents = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TRAVEL_BUTTON_ID).setLabel("Travel").setEmoji("🧭").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(SHOW_OFF_BUTTON_ID).setLabel("Inventory").setEmoji("🎒").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(OWNERSHIP_BUTTON_ID).setLabel("Owned?").setEmoji("📦").setStyle(ButtonStyle.Secondary),
  );

  const navigationComponents = () => [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LOCATION_EXPLORE_BUTTON_ID).setLabel("Explore").setEmoji("🔎").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(TRAVEL_BUTTON_ID).setLabel("Travel").setEmoji("🧭").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(SHOW_OFF_BUTTON_ID).setLabel("Inventory").setEmoji("🎒").setStyle(ButtonStyle.Secondary),
  )];

  const catchInputComponents = (messageId: string, userId: string, symbols: readonly string[] = CATCH_SYMBOLS) => Array.from(
    { length: Math.ceil(symbols.length / 4) },
    (_, rowIndex) => new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...symbols.slice(rowIndex * 4, rowIndex * 4 + 4).map((symbol, offset) => {
        const symbolIndex = rowIndex * 4 + offset;
        return new ButtonBuilder().setCustomId(catchInputId(messageId, userId, symbolIndex as CatchSymbolIndex)).setLabel(symbol).setStyle(ButtonStyle.Secondary);
      }),
    ),
  );

  const catchSymbolsForSpawn = (spawn: PokemonSpawn): readonly string[] => spawn.isEvent ? EVENT_CATCH_SYMBOLS : CATCH_SYMBOLS;

  const disabledCatchPlayComponents = (messageId: string, userId: string) => [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(catchPlayId(messageId, userId)).setLabel("Play").setEmoji("▶️").setStyle(ButtonStyle.Success).setDisabled(true),
  )];

  const sessionKey = (messageId: string, userId: string): string => `${messageId}:${userId}`;
  const canExploreNow = (guildId: string, userId: string): number => Math.max(0, (exploreCooldowns.get(`${guildId}:${userId}`) ?? 0) - Date.now());
  const markExplored = (guildId: string, userId: string): void => {
    exploreCooldowns.set(`${guildId}:${userId}`, Date.now() + EXPLORE_COOLDOWN_MS);
  };

  const scheduleManagedThreadExpiry = (thread: ThreadChannel): void => {
    const existing = managedThreadDeletionTimers.get(thread.id);
    if (existing) clearTimeout(existing);
    const remaining = Math.max(0, (thread.createdTimestamp ?? Date.now()) + 5 * 60_000 - Date.now());
    managedThreadDeletionTimers.set(thread.id, setTimeout(() => {
      managedThreadDeletionTimers.delete(thread.id);
      void thread.delete("Managed Pokémon thread expired after five minutes").catch(() => undefined);
    }, remaining));
  };

  const disableCatch = async (message: { id: string; edit: (options: object) => Promise<unknown> }, state: "caught" | "fled"): Promise<void> => {
    await message.edit({ components: [catchComponents(message.id, state), catchNavigationComponents()] }).catch(() => undefined);
  };

  const disableSpawnCatch = async (spawn: PokemonSpawn, state: "caught" | "fled"): Promise<void> => {
    const channel = await client.channels.fetch(spawn.channelId).catch(() => undefined);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(spawn.messageId).catch(() => undefined);
    if (message) await disableCatch(message, state);
  };

  const closeCatchSessions = async (messageId: string, content: string, exceptUserId?: string): Promise<void> => {
    const closes: Promise<void>[] = [];
    const startedKeys = new Set<string>();
    for (const [key, session] of catchSessions.entries()) {
      if (!key.startsWith(`${messageId}:`)) continue;
      startedKeys.add(key);
      catchSessions.delete(key);
      if (!exceptUserId || key !== sessionKey(messageId, exceptUserId)) closes.push(session.close?.(content) ?? Promise.resolve());
    }
    for (const [key, invitation] of catchInvitations.entries()) {
      if (!key.startsWith(`${messageId}:`)) continue;
      catchInvitations.delete(key);
      if (startedKeys.has(key)) continue;
      const [, userId] = key.split(":");
      if (userId) closes.push(invitation.edit({ components: disabledCatchPlayComponents(messageId, userId) }).then(() => undefined).catch(() => undefined));
    }
    await Promise.all(closes);
  };

  const scheduleCatchThreadDeletion = (messageId: string): void => {
    const existing = catchThreadDeletionTimers.get(messageId);
    if (existing) clearTimeout(existing);
    catchThreadDeletionTimers.set(messageId, setTimeout(() => {
      catchThreadDeletionTimers.delete(messageId);
      const thread = catchThreads.get(messageId);
      catchThreads.delete(messageId);
      void thread?.delete("Pokémon catch resolved").catch(() => undefined);
    }, 60_000));
  };

  const closeCatchThreadAfterResolution = (messageId: string): void => {
    if (catchThreads.has(messageId)) {
      scheduleCatchThreadDeletion(messageId);
      return;
    }
    void client.channels.fetch(messageId).then((channel) => {
      if (!channel?.isThread()) return;
      catchThreads.set(messageId, channel);
      scheduleCatchThreadDeletion(messageId);
    }).catch(() => undefined);
  };

  const expireSpawn = async (message: { id: string; edit: (options: object) => Promise<unknown> }): Promise<void> => {
    spawnTimers.delete(message.id);
    const fled = resolvePokemonFled(database, message.id);
    if (!fled) return;
    await closeCatchSessions(message.id, `${fled.pokemonName} fled!`);
    await disableCatch(message, "fled");
    closeCatchThreadAfterResolution(message.id);
  };

  const scheduleSpawnExpiry = (message: { id: string; edit: (options: object) => Promise<unknown> }, expiresAt: number): void => {
    const existing = spawnTimers.get(message.id);
    if (existing) clearTimeout(existing);
    spawnTimers.set(message.id, setTimeout(() => void expireSpawn(message), Math.max(0, expiresAt - Date.now())));
  };

  const travelMessage = (userId: string, regionKey?: RegionKey, locations: TravelLocation[] = [], selected?: TravelLocation, page = 0) => {
    const pageCount = Math.max(1, Math.ceil(locations.length / LOCATION_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, pageCount - 1));
    const locationOptions: TravelLocation[] = locations.length > 0
      ? locations.slice(safePage * LOCATION_PAGE_SIZE, (safePage + 1) * LOCATION_PAGE_SIZE)
      : [{ key: "unavailable", name: "Chưa có location", biomeKeys: [], regionKey: "kanto" }];
    return ({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(selected ? `Travel to ${selected.name}` : "Pokémon Travel")
      .setDescription(selected
        ? `Destination: **${selected.name}**.\nRegion: **${displayKey(selected.regionKey)}**\nBiome: **${displayBiomes(selected)}**\n\nPokémon:\n${locationPokemonList(selected) || "None"}\n\nPress **Go!** to confirm.`
        : "Choose a **Region**, then choose a **Location**. The Biome is determined by the selected location."),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`pk-travel:region:${userId}`)
          .setPlaceholder("Choose a Region")
          .addOptions(regionsWithLocations(database).map((key) => ({
            label: key[0].toUpperCase() + key.slice(1), value: key, default: key === regionKey,
          }))),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`pk-travel:location:${userId}:${regionKey ?? "none"}:${safePage}`)
          .setPlaceholder(regionKey ? "Choose a Location" : "Choose a Region first")
          .setDisabled(!regionKey || locations.length === 0)
          .addOptions(locationOptions.map((location) => ({
            label: location.name, value: location.key, description: location.biomeKeys.length > 0 ? `Biome: ${displayBiomes(location)}` : "Sắp có",
          }))),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`pk-travel:page:${userId}:${regionKey ?? "none"}:${safePage - 1}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(!regionKey || safePage === 0),
        new ButtonBuilder().setCustomId(`pk-travel:page-indicator:${userId}:${regionKey ?? "none"}:${safePage}`).setLabel(`Locations ${safePage + 1}/${pageCount}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`pk-travel:page:${userId}:${regionKey ?? "none"}:${safePage + 1}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(!regionKey || safePage >= pageCount - 1),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`pk-travel:go:${userId}`).setLabel("Go!").setEmoji("✈️").setStyle(ButtonStyle.Success).setDisabled(!selected),
      ),
    ],
    });
  };

  const travelDraftKey = (guildId: string, userId: string, channelId: string): string => `${guildId}:${userId}:${channelId}`;

  const openTravelThread = async (interaction: ButtonInteraction | ChatInputCommandInteraction): Promise<void> => {
    if (!interaction.guild || !interaction.channel?.isTextBased()) return;
    await interaction.reply({ content: `<@${interaction.user.id}> is planning a trip.`, allowedMentions: { users: [interaction.user.id] } });
    const anchor = await interaction.fetchReply();
    const thread = await anchor.startThread({ name: `Travel · ${interaction.user.username}`.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.OneHour, reason: "Pokémon travel planning" });
    scheduleManagedThreadExpiry(thread);
    const selected = selectedLocationForPlayer(database, interaction.guild.id, interaction.user.id);
    if (selected) travelDrafts.set(travelDraftKey(interaction.guild.id, interaction.user.id, thread.id), selected);
    await thread.send({ content: `<@${interaction.user.id}>`, allowedMentions: { users: [interaction.user.id] }, ...travelMessage(interaction.user.id, selected?.regionKey, selected ? locationsForRegion(database, selected.regionKey) : [], selected) });
  };

  const openInventoryThread = async (interaction: ButtonInteraction | ChatInputCommandInteraction): Promise<void> => {
    if (!interaction.guild || !interaction.channel?.isTextBased()) return;
    await interaction.reply({ content: `<@${interaction.user.id}> is opening their Pokémon Inventory.`, allowedMentions: { users: [interaction.user.id] } });
    const anchor = await interaction.fetchReply();
    const thread = await anchor.startThread({ name: `Inventory · ${interaction.user.username}`.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.OneHour, reason: "Pokémon Inventory" });
    scheduleManagedThreadExpiry(thread);
    await thread.send({
      content: `<@${interaction.user.id}>`,
      allowedMentions: { users: [interaction.user.id] },
      embeds: [new EmbedBuilder().setColor(0xfbbf24).setTitle("Pokémon Inventory").setDescription("Press **Open Inventory** to view it privately in this Thread.")],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`pk-inventory:open:${interaction.user.id}`).setLabel("Open Inventory").setEmoji("🎒").setStyle(ButtonStyle.Primary),
      )],
    });
  };

  const travelAnnouncement = (displayName: string, location: TravelLocation) => ({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setAuthor({ name: `${displayName} traveled` })
      .setTitle(`Arrived at ${location.name}`)
      .setDescription(`Region: ${displayKey(location.regionKey)}\nBiome: ${displayBiomes(location)}`),
    ],
    components: navigationComponents(),
  });

  const exploreResponse = (pokemon: ExploredPokemon, context: ExploreContext, location: TravelLocation, displayName: string, avatarUrl: string, appearance: "wild" | "roaming" | "event" = "wild") => ({
    files: [{ attachment: rarityBadgePng(pokemon.rarity.key), name: `rarity-${pokemon.rarity.key}.png` }],
    embeds: [new EmbedBuilder()
      .setColor(pokemon.rarity.color)
      .setAuthor({ name: `${displayName} is exploring`, iconURL: avatarUrl })
      .setTitle(pokemon.nameEn)
      .setDescription(`*A ${appearance === "event" ? "Starter Event" : appearance === "roaming" ? "Roaming" : "Wild"} Pokémon appeared!*\nType: ${formatTypes(pokemon.types)}\nRegion: ${displayKey(context.regionKey)}\nLocation: ${location.name}\nBiome: ${displayBiomes(location)}\n${appearance === "event" ? "Encounter Rate: **Starter Event — Unique**" : `Encounter Rate: **${pokemon.rarity.label}** · ${(pokemon.rarity.chance * 100).toFixed(1)}%`}`)
      .setImage(officialArtworkUrl(pokemon.nationalDex))
      .setThumbnail(`attachment://rarity-${pokemon.rarity.key}.png`)
      .setFooter({ text: `#${String(pokemon.nationalDex).padStart(3, "0")} · ${pokemon.slug}` })],
    components: [catchComponents("pending"), catchNavigationComponents()],
  });

  const starterEventAnnouncement = () => ({
    embeds: [new EmbedBuilder()
      .setColor(0xfbbf24)
      .setTitle("Starter Event — Lost in Kanto")
      .setDescription([
        "*A distress call cuts through Kanto's tall grass.*",
        "",
        "Three young partners have wandered far from their Trainers: **Bulbasaur**, **Charmander**, and **Squirtle**.",
        "",
        "They are frightened, alert, and ready to run — but a Trainer with quick hands and a steady memory may earn their trust.",
        "",
        "Each Starter can be caught **once only across this server**. When another Trainer claims one, that chance is gone for everyone.",
        "",
        "Encounter Rate: **Starter Event — Unique**\n\nExplore anywhere in Kanto to find them. Choose your partner. Do not hesitate.",
      ].join("\n"))
      .setFooter({ text: "Starter Event · Kanto" })],
  });

  const starterEventPokemon = (nationalDex: number) => database.prepare(`
    SELECT s.national_dex AS nationalDex, s.slug, s.name_en AS nameEn,
      s.go_capture_rate AS goCaptureRate, s.go_flee_rate AS goFleeRate,
      (SELECT group_concat(type_key, ',') FROM (SELECT type_key FROM pokemon_types WHERE national_dex = s.national_dex ORDER BY slot)) AS typesCsv
    FROM pokemon_species s WHERE s.national_dex = ?
  `).get(nationalDex) as (Omit<ExploredPokemon, "types" | "weight" | "minLevel" | "maxLevel" | "level" | "rarity"> & { typesCsv: string }) | undefined;

  const scheduleStarterEventEnd = (guildId: string, channelId: string, expiresAt: number): void => {
    const existing = starterEventEndTimers.get(guildId);
    if (existing) clearTimeout(existing);
    starterEventEndTimers.set(guildId, setTimeout(() => {
      starterEventEndTimers.delete(guildId);
      const caught = new Set((database.prepare("SELECT pokemon_national_dex AS nationalDex FROM pokemon_spawns WHERE guild_id = ? AND is_event = 1 AND state = 'caught'").all(guildId) as { nationalDex: number }[]).map((row) => row.nationalDex));
      const starters: readonly [number, string][] = [[1, "Bulbasaur"], [4, "Charmander"], [7, "Squirtle"]];
      const returned = starters.filter(([dex]) => !caught.has(dex)).map(([, name]) => `**${name}**`);
      if (returned.length === 0) return;
      void client.channels.fetch(channelId).then((target) => {
        if (!target?.isSendable()) return;
        void target.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Starter Event Ended").setDescription(`${returned.join(", ")} ${returned.length === 1 ? "has" : "have"} returned to ${returned.length === 1 ? "their Trainer" : "their Trainers"}.\n\nThank you to everyone who answered Kanto's call.`)] }).catch(() => undefined);
      }).catch(() => undefined);
    }, Math.max(0, expiresAt - Date.now())));
  };

  const starterEventPokemonForExplore = (guildId: string): ExploredPokemon | undefined => {
    const event = database.prepare("SELECT expires_at AS expiresAt FROM pokemon_event_announcements WHERE guild_id = ? AND event_key = 'starter-event'").get(guildId) as { expiresAt: number } | undefined;
    if (!event || event.expiresAt <= Date.now() || Math.random() >= STARTER_EVENT_ENCOUNTER_RATE) return undefined;
    const candidates = [1, 4, 7].filter((nationalDex) => !database.prepare("SELECT 1 FROM pokemon_spawns WHERE guild_id = ? AND is_event = 1 AND pokemon_national_dex = ? AND state IN ('active', 'caught')").get(guildId, nationalDex));
    const nationalDex = candidates[Math.floor(Math.random() * candidates.length)];
    const raw = nationalDex ? starterEventPokemon(nationalDex) : undefined;
    return raw ? { ...raw, types: raw.typesCsv.split(",").filter(Boolean), weight: 1, minLevel: 5, maxLevel: 5, level: 5, goCaptureRate: STARTER_EVENT_CATCH_RATE, rarity: { chance: STARTER_EVENT_ENCOUNTER_RATE, color: 0xfbbf24, key: "ultra_rare", label: "Event" } } : undefined;
  };

  const ensureStarterEvent = async (guild: Guild, channel: import("discord.js").TextChannel): Promise<number> => {
    const existingAnnouncement = database.prepare("SELECT message_id AS messageId, expires_at AS expiresAt FROM pokemon_event_announcements WHERE guild_id = ? AND event_key = 'starter-event'").get(guild.id) as { messageId: string; expiresAt: number | null } | undefined;
    let expiresAt: number;
    if (!existingAnnouncement) {
      const announcement = await channel.send(starterEventAnnouncement());
      expiresAt = Date.now() + STARTER_EVENT_LIFETIME_MS;
      database.prepare("INSERT INTO pokemon_event_announcements (guild_id, event_key, message_id, expires_at) VALUES (?, 'starter-event', ?, ?)").run(guild.id, announcement.id, expiresAt);
    } else {
      const existingMessage = await channel.messages.fetch(existingAnnouncement.messageId).catch(() => undefined);
      if (existingMessage) {
        await existingMessage.edit(starterEventAnnouncement());
      } else {
        const announcement = await channel.send(starterEventAnnouncement());
        database.prepare("UPDATE pokemon_event_announcements SET message_id = ? WHERE guild_id = ? AND event_key = 'starter-event'").run(announcement.id, guild.id);
      }
      expiresAt = existingAnnouncement.expiresAt ?? Date.now() + STARTER_EVENT_LIFETIME_MS;
      if (existingAnnouncement.expiresAt === null) {
        database.prepare("UPDATE pokemon_event_announcements SET expires_at = ? WHERE guild_id = ? AND event_key = 'starter-event'").run(expiresAt, guild.id);
      }
    }
    scheduleStarterEventEnd(guild.id, channel.id, expiresAt);
    const legacySpawns = database.prepare(`
      SELECT message_id AS messageId, channel_id AS channelId
      FROM pokemon_spawns
      WHERE guild_id = ? AND location_key = ? AND state = 'active'
    `).all(guild.id, STARTER_EVENT_LOCATION_KEY) as { messageId: string; channelId: string }[];
    database.prepare("UPDATE pokemon_spawns SET state = 'fled', resolved_at = ? WHERE guild_id = ? AND location_key = ? AND state = 'active'").run(Date.now(), guild.id, STARTER_EVENT_LOCATION_KEY);
    for (const legacy of legacySpawns) {
      const legacyChannel = await client.channels.fetch(legacy.channelId).catch(() => undefined);
      const legacyMessage = legacyChannel?.isTextBased() ? await legacyChannel.messages.fetch(legacy.messageId).catch(() => undefined) : undefined;
      if (legacyMessage) await disableCatch(legacyMessage, "fled");
    }
    return 0;
  };

  const warpCandyResponse = (amount: number, userId: string) => ({
    content: `<@${userId}>`,
    allowedMentions: { users: [userId] },
    files: [{ attachment: "assets/pokemon/warp-candy.png", name: "warp-candy.png" }],
    embeds: [new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle("You found a Warp Candy!")
      .setDescription(`This Explore was replaced by a **Warp Candy**.\nTeleport charges: **${amount}**\n\nUse **Teleport** on an active Pokémon encounter to travel there and join its Catch Thread.`)
      .setThumbnail("attachment://warp-candy.png")],
    components: navigationComponents(),
  });

  const caughtAnnouncement = (spawn: PokemonSpawn, displayName: string, avatarUrl: string) => ({
    embeds: [new EmbedBuilder()
      .setColor(0xfbbf24)
      .setAuthor({ name: `${displayName} caught a Pokémon!`, iconURL: avatarUrl })
      .setTitle(spawn.pokemonName)
      .setDescription(`Region: ${displayKey(spawn.regionKey)}\nLocation: ${spawn.locationName}`)
      .setImage(officialArtworkUrl(spawn.pokemonNationalDex))
      .setFooter({ text: `#${String(spawn.pokemonNationalDex).padStart(3, "0")}` })],
    components: navigationComponents(),
  });

  const INVENTORY_PAGE_SIZE = 25;
  const giftRecipientIds = (guildId: string, senderUserId: string): Set<string> => new Set((database.prepare(`
    SELECT user_id AS userId FROM player_locations WHERE guild_id = ?
    UNION
    SELECT user_id AS userId FROM pokemon_catches WHERE guild_id = ?
  `).all(guildId, guildId) as { userId: string }[])
    .map((row) => row.userId)
    .filter((userId) => userId !== senderUserId));

  const giftRecipientsForGuild = async (guild: Guild, senderUserId: string) => {
    const ids = [...giftRecipientIds(guild.id, senderUserId)];
    const members = await Promise.all(ids.map(async (userId) => guild.members.fetch(userId).catch(() => guild.members.cache.get(userId))));
    return members.filter((member): member is NonNullable<typeof member> => Boolean(member))
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .slice(0, 25);
  };

  const inventoryMenu = async (guild: Guild, userId: string, page = 0, selectedDex?: number, recipientUserId?: string) => {
    const caught = caughtPokemonForPlayer(database, guild.id, userId);
    const pageCount = Math.max(1, Math.ceil(caught.length / INVENTORY_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, pageCount - 1));
    const entries = caught.slice(safePage * INVENTORY_PAGE_SIZE, (safePage + 1) * INVENTORY_PAGE_SIZE);
    const pokemon = caught.find((entry) => entry.nationalDex === selectedDex);
    const recipients = await giftRecipientsForGuild(guild, userId);
    const recipient = recipientUserId ? recipients.find((member) => member.id === recipientUserId) : undefined;
    const giftRemainingMs = giftCooldownRemaining(database, guild.id, userId);
    const giftRemainingHours = Math.ceil(giftRemainingMs / 3_600_000);
    const description = pokemon
      ? [
        `*You have caught this Pokémon ${pokemon.catchCount} time${pokemon.catchCount === 1 ? "" : "s"}.*`,
        `Type: ${formatTypes(pokemon.typesCsv.split(",").filter(Boolean))}`,
        `Region: **${displayKey(pokemon.regionKey)}**`,
        `Location: **${pokemon.locationName}**`,
        `Encounter Rate: **${encounterRarityLabel(pokemon.encounterRarity)}**${pokemon.encounterRate === null ? "" : ` · ${(pokemon.encounterRate * 100).toFixed(1)}%`}`,
        `Catch Rate: **${catchDifficulty(pokemon.goCaptureRate)}** · ${pokemon.goCaptureRate}%`,
        `Flee Rate: **${fleeDifficulty(pokemon.goFleeRate)}**${pokemon.goFleeRate === null ? "" : ` · ${pokemon.goFleeRate}%`}`,
        recipient ? `\nGift recipient: ${recipient}` : "",
      ].join("\n")
      : `Warp Candy: **${warpCandyCount(database, guild.id, userId)}**\n\nChoose a Pokémon to view its information.`;
    return {
      embeds: [new EmbedBuilder()
        .setColor(0xfbbf24)
        .setTitle(pokemon?.nameEn ?? "Pokémon Inventory")
        .setDescription(description)
        .setImage(pokemon ? officialArtworkUrl(pokemon.nationalDex) : null)
        .setFooter(pokemon ? { text: `#${String(pokemon.nationalDex).padStart(3, "0")} · ${pokemon.slug}` } : null)],
      components: [
        ...(entries.length > 0 ? [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(`pk-inventory:pokemon:${userId}:${safePage}:${recipient?.id ?? "none"}`).setPlaceholder("Choose a Pokémon").addOptions(entries.map((entry) => ({
            label: entry.nameEn,
            value: String(entry.nationalDex),
            description: `#${String(entry.nationalDex).padStart(3, "0")} · Caught ${entry.catchCount} time${entry.catchCount === 1 ? "" : "s"}`,
          }))),
        )] : []),
        ...(recipients.length > 0 ? [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(`pk-inventory:recipient:${userId}:${pokemon?.nationalDex ?? "none"}:${safePage}`).setPlaceholder("Choose a player to receive a Gift").addOptions(recipients.map((member) => ({ label: member.displayName.slice(0, 100), value: member.id, description: member.user.username.slice(0, 100) }))),
        )] : []),
        ...(pageCount > 1 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`pk-inventory:page:${userId}:${safePage - 1}:${pokemon?.nationalDex ?? "none"}:${recipient?.id ?? "none"}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
          new ButtonBuilder().setCustomId(`pk-inventory:page-indicator:${userId}:${safePage}`).setLabel(`Page ${safePage + 1}/${pageCount}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId(`pk-inventory:page:${userId}:${safePage + 1}:${pokemon?.nationalDex ?? "none"}:${recipient?.id ?? "none"}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pageCount - 1),
        )] : []),
        ...(entries.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(pokemon ? `pk-showoff:publish:${userId}:${pokemon.nationalDex}:${safePage}` : `pk-showoff:unselected:${userId}:${safePage}`).setLabel("Show Off").setEmoji("✨").setStyle(ButtonStyle.Primary).setDisabled(!pokemon),
          new ButtonBuilder().setCustomId(pokemon && recipient ? `pk-gift:confirm:${userId}:${pokemon.nationalDex}:${recipient.id}:${safePage}` : `pk-gift:unselected:${userId}:${safePage}`).setLabel(giftRemainingMs > 0 ? `Gift · ${giftRemainingHours}h` : "Gift").setEmoji("🎁").setStyle(ButtonStyle.Success).setDisabled(!pokemon || !recipient || giftRemainingMs > 0),
        )] : []),
      ],
    };
  };

  const showOffAnnouncement = (pokemon: ReturnType<typeof caughtPokemonForPlayer>[number], displayName: string, avatarUrl: string) => ({
    embeds: [new EmbedBuilder()
      .setColor(0xfbbf24)
      .setAuthor({ name: `${displayName} is showing off a Pokémon`, iconURL: avatarUrl })
      .setTitle(pokemon.nameEn)
      .setDescription([
        `*${displayName} has caught this Pokémon ${pokemon.catchCount} time${pokemon.catchCount === 1 ? "" : "s"}.*`,
        `Type: ${formatTypes(pokemon.typesCsv.split(",").filter(Boolean))}`,
        `Region: **${displayKey(pokemon.regionKey)}**`,
        `Location: **${pokemon.locationName}**`,
        `Encounter Rate: **${encounterRarityLabel(pokemon.encounterRarity)}**${pokemon.encounterRate === null ? "" : ` · ${(pokemon.encounterRate * 100).toFixed(1)}%`}`,
        `Catch Rate: **${catchDifficulty(pokemon.goCaptureRate)}** · ${pokemon.goCaptureRate}%`,
        `Flee Rate: **${fleeDifficulty(pokemon.goFleeRate)}**${pokemon.goFleeRate === null ? "" : ` · ${pokemon.goFleeRate}%`}`,
      ].join("\n"))
      .setImage(officialArtworkUrl(pokemon.nationalDex))
      .setFooter({ text: `#${String(pokemon.nationalDex).padStart(3, "0")} · ${pokemon.slug}` })],
  });

  const giftAnnouncement = (pokemon: ReturnType<typeof caughtPokemonForPlayer>[number], senderUserId: string, senderDisplayName: string, senderAvatarUrl: string, recipientUserId: string, recipientDisplayName: string) => ({
    content: `<@${senderUserId}> gifted **${pokemon.nameEn}** to <@${recipientUserId}>!`,
    allowedMentions: { users: [senderUserId, recipientUserId] },
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setAuthor({ name: `${senderDisplayName} gifted a Pokémon to ${recipientDisplayName}`, iconURL: senderAvatarUrl })
      .setTitle(pokemon.nameEn)
      .setDescription([
        `*${pokemon.nameEn} has found a new Trainer.*`,
        `Type: ${formatTypes(pokemon.typesCsv.split(",").filter(Boolean))}`,
        `Region: **${displayKey(pokemon.regionKey)}**`,
        `Location: **${pokemon.locationName}**`,
        `Encounter Rate: **${encounterRarityLabel(pokemon.encounterRarity)}**${pokemon.encounterRate === null ? "" : ` · ${(pokemon.encounterRate * 100).toFixed(1)}%`}`,
        `Catch Rate: **${catchDifficulty(pokemon.goCaptureRate)}** · ${pokemon.goCaptureRate}%`,
        `Flee Rate: **${fleeDifficulty(pokemon.goFleeRate)}**${pokemon.goFleeRate === null ? "" : ` · ${pokemon.goFleeRate}%`}`,
      ].join("\n"))
      .setImage(officialArtworkUrl(pokemon.nationalDex))
      .setFooter({ text: `#${String(pokemon.nationalDex).padStart(3, "0")} · ${pokemon.slug}` })],
  });

  const findExploredPokemon = (guild: Guild, userId: string): { context: ExploreContext; location: TravelLocation; pokemon: ExploredPokemon; appearance: "wild" | "roaming" | "event" } | undefined => {
    const location = selectedLocationForPlayer(database, guild.id, userId);
    if (!location) return undefined;
    const context: ExploreContext = { regionKey: location.regionKey, biomeKey: location.biomeKeys[0] ?? "location" };
    const eventPokemon = location.regionKey === "kanto" ? starterEventPokemonForExplore(guild.id) : undefined;
    const roamingPokemon = eventPokemon ? undefined : roamingPokemonForRegion(database, location.regionKey, roamingChance(database, guild.id));
    const pokemon = eventPokemon
      ?? roamingPokemon
      ?? explorePokemonAtLocation(database, location.key)
      ?? (location.biomeKeys[0] ? explorePokemon(database, context) : undefined);
    return pokemon ? { context, location, pokemon, appearance: eventPokemon ? "event" : roamingPokemon ? "roaming" : "wild" } : undefined;
  };

  const catchThreadForSpawn = async (spawn: PokemonSpawn, sourceMessage: Message): Promise<ThreadChannel> => {
    const cached = catchThreads.get(spawn.messageId);
    if (cached && !cached.archived) return cached;
    const existing = await client.channels.fetch(spawn.messageId).catch(() => undefined);
    if (existing?.isThread()) {
      catchThreads.set(spawn.messageId, existing);
      return existing;
    }
    const thread = await sourceMessage.startThread({
      name: `Catch ${spawn.pokemonName}`.slice(0, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
      reason: `Catch lobby for ${spawn.pokemonName}`,
    });
    catchThreads.set(spawn.messageId, thread);
    scheduleManagedThreadExpiry(thread);
    return thread;
  };

  const inviteToCatchThread = async (interaction: ButtonInteraction | ChatInputCommandInteraction, spawn: PokemonSpawn, sourceMessage: Message): Promise<void> => {
    const reply = async (content: string): Promise<void> => {
      if (interaction.deferred) await interaction.editReply({ content });
      else await interaction.reply({ content, ephemeral: true });
    };
    const playerLocation = selectedLocationForPlayer(database, interaction.guildId!, interaction.user.id);
    if (playerLocation?.key !== spawn.locationKey) {
      await reply(`You must be at **${spawn.locationName}** to catch ${spawn.pokemonName}.`);
      return;
    }
    const key = sessionKey(spawn.messageId, interaction.user.id);
    if (catchInvitations.has(key)) {
      await reply("You already have a Catch invitation for this Pokémon in its Thread.");
      return;
    }
    const thread = await catchThreadForSpawn(spawn, sourceMessage);
    const currentSpawn = pokemonSpawn(database, spawn.messageId);
    if (!currentSpawn || currentSpawn.state !== "active" || currentSpawn.expiresAt <= Date.now()) {
      if (currentSpawn?.state === "active") await expireSpawn(sourceMessage);
      await reply("This Pokémon has already left.");
      return;
    }
    const invitation = await thread.send({
      content: `<@${interaction.user.id}>`,
      allowedMentions: { users: [interaction.user.id] },
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Catch ${spawn.pokemonName}`).setDescription(`${interaction.user} is ready. Press **Play** when ready to memorize the sequence.`)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(catchPlayId(spawn.messageId, interaction.user.id)).setLabel("Play").setEmoji("▶️").setStyle(ButtonStyle.Success),
      )],
    });
    catchInvitations.set(key, invitation);
    await reply(`Your Catch invitation is ready in <#${thread.id}>.`);
    scheduleSpawnExpiry(sourceMessage, spawn.expiresAt);
  };

  const beginCatchGame = async (interaction: ButtonInteraction, spawn: PokemonSpawn): Promise<void> => {
    const playerLocation = selectedLocationForPlayer(database, interaction.guildId!, interaction.user.id);
    if (playerLocation?.key !== spawn.locationKey) {
      await interaction.reply({ content: `You must be at **${spawn.locationName}** to catch ${spawn.pokemonName}.`, ephemeral: true });
      return;
    }
    const key = sessionKey(spawn.messageId, interaction.user.id);
    if (catchSessions.has(key)) {
      await interaction.reply({ content: "You are already catching this Pokémon.", ephemeral: true });
      return;
    }
    const symbols = catchSymbolsForSpawn(spawn);
    const session = createCatchSession(spawn.goCaptureRate, Math.random, spawn.catchSequenceLength ?? undefined, symbols.length);
    catchSessions.set(key, session);
    session.close = async (content: string): Promise<void> => {
      await interaction.message.edit({ content, embeds: [], components: [] }).catch(() => undefined);
    };
    await interaction.update({
      content: `<@${interaction.user.id}>`,
      allowedMentions: { users: [interaction.user.id] },
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Catch ${spawn.pokemonName}`).setDescription(`Memorize this sequence:\n\n${session.sequence.map((index) => symbols[index]).join(" ")}`)],
      components: [],
    });
    setTimeout(() => {
      if (!catchSessions.has(key)) return;
      const current = pokemonSpawn(database, spawn.messageId);
      if (!current || current.state !== "active" || current.expiresAt <= Date.now()) {
        catchSessions.delete(key);
        void interaction.message.edit({
          content: `${spawn.pokemonName} fled!`,
          embeds: [],
          components: [],
        }).catch(() => undefined);
        return;
      }
      void interaction.message.edit({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Catch ${spawn.pokemonName}`).setDescription(`Repeat the sequence · 0/${session.sequence.length}`)],
        components: catchInputComponents(spawn.messageId, interaction.user.id, symbols),
      }).catch(() => catchSessions.delete(key));
    }, previewDurationMs(session.sequence.length) + (spawn.isEvent ? STARTER_EVENT_PREVIEW_EXTRA_MS : 0));
  };

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
    if (interaction.isStringSelectMenu()) {
      const [prefix, action, ownerUserId, regionKey, pageText] = interaction.customId.split(":");
      if (prefix === "pk-inventory" && action && ownerUserId && interaction.guild) {
        if (ownerUserId !== interaction.user.id) {
          await interaction.reply({ content: "This Inventory belongs to another player.", ephemeral: true });
          return;
        }
        if (action === "pokemon") {
          const pokemon = caughtPokemonForPlayer(database, interaction.guild.id, interaction.user.id)
            .find((entry) => entry.nationalDex === Number(interaction.values[0]));
          if (!pokemon) {
            await interaction.update({ content: "This Pokémon is no longer in your Inventory.", embeds: [], components: [] });
            return;
          }
          const selectedRecipient = pageText && pageText !== "none" ? pageText : undefined;
          await interaction.update(await inventoryMenu(interaction.guild, interaction.user.id, Number(regionKey) || 0, pokemon.nationalDex, selectedRecipient));
          return;
        }
        if (action === "recipient") {
          const recipient = await interaction.guild.members.fetch(interaction.values[0]).catch(() => undefined);
          if (!recipient || !giftRecipientIds(interaction.guild.id, interaction.user.id).has(recipient.id)) {
            await interaction.update({ content: "That player is no longer eligible to receive a Gift.", embeds: [], components: [] });
            return;
          }
          const selectedDex = regionKey && regionKey !== "none" ? Number(regionKey) : undefined;
          await interaction.update(await inventoryMenu(interaction.guild, interaction.user.id, Number(pageText) || 0, selectedDex, recipient.id));
          return;
        }
      }
      if (prefix !== "pk-travel" || !action || !ownerUserId || !interaction.guild) return;
      if (ownerUserId !== interaction.user.id) {
        await interaction.reply({ content: "Menu Travel này thuộc về người chơi khác.", ephemeral: true });
        return;
      }
      if (action === "region") {
        const selectedRegion = interaction.values[0] as RegionKey;
        const locations = locationsForRegion(database, selectedRegion);
        const draft = travelDrafts.get(travelDraftKey(interaction.guild.id, interaction.user.id, interaction.channelId));
        await interaction.update(travelMessage(interaction.user.id, selectedRegion, locations, draft?.regionKey === selectedRegion ? draft : undefined));
        return;
      }
      if (action === "location" && regionKey && regionKey !== "none") {
        const location = locationsForRegion(database, regionKey as RegionKey).find((entry) => entry.key === interaction.values[0]);
        if (!location) {
          await interaction.reply({ content: "That Location no longer exists.", ephemeral: true });
          return;
        }
        travelDrafts.set(travelDraftKey(interaction.guild.id, interaction.user.id, interaction.channelId), location);
        await interaction.update(travelMessage(interaction.user.id, location.regionKey, locationsForRegion(database, location.regionKey), location, Number(pageText) || 0));
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === OWNERSHIP_BUTTON_ID && interaction.guild) {
        const spawn = pokemonSpawn(database, interaction.message.id);
        if (!spawn) {
          await interaction.reply({ content: "This Pokémon encounter is no longer available.", ephemeral: true });
          return;
        }
        const owned = database.prepare("SELECT COUNT(*) AS count FROM pokemon_catches WHERE guild_id = ? AND user_id = ? AND pokemon_national_dex = ?").get(interaction.guild.id, interaction.user.id, spawn.pokemonNationalDex) as { count: number };
        await interaction.reply({ content: owned.count > 0 ? `You own **${spawn.pokemonName}** · ${owned.count} caught.` : `You do not own **${spawn.pokemonName}** yet.`, ephemeral: true });
        return;
      }

      if (interaction.customId === CATCH_BUTTON_ID && interaction.guild) {
        const spawn = pokemonSpawn(database, interaction.message.id);
        if (!spawn || spawn.state !== "active" || spawn.expiresAt <= Date.now()) {
          if (spawn?.state === "active") await expireSpawn(interaction.message);
          await interaction.reply({ content: "This Pokémon has already left.", ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        await inviteToCatchThread(interaction, spawn, interaction.message);
        return;
      }

      const catchPlay = parseCatchPlayId(interaction.customId);
      if (catchPlay && interaction.guild) {
        if (catchPlay.userId !== interaction.user.id) {
          await interaction.reply({ content: "Nút Play này thuộc về người chơi khác.", ephemeral: true });
          return;
        }
        const spawn = pokemonSpawn(database, catchPlay.messageId);
        if (!spawn || spawn.state !== "active" || spawn.expiresAt <= Date.now()) {
          if (spawn?.state === "active") {
            const fled = resolvePokemonFled(database, spawn.messageId);
            if (fled) {
              await closeCatchSessions(fled.messageId, `${fled.pokemonName} fled!`);
              await disableSpawnCatch(fled, "fled");
              closeCatchThreadAfterResolution(fled.messageId);
            }
          }
          await interaction.update({ content: "This Pokémon has already left.", embeds: [], components: [] });
          return;
        }
        await beginCatchGame(interaction, spawn);
        return;
      }

      const catchInput = parseCatchInputId(interaction.customId);
      if (catchInput && interaction.guild) {
        if (catchInput.userId !== interaction.user.id) {
          await interaction.reply({ content: "Chuỗi Catch này thuộc về người chơi khác.", ephemeral: true });
          return;
        }
        const key = sessionKey(catchInput.messageId, interaction.user.id);
        const session = catchSessions.get(key);
        const spawn = pokemonSpawn(database, catchInput.messageId);
        if (!session || !spawn || spawn.state !== "active" || spawn.expiresAt <= Date.now()) {
          catchSessions.delete(key);
          if (spawn?.state === "active") {
            const fled = resolvePokemonFled(database, spawn.messageId);
            if (fled) {
              await closeCatchSessions(spawn.messageId, `${fled.pokemonName} fled!`);
              await disableSpawnCatch(fled, "fled");
              closeCatchThreadAfterResolution(fled.messageId);
            }
          }
          await interaction.update({ content: "This Pokémon has already left.", embeds: [], components: [] });
          return;
        }
        const playerLocation = selectedLocationForPlayer(database, interaction.guild.id, interaction.user.id);
        if (playerLocation?.key !== spawn.locationKey) {
          catchSessions.delete(key);
          await interaction.update({ content: `You left **${spawn.locationName}**, so you can no longer catch this Pokémon.`, embeds: [], components: [] });
          return;
        }
        const expected = session.sequence[session.progress];
        if (catchInput.symbolIndex !== expected) {
          session.progress = 0;
          const fled = spawn.goFleeRate !== null && Math.random() < spawn.goFleeRate / 100
            ? resolvePokemonFled(database, spawn.messageId)
            : undefined;
          if (fled) {
            await closeCatchSessions(spawn.messageId, `${spawn.pokemonName} fled!`, interaction.user.id);
            await disableSpawnCatch(fled, "fled");
            closeCatchThreadAfterResolution(fled.messageId);
            await interaction.update({ content: `${spawn.pokemonName} fled!`, embeds: [], components: [] });
            return;
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`Catch ${spawn.pokemonName}`).setDescription(`Incorrect — start again from the beginning.\n0/${session.sequence.length}`)],
            components: catchInputComponents(spawn.messageId, interaction.user.id, catchSymbolsForSpawn(spawn)),
          });
          return;
        }
        session.progress += 1;
        if (session.progress < session.sequence.length) {
          await interaction.update({
            embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Catch ${spawn.pokemonName}`).setDescription(`Correct! ${session.progress}/${session.sequence.length}`)],
            components: catchInputComponents(spawn.messageId, interaction.user.id, catchSymbolsForSpawn(spawn)),
          });
          return;
        }
        const caught = resolvePokemonCaught(database, spawn.messageId, interaction.user.id);
        catchSessions.delete(key);
        if (!caught) {
          await interaction.update({ content: "This Pokémon was caught by another player or has fled.", embeds: [], components: [] });
          return;
        }
        await closeCatchSessions(spawn.messageId, `${caught.pokemonName} was caught by another player!`, interaction.user.id);
        const timer = spawnTimers.get(spawn.messageId);
        if (timer) clearTimeout(timer);
        spawnTimers.delete(spawn.messageId);
        await disableSpawnCatch(caught, "caught");
        closeCatchThreadAfterResolution(caught.messageId);
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const spawnChannel = await client.channels.fetch(caught.channelId).catch(() => undefined);
        if (spawnChannel?.isSendable()) await spawnChannel.send(caughtAnnouncement(caught, member.displayName, interaction.user.displayAvatarURL({ size: 128 })));
        await interaction.update({ content: `You caught **${caught.pokemonName}**!`, embeds: [], components: [] });
        return;
      }

      const [inventoryOpenPrefix, inventoryOpenAction, inventoryOpenOwnerUserId] = interaction.customId.split(":");
      if (inventoryOpenPrefix === "pk-inventory" && inventoryOpenAction === "open" && inventoryOpenOwnerUserId && interaction.guild) {
        if (inventoryOpenOwnerUserId !== interaction.user.id) {
          await interaction.reply({ content: "This Inventory belongs to another player.", ephemeral: true });
          return;
        }
        await interaction.reply({ ephemeral: true, ...await inventoryMenu(interaction.guild, interaction.user.id) });
        return;
      }

      const [giftPrefix, giftAction, giftOwnerUserId, giftDexText, giftTargetOrPage] = interaction.customId.split(":");
      if (giftPrefix === "pk-gift" && giftAction && giftOwnerUserId && interaction.guild) {
        if (giftOwnerUserId !== interaction.user.id) {
          await interaction.reply({ content: "This Gift menu belongs to another player.", ephemeral: true });
          return;
        }
        const pokemon = caughtPokemonForPlayer(database, interaction.guild.id, interaction.user.id)
          .find((entry) => entry.nationalDex === Number(giftDexText));
        if (!pokemon) {
          await interaction.update({ content: "This Pokémon is no longer in your Inventory.", embeds: [], components: [] });
          return;
        }
        if (giftAction === "confirm" && giftTargetOrPage) {
          const recipient = await interaction.guild.members.fetch(giftTargetOrPage).catch(() => undefined);
          if (!recipient || !giftRecipientIds(interaction.guild.id, interaction.user.id).has(recipient.id)) {
            await interaction.update({ content: "That recipient is no longer eligible.", embeds: [], components: [] });
            return;
          }
          const giftResult = giftCaughtPokemon(database, interaction.guild.id, interaction.user.id, recipient.id, pokemon.nationalDex);
          if (giftResult === "cooldown") {
            const remainingMinutes = Math.ceil(giftCooldownRemaining(database, interaction.guild.id, interaction.user.id) / 60_000);
            await interaction.update({ content: `You can gift again in **${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}**.`, embeds: [], components: [] });
            return;
          }
          if (giftResult !== "gifted") {
            await interaction.update({ content: "That Pokémon is no longer available to gift.", embeds: [], components: [] });
            return;
          }
          const sender = await interaction.guild.members.fetch(interaction.user.id);
          const giftingChannel = interaction.guild.channels.cache.find((channel) => channel.name === "gifting" && channel.isSendable());
          if (giftingChannel?.isSendable()) {
            await giftingChannel.send(giftAnnouncement(pokemon, interaction.user.id, sender.displayName, interaction.user.displayAvatarURL({ size: 128 }), recipient.id, recipient.displayName));
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("Gift sent!").setDescription(`You gave **${pokemon.nameEn}** to ${recipient}.`)],
            components: [],
          });
          return;
        }
      }

      const [inventoryPrefix, inventoryAction, inventoryOwnerUserId, inventoryPageText, inventoryDexText, inventoryRecipientUserId] = interaction.customId.split(":");
      if (inventoryPrefix === "pk-inventory" && inventoryAction === "page" && inventoryOwnerUserId && interaction.guild) {
        if (inventoryOwnerUserId !== interaction.user.id) {
          await interaction.reply({ content: "This Inventory belongs to another player.", ephemeral: true });
          return;
        }
        const selectedDex = inventoryDexText && inventoryDexText !== "none" ? Number(inventoryDexText) : undefined;
        const selectedRecipient = inventoryRecipientUserId && inventoryRecipientUserId !== "none" ? inventoryRecipientUserId : undefined;
        await interaction.update(await inventoryMenu(interaction.guild, interaction.user.id, Number(inventoryPageText) || 0, selectedDex, selectedRecipient));
        return;
      }

      const [showOffPrefix, showOffAction, showOffOwnerUserId, showOffValue] = interaction.customId.split(":");
      if (showOffPrefix === "pk-showoff" && showOffAction && showOffOwnerUserId && interaction.guild) {
        if (showOffOwnerUserId !== interaction.user.id) {
          await interaction.reply({ content: "This Inventory belongs to another player.", ephemeral: true });
          return;
        }
        if (showOffAction === "page" || showOffAction === "inventory") {
          await interaction.update(await inventoryMenu(interaction.guild, interaction.user.id, Number(showOffValue) || 0));
          return;
        }
        if (showOffAction === "publish" && showOffValue) {
          const pokemon = caughtPokemonForPlayer(database, interaction.guild.id, interaction.user.id)
            .find((entry) => entry.nationalDex === Number(showOffValue));
          if (!pokemon) {
            await interaction.update({ content: "This Pokémon is no longer in your Inventory.", embeds: [], components: [] });
            return;
          }
          const member = await interaction.guild.members.fetch(interaction.user.id);
          const showOffChannel = interaction.guild.channels.cache.find((channel) => channel.name === "show-off" && channel.isSendable());
          if (!showOffChannel?.isSendable()) {
            await interaction.reply({ content: "The #show-off channel has not been created yet. Ask an admin to run /pk-create.", ephemeral: true });
            return;
          }
          await showOffChannel.send(showOffAnnouncement(pokemon, member.displayName, interaction.user.displayAvatarURL({ size: 128 })));
          await interaction.update({ content: `You showed off **${pokemon.nameEn}** in <#${showOffChannel.id}>!`, embeds: [], components: [] });
          return;
        }
      }

      if (interaction.customId === TELEPORT_BUTTON_ID && interaction.guild) {
        const spawn = pokemonSpawn(database, interaction.message.id);
        if (!spawn || spawn.state !== "active" || spawn.expiresAt <= Date.now()) {
          if (spawn?.state === "active") await expireSpawn(interaction.message);
          await interaction.reply({ content: "This Pokémon has already left.", ephemeral: true });
          return;
        }
        const currentLocation = selectedLocationForPlayer(database, interaction.guild.id, interaction.user.id);
        if (currentLocation?.key === spawn.locationKey) {
          await interaction.reply({ content: "You are already at this Location.", ephemeral: true });
          return;
        }
        if (warpCandyCount(database, interaction.guild.id, interaction.user.id) <= 0) {
          await interaction.reply({ content: "You have no Warp Candy. Keep exploring to find one.", ephemeral: true });
          return;
        }
        const destination = locationsForRegion(database, spawn.regionKey as RegionKey).find((location) => location.key === spawn.locationKey);
        const spawnChannel = await client.channels.fetch(spawn.channelId).catch(() => undefined);
        const sourceMessage = spawnChannel?.isTextBased() ? await spawnChannel.messages.fetch(spawn.messageId).catch(() => undefined) : undefined;
        if (!destination || !sourceMessage) {
          await interaction.reply({ content: "This Pokémon's Location could not be determined.", ephemeral: true });
          return;
        }
        if (!consumeWarpCandy(database, interaction.guild.id, interaction.user.id)) {
          await interaction.reply({ content: "That Warp Candy is no longer available.", ephemeral: true });
          return;
        }
        setPlayerLocation(database, interaction.guild.id, interaction.user.id, destination.key);
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (spawnChannel?.isSendable()) await spawnChannel.send(travelAnnouncement(member.displayName, destination));
        try {
          await inviteToCatchThread(interaction, spawn, sourceMessage);
        } catch (error) {
          addWarpCandy(database, interaction.guild.id, interaction.user.id);
          throw error;
        }
        return;
      }

      if (interaction.customId === SHOW_OFF_BUTTON_ID && interaction.guild) {
        await openInventoryThread(interaction);
        return;
      }

      if (interaction.customId === TRAVEL_BUTTON_ID && interaction.guild) {
        await openTravelThread(interaction);
        return;
      }
      const [prefix, action, ownerUserId, regionKey, pageText] = interaction.customId.split(":");
      if (prefix === "pk-travel" && action === "go" && ownerUserId && interaction.guild) {
        if (ownerUserId !== interaction.user.id) {
          await interaction.reply({ content: "This Travel menu belongs to another player.", ephemeral: true });
          return;
        }
        const key = travelDraftKey(interaction.guild.id, interaction.user.id, interaction.channelId);
        const destination = travelDrafts.get(key);
        if (!destination) {
          await interaction.reply({ content: "Choose a Location first.", ephemeral: true });
          return;
        }
        setPlayerLocation(database, interaction.guild.id, interaction.user.id, destination.key);
        travelDrafts.delete(key);
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const parent = interaction.channel?.isThread() ? interaction.channel.parent : interaction.channel;
        if (parent?.isSendable()) await parent.send(travelAnnouncement(member.displayName, destination));
        await interaction.update({ content: "Travel confirmed.", embeds: [], components: [] });
        if (interaction.channel?.isThread()) {
          const existing = travelThreadDeletionTimers.get(interaction.channel.id);
          if (existing) clearTimeout(existing);
          travelThreadDeletionTimers.set(interaction.channel.id, setTimeout(() => {
            travelThreadDeletionTimers.delete(interaction.channelId);
            void interaction.channel?.delete("Travel confirmed two minutes ago").catch(() => undefined);
          }, 120_000));
        }
        return;
      }
      if (prefix === "pk-travel" && action === "page" && ownerUserId && regionKey && interaction.guild) {
        if (ownerUserId !== interaction.user.id) {
          await interaction.reply({ content: "Menu Travel này thuộc về người chơi khác.", ephemeral: true });
          return;
        }
        const selectedRegion = regionKey as RegionKey;
        const selected = selectedLocationForPlayer(database, interaction.guild.id, interaction.user.id);
        await interaction.update(travelMessage(interaction.user.id, selectedRegion, locationsForRegion(database, selectedRegion), selected?.regionKey === selectedRegion ? selected : undefined, Number(pageText) || 0));
        return;
      }
      if (interaction.customId !== LOCATION_EXPLORE_BUTTON_ID || !interaction.guild) return;
      if (!(await mayExplore(interaction.guild, interaction.user.id))) {
        await interaction.reply({ content: "You do not have permission to explore Pokémon.", ephemeral: true });
        return;
      }
      const result = findExploredPokemon(interaction.guild, interaction.user.id);
      if (!result) {
        await interaction.reply({ content: "Choose a Location with `/pk-travel` first.", ephemeral: true });
        return;
      }
      const cooldownMs = canExploreNow(interaction.guild.id, interaction.user.id);
      if (cooldownMs > 0) {
        await interaction.reply({ content: `Wait ${(cooldownMs / 1000).toFixed(1)} seconds before exploring again.`, ephemeral: true });
        return;
      }
      if (findsWarpCandy(Math.random, warpCandyChance(database, interaction.guild.id))) {
        const amount = addWarpCandy(database, interaction.guild.id, interaction.user.id);
        await interaction.reply(warpCandyResponse(amount, interaction.user.id));
        markExplored(interaction.guild.id, interaction.user.id);
        return;
      }
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await interaction.reply(exploreResponse(
        result.pokemon,
        result.context,
        result.location,
        member.displayName,
        interaction.user.displayAvatarURL({ size: 128 }),
        result.appearance,
      ));
      const message = await interaction.fetchReply();
      const appearedAt = Date.now();
      const lifetimeMs = result.appearance === "event" ? STARTER_EVENT_SPAWN_LIFETIME_MS : SPAWN_LIFETIME_MS;
      addPokemonSpawn(database, {
        messageId: message.id, guildId: interaction.guild.id, channelId: message.channelId,
        pokemonNationalDex: result.pokemon.nationalDex, pokemonName: result.pokemon.nameEn,
        regionKey: result.context.regionKey, locationKey: result.location.key, locationName: result.location.name,
        encounterRate: result.pokemon.rarity.chance, encounterRarity: result.pokemon.rarity.key,
        goCaptureRate: result.pokemon.goCaptureRate, goFleeRate: result.pokemon.goFleeRate,
        isEvent: result.appearance === "event", catchSequenceLength: result.appearance === "event" ? STARTER_EVENT_SEQUENCE_LENGTH : null,
        appearedAt, expiresAt: appearedAt + lifetimeMs,
      });
      scheduleSpawnExpiry(message, appearedAt + lifetimeMs);
      markExplored(interaction.guild.id, interaction.user.id);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "chance") {
      const question = interaction.options.getString("question", true);
      const chance = rollChance();
      await interaction.reply(`> ${question}\n**${chance.percent}%** — ${chance.response}`);
      return;
    }

    if (interaction.commandName === "pk-candy-warp-up") {
      if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Only server administrators can change the Warp Candy rate.", ephemeral: true });
        return;
      }
      const percent = interaction.options.getNumber("percent", true);
      setWarpCandyChance(database, interaction.guild.id, percent / 100);
      await interaction.reply({ content: `Warp Candy discovery rate is now **${percent}%** per Explore.`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "pk-roaming-up") {
      if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Only server administrators can change the Roaming Pokémon rate.", ephemeral: true });
        return;
      }
      const percent = interaction.options.getNumber("percent", true);
      setRoamingChance(database, interaction.guild.id, percent / 100);
      await interaction.reply({ content: `Roaming Pokémon encounter rate is now **${percent}%** per Explore.`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "pk-travel") {
      if (!interaction.guild) {
        await interaction.reply({ content: "Travel can only be used in a server.", ephemeral: true });
        return;
      }
      await openTravelThread(interaction);
      return;
    }

    if (interaction.commandName === "pk-catch") {
      if (!interaction.guild || !interaction.channel?.isTextBased()) {
        await interaction.reply({ content: "Catch can only be used in a Pokémon channel in a server.", ephemeral: true });
        return;
      }
      const spawn = activeSpawnInChannel(database, interaction.guild.id, interaction.channelId);
      if (!spawn) {
        await interaction.reply({ content: "There is no Pokémon appearing here.", ephemeral: true });
        return;
      }
      const sourceMessage = await interaction.channel.messages.fetch(spawn.messageId).catch(() => undefined);
      if (!sourceMessage) {
        await interaction.reply({ content: "The Pokémon embed could not be found.", ephemeral: true });
        return;
      }
      await inviteToCatchThread(interaction, spawn, sourceMessage);
      return;
    }

    if (interaction.commandName === "pk-showoff" || interaction.commandName === "pk-gift") {
      if (!interaction.guild) {
        await interaction.reply({ content: "Inventory can only be used in a server.", ephemeral: true });
        return;
      }
      await openInventoryThread(interaction);
      return;
    }

    if (interaction.commandName === "pk-explore") {
      if (!interaction.guild) {
        await interaction.reply({ content: "There are no Pokémon here.", ephemeral: true });
        return;
      }
      if (!(await mayExplore(interaction.guild, interaction.user.id))) {
        await interaction.reply({ content: "You do not have permission to explore Pokémon.", ephemeral: true });
        return;
      }
      const result = findExploredPokemon(interaction.guild, interaction.user.id);
      if (!result) {
        await interaction.reply({ content: "Choose a Location with `/pk-travel` first.", ephemeral: true });
        return;
      }
      const cooldownMs = canExploreNow(interaction.guild.id, interaction.user.id);
      if (cooldownMs > 0) {
        await interaction.reply({ content: `Wait ${(cooldownMs / 1000).toFixed(1)} seconds before exploring again.`, ephemeral: true });
        return;
      }
      if (findsWarpCandy(Math.random, warpCandyChance(database, interaction.guild.id))) {
        const amount = addWarpCandy(database, interaction.guild.id, interaction.user.id);
        await interaction.reply(warpCandyResponse(amount, interaction.user.id));
        markExplored(interaction.guild.id, interaction.user.id);
        return;
      }
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await interaction.reply(exploreResponse(
        result.pokemon,
        result.context,
        result.location,
        member.displayName,
        interaction.user.displayAvatarURL({ size: 128 }),
        result.appearance,
      ));
      const message = await interaction.fetchReply();
      const appearedAt = Date.now();
      const lifetimeMs = result.appearance === "event" ? STARTER_EVENT_SPAWN_LIFETIME_MS : SPAWN_LIFETIME_MS;
      addPokemonSpawn(database, {
        messageId: message.id, guildId: interaction.guild.id, channelId: message.channelId,
        pokemonNationalDex: result.pokemon.nationalDex, pokemonName: result.pokemon.nameEn,
        regionKey: result.context.regionKey, locationKey: result.location.key, locationName: result.location.name,
        encounterRate: result.pokemon.rarity.chance, encounterRarity: result.pokemon.rarity.key,
        goCaptureRate: result.pokemon.goCaptureRate, goFleeRate: result.pokemon.goFleeRate,
        isEvent: result.appearance === "event", catchSequenceLength: result.appearance === "event" ? STARTER_EVENT_SEQUENCE_LENGTH : null,
        appearedAt, expiresAt: appearedAt + lifetimeMs,
      });
      scheduleSpawnExpiry(message, appearedAt + lifetimeMs);
      markExplored(interaction.guild.id, interaction.user.id);
      return;
    }

    if (interaction.commandName === "pk-create") {
      if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Lệnh này chỉ dành cho Administrator.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await provisionExploreChannel(interaction.guild, interaction.client.user.id, POKEMON_EXPLORE_ROLE_ID);
        const startersCreated = await ensureStarterEvent(interaction.guild, result.eventChannel);
        await interaction.editReply(`${result.createdCategory ? "Đã tạo" : "Đã dùng"} category Pokémon Ex; ${result.created ? "đã tạo" : "đã chuyển"} private channel #explore, ${result.eventCreated ? "đã tạo" : "đã dùng"} #event, ${result.giftingCreated ? "đã tạo" : "đã dùng"} #gifting và ${result.showOffCreated ? "đã tạo" : "đã dùng"} #show-off. Starter Event: ${startersCreated} Starter mới.`);
        logger.info("Provisioned Pokémon explore channel", { guildId: interaction.guild.id, userId: interaction.user.id, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Could not provision Pokémon explore channel", { guildId: interaction.guild.id, userId: interaction.user.id, message });
        await interaction.editReply("Không thể tạo #explore. Hãy kiểm tra role chơi Pokémon tồn tại và bot có quyền Manage Channels.");
      }
      return;
    }

    if (interaction.commandName === "pk-remove") {
      if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Lệnh này chỉ dành cho Administrator.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await removeKantoWorld(interaction.guild);
        await interaction.editReply(result.removedCategory
          ? `Đã xóa Kanto: ${result.removedAreas} biome channels và category.`
          : "Không tìm thấy category Kanto.");
        logger.info("Removed Kanto Pokémon world", { guildId: interaction.guild.id, userId: interaction.user.id, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Could not remove Kanto Pokémon world", { guildId: interaction.guild.id, userId: interaction.user.id, message });
        await interaction.editReply("Không thể xóa Kanto. Bot cần quyền Manage Channels.");
      }
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
