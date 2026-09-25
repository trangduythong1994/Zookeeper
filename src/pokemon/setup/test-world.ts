import { ChannelType, PermissionFlagsBits, type Guild, type TextChannel } from "discord.js";
import { channelNameForBiome, REGION_BIOMES, type RegionKey } from "../data/regions.js";

export type TestBiome = { channelName: string; displayName: string; key: string };

export const TEST_WORLD = {
  categoryName: "pk-test-kanto",
  regionName: "Kanto (Test)",
  biomes: [
    { channelName: "viridian-forest", displayName: "Viridian Forest", key: "forest" },
    { channelName: "route-1", displayName: "Route 1", key: "grassland" },
    { channelName: "mt-moon", displayName: "Mt. Moon", key: "cave" },
    { channelName: "route-22-river", displayName: "Route 22 River", key: "river" },
  ] satisfies TestBiome[],
};

export type TestWorldSetupResult = { createdAreas: number; createdCategory: boolean; existingAreas: number; pinnedMessages: number };
export type TestWorldRemovalResult = { removedAreas: number; removedCategory: boolean };

export function biomeStatusMessage(regionName: string, biome: TestBiome): string {
  return `## ${biome.displayName}\n**Region:** ${regionName}\n**Biome:** ${biome.key}\n\nĐây là biome test được tạo bởi \`/pk-stup\`.\n\n\`PK_SETUP_BIOME:${biome.key}\``;
}

export async function provisionPrivateTestWorld(guild: Guild, botUserId: string): Promise<TestWorldSetupResult> {
  await guild.members.fetch(botUserId);
  let category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === TEST_WORLD.categoryName);
  const createdCategory = !category;
  if (!category) {
    category = await guild.channels.create({ name: TEST_WORLD.categoryName, type: ChannelType.GuildCategory, permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
    ], reason: "Created by /pk-stup" });
  }
  let createdAreas = 0;
  let existingAreas = 0;
  let pinnedMessages = 0;
  for (const biome of TEST_WORLD.biomes) {
    const existing = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && channel.parentId === category.id && channel.name === biome.channelName);
    const area = existing?.type === ChannelType.GuildText ? existing : await guild.channels.create({ name: biome.channelName, parent: category.id, type: ChannelType.GuildText, topic: `Pokémon test biome: ${biome.key}`, reason: "Created by /pk-stup" });
    if (existing) existingAreas += 1;
    else createdAreas += 1;
    if (await ensurePinnedStatus(area, TEST_WORLD.regionName, biome)) pinnedMessages += 1;
  }
  return { createdCategory, createdAreas, existingAreas, pinnedMessages };
}

export async function provisionPrivateTestRegion(guild: Guild, botUserId: string, regionKey: RegionKey): Promise<TestWorldSetupResult> {
  await guild.members.fetch(botUserId);
  const categoryName = `pk-test-${regionKey}`;
  const regionName = `${regionKey[0].toUpperCase()}${regionKey.slice(1)} (Test)`;
  let category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === categoryName);
  const createdCategory = !category;
  if (!category) {
    category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory, permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
    ], reason: `Created ${regionKey} test region` });
  }
  let createdAreas = 0;
  let existingAreas = 0;
  let pinnedMessages = 0;
  for (const key of REGION_BIOMES[regionKey]) {
    const biome: TestBiome = { key, channelName: channelNameForBiome(key), displayName: key.replaceAll("_", " ") };
    const existing = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && channel.parentId === category.id && channel.name === biome.channelName);
    const area = existing?.type === ChannelType.GuildText ? existing : await guild.channels.create({ name: biome.channelName, parent: category.id, type: ChannelType.GuildText, topic: `Pokémon test biome: ${key}`, reason: `Created ${regionKey} test biome` });
    if (existing) existingAreas += 1;
    else createdAreas += 1;
    if (await ensurePinnedStatus(area, regionName, biome)) pinnedMessages += 1;
  }
  return { createdCategory, createdAreas, existingAreas, pinnedMessages };
}

export async function removePrivateTestWorld(guild: Guild): Promise<TestWorldRemovalResult> {
  // Categories do not delete their children in Discord.  Treat every `pk-test-*`
  // category as owned by the test setup and remove all of its child channels first.
  const categories = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory
    && channel.name.startsWith("pk-test-"));
  let removedAreas = 0;
  for (const category of categories.values()) {
    const areas = guild.channels.cache.filter((channel) => channel.parentId === category.id);
    for (const area of areas.values()) {
      await area.delete("Removed by /pk-rm");
      removedAreas += 1;
    }
    await category.delete("Removed by /pk-rm");
  }
  return { removedAreas, removedCategory: categories.size > 0 };
}

async function ensurePinnedStatus(channel: TextChannel, regionName: string, biome: TestBiome): Promise<boolean> {
  const marker = `PK_SETUP_BIOME:${biome.key}`;
  if ((await channel.messages.fetchPinned()).some((message) => message.content.includes(marker))) return false;
  const statusMessage = await channel.send(biomeStatusMessage(regionName, biome));
  await statusMessage.pin("Pinned Pokémon test-biome status message");
  return true;
}
