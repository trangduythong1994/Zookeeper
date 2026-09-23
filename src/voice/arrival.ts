export function shouldAnnounceVoiceArrival(
  userId: string,
  oldChannelId: string | null,
  newChannelId: string | null,
  presenceStatus: string | undefined,
  watchedUserId: string,
): boolean {
  return userId === watchedUserId
    && oldChannelId === null
    && newChannelId !== null
    && presenceStatus !== undefined
    && presenceStatus !== "offline";
}

export function shouldSpeakMemberArrival(
  oldChannelId: string | null,
  newChannelId: string | null,
  botChannelId: string | null | undefined,
): boolean {
  return oldChannelId !== newChannelId && newChannelId !== null && newChannelId === botChannelId;
}

export function shouldWelcomeFirstVoiceMember(
  oldChannelId: string | null,
  newChannelId: string | null,
  botChannelId: string | null | undefined,
): boolean {
  return oldChannelId !== newChannelId && newChannelId !== null && !botChannelId;
}

export function shouldAnnouncePresenceBoundary(
  userId: string,
  oldStatus: string | undefined,
  newStatus: string | undefined,
  watchedUserId: string,
): boolean {
  if (userId !== watchedUserId || !oldStatus || !newStatus || oldStatus === newStatus) return false;

  return (oldStatus === "offline") !== (newStatus === "offline");
}
