import { ChannelType, PermissionFlagsBits, type CategoryChannel, type Guild, type TextChannel } from "discord.js";

export const EXPLORE_CHANNEL_NAME = "explore";
export const EXPLORE_CATEGORY_NAME = "Pokémon Ex";

export async function provisionExploreChannel(guild: Guild, botUserId: string, playerRoleId: string): Promise<{ created: boolean; createdCategory: boolean }> {
  const playerRole = await guild.roles.fetch(playerRoleId);
  if (!playerRole) throw new Error(`Pokémon player role ${playerRoleId} was not found.`);
  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: playerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: botUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
  ];
  const foundCategory = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === EXPLORE_CATEGORY_NAME);
  const category: CategoryChannel = foundCategory?.type === ChannelType.GuildCategory
    ? foundCategory
    : await guild.channels.create({
      name: EXPLORE_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason: "Created by /pk-create",
    });
  await category.permissionOverwrites.set(permissionOverwrites, "Configured private Pokémon access by /pk-create");

  const found = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && channel.name === EXPLORE_CHANNEL_NAME);
  const existing: TextChannel | undefined = found?.type === ChannelType.GuildText ? found : undefined;
  const channel = existing ?? await guild.channels.create({
    name: EXPLORE_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: "Pokémon exploration — select a destination with /pk-travel.",
    permissionOverwrites,
    reason: "Created by /pk-create",
  });
  if (existing && channel.parentId !== category.id) await channel.setParent(category, { lockPermissions: true });
  await channel.lockPermissions();
  return { created: !existing, createdCategory: !foundCategory };
}
