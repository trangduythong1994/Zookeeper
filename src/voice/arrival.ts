export type VoiceTransition = "joined" | "left" | "moved";

export function watchedVoiceTransition(
  userId: string,
  oldChannelId: string | null,
  newChannelId: string | null,
  watchedUserId: string,
): VoiceTransition | undefined {
  if (userId !== watchedUserId || oldChannelId === newChannelId) return undefined;
  if (oldChannelId === null && newChannelId !== null) return "joined";
  if (oldChannelId !== null && newChannelId === null) return "left";
  return "moved";
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
