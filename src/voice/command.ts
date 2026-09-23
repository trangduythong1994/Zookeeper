const REPEAT_SPEAKER_AFTER_MS = 30_000;

export type SpeechLanguage = "vi" | "en";

export type SpeechRequest = {
  content: string;
  language: SpeechLanguage;
};

export function speechRequestFromMessage(content: string): SpeechRequest | undefined {
  const prefix = content.startsWith("-sen") ? "-sen" : content.startsWith("-s") ? "-s" : undefined;
  if (!prefix) return undefined;

  const message = content.slice(prefix.length).trim();
  if (!message) return undefined;

  return { content: message, language: prefix === "-sen" ? "en" : "vi" };
}

type LastSpeaker = {
  userId: string;
  announcedAt: number;
};

export class SpeechIntroductionTracker {
  private readonly lastSpeakerByGuild = new Map<string, LastSpeaker>();

  format(guildId: string, userId: string, displayName: string, message: string, language: SpeechLanguage, now = Date.now()): string {
    const lastSpeaker = this.lastSpeakerByGuild.get(guildId);
    const shouldIntroduce = !lastSpeaker
      || lastSpeaker.userId !== userId
      || now - lastSpeaker.announcedAt >= REPEAT_SPEAKER_AFTER_MS;

    if (!shouldIntroduce) return message;
    return language === "en" ? `${displayName} says ${message}` : `${displayName} nói rằng ${message}`;
  }

  remember(guildId: string, userId: string, now = Date.now()): void {
    this.lastSpeakerByGuild.set(guildId, { userId, announcedAt: now });
  }
}
