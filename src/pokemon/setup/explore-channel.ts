import { ChannelType, PermissionFlagsBits, type CategoryChannel, type Guild, type TextChannel } from "discord.js";

export const EXPLORE_CHANNEL_NAME = "explore";
export const EVENT_CHANNEL_NAME = "event";
export const GIFTING_CHANNEL_NAME = "gifting";
export const SHOW_OFF_CHANNEL_NAME = "show-off";
export const EXPLORE_CATEGORY_NAME = "Pokémon Ex";

export async function provisionExploreChannel(guild: Guild, botUserId: string, playerRoleId: string): Promise<{ created: boolean; createdCategory: boolean; eventChannel: TextChannel; eventCreated: boolean; giftingChannel: TextChannel; giftingCreated: boolean; showOffChannel: TextChannel; showOffCreated: boolean }> {
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
  const foundEvent = guild.channels.cache.find((candidate) => candidate.type === ChannelType.GuildText && candidate.name === EVENT_CHANNEL_NAME);
  const existingEvent: TextChannel | undefined = foundEvent?.type === ChannelType.GuildText ? foundEvent : undefined;
  const eventChannel = existingEvent ?? await guild.channels.create({
    name: EVENT_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: "Pokémon collection events.",
    permissionOverwrites,
    reason: "Created by /pk-create",
  });
  if (existingEvent && eventChannel.parentId !== category.id) await eventChannel.setParent(category, { lockPermissions: true });
  await eventChannel.lockPermissions();
  const foundGifting = guild.channels.cache.find((candidate) => candidate.type === ChannelType.GuildText && candidate.name === GIFTING_CHANNEL_NAME);
  const existingGifting: TextChannel | undefined = foundGifting?.type === ChannelType.GuildText ? foundGifting : undefined;
  const giftingChannel = existingGifting ?? await guild.channels.create({
    name: GIFTING_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: "Pokémon gifts between Trainers.",
    permissionOverwrites,
    reason: "Created by /pk-create",
  });
  if (existingGifting && giftingChannel.parentId !== category.id) await giftingChannel.setParent(category, { lockPermissions: true });
  await giftingChannel.lockPermissions();
  const foundShowOff = guild.channels.cache.find((candidate) => candidate.type === ChannelType.GuildText && candidate.name === SHOW_OFF_CHANNEL_NAME);
  const existingShowOff: TextChannel | undefined = foundShowOff?.type === ChannelType.GuildText ? foundShowOff : undefined;
  const showOffChannel = existingShowOff ?? await guild.channels.create({
    name: SHOW_OFF_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: "Pokémon collections shared by Trainers.",
    permissionOverwrites,
    reason: "Created by /pk-create",
  });
  if (existingShowOff && showOffChannel.parentId !== category.id) await showOffChannel.setParent(category, { lockPermissions: true });
  await showOffChannel.lockPermissions();
  return { created: !existing, createdCategory: !foundCategory, eventChannel, eventCreated: !existingEvent, giftingChannel, giftingCreated: !existingGifting, showOffChannel, showOffCreated: !existingShowOff };
}
