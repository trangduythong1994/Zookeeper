import { ChannelType, PermissionFlagsBits, type CategoryChannel, type Guild, type TextChannel } from "discord.js";
import { channelNameForBiome, REGION_BIOMES } from "../data/regions.js";

export const KANTO_WORLD = {
  categoryName: "Kanto",
  regionKey: "kanto",
} as const;

export type KantoWorldSetupResult = {
  createdAreas: number;
  createdCategory: boolean;
  existingAreas: number;
};

export type KantoWorldRemovalResult = {
  removedAreas: number;
  removedCategory: boolean;
};

export async function provisionKantoWorld(guild: Guild, botUserId: string, playerRoleId: string): Promise<KantoWorldSetupResult> {
  const playerRole = await guild.roles.fetch(playerRoleId);
  if (!playerRole) throw new Error(`Pokémon player role ${playerRoleId} was not found.`);

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: playerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: botUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
  ];
  const existingCategory = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === KANTO_WORLD.categoryName.toLowerCase());
  let category: CategoryChannel | undefined = existingCategory?.type === ChannelType.GuildCategory ? existingCategory : undefined;
  const createdCategory = !category;
  if (!category) {
    category = await guild.channels.create({
      name: KANTO_WORLD.categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason: "Created by /pk-create",
    });
  }
  await category.permissionOverwrites.set(permissionOverwrites, "Configured private Kanto access by /pk-create");

  let createdAreas = 0;
  let existingAreas = 0;
  for (const biomeKey of REGION_BIOMES.kanto) {
    const channelName = channelNameForBiome(biomeKey);
    const existing = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && channel.parentId === category.id && channel.name === channelName);
    const existingArea: TextChannel | undefined = existing?.type === ChannelType.GuildText ? existing : undefined;
    const area = existingArea ?? await guild.channels.create({
      name: channelName,
      parent: category.id,
      type: ChannelType.GuildText,
      topic: `Pokémon biome: Kanto / ${biomeKey}`,
      reason: "Created by /pk-create",
    });
    if (existingArea) {
      existingAreas += 1;
    } else {
      createdAreas += 1;
    }
    await area.lockPermissions();
  }
  return { createdCategory, createdAreas, existingAreas };
}

export async function removeKantoWorld(guild: Guild): Promise<KantoWorldRemovalResult> {
  const category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === KANTO_WORLD.categoryName.toLowerCase());
  if (!category) return { removedAreas: 0, removedCategory: false };

  const childChannels = guild.channels.cache.filter((channel) => channel.parentId === category.id);
  for (const channel of childChannels.values()) {
    await channel.delete("Removed by /pk-remove");
  }
  await category.delete("Removed by /pk-remove");
  return { removedAreas: childChannels.size, removedCategory: true };
}
