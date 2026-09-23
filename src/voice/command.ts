const REPEAT_SPEAKER_AFTER_MS = 30_000;

export type SpeechLanguage = "vi" | "en";

export type SpeechRequest = {
  content: string;
  deleteSource: boolean;
  language: SpeechLanguage;
  whisper: boolean;
};

export function speechRequestFromMessage(content: string): SpeechRequest | undefined {
  const command = content.startsWith("--sen")
    ? { prefix: "--sen", language: "en" as const, deleteSource: true, whisper: false }
    : content.startsWith("--s")
      ? { prefix: "--s", language: "vi" as const, deleteSource: true, whisper: true }
      : content.startsWith("-sen")
        ? { prefix: "-sen", language: "en" as const, deleteSource: false, whisper: false }
        : content.startsWith("-s")
          ? { prefix: "-s", language: "vi" as const, deleteSource: false, whisper: false }
          : undefined;
  if (!command) return undefined;

  const message = content.slice(command.prefix.length).trim();
  if (!message) return undefined;

  return { content: message, language: command.language, deleteSource: command.deleteSource, whisper: command.whisper };
}

type LastSpeaker = {
  userId: string;
  announcedAt: number;
};

export class SpeechIntroductionTracker {
  private readonly lastSpeakerByGuild = new Map<string, LastSpeaker>();

  format(guildId: string, userId: string, displayName: string, message: string, language: SpeechLanguage, whisper: boolean, now = Date.now()): string {
    const lastSpeaker = this.lastSpeakerByGuild.get(guildId);
    const shouldIntroduce = !lastSpeaker
      || lastSpeaker.userId !== userId
      || now - lastSpeaker.announcedAt >= REPEAT_SPEAKER_AFTER_MS;

    if (!shouldIntroduce) return message;
    if (language === "en") return `${displayName} says ${message}`;
    return whisper ? `${displayName} thì thầm rằng ${message}` : `${displayName} nói rằng ${message}`;
  }

  remember(guildId: string, userId: string, now = Date.now()): void {
    this.lastSpeakerByGuild.set(guildId, { userId, announcedAt: now });
  }
}
