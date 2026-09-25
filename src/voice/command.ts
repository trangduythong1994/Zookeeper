const REPEAT_SPEAKER_AFTER_MS = 30_000;

export type SpeechLanguage = "vi" | "en";
export type SpeechProvider = "edge" | "google";

export type SpeechRequest = {
  content: string;
  deleteSource: boolean;
  language: SpeechLanguage;
  provider: SpeechProvider;
  shouting: boolean;
  whisper: boolean;
};

function isAllCapsWord(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters === letters.toLocaleUpperCase();
}

function isShouting(content: string): boolean {
  const words = content.trim().match(/\S+/gu) ?? [];
  return words.filter(isAllCapsWord).length / words.length >= 0.5;
}

export function speechRequestFromMessage(content: string): SpeechRequest | undefined {
  // Mobile keyboards can turn a leading double hyphen into an en/em dash.
  // Normalize only the command prefix so dashes in the spoken message stay intact.
  const commandContent = content.replace(/^[–—]/u, "--");
  const normalizedContent = commandContent.toLowerCase();
  const command = normalizedContent.startsWith("--sen")
    ? { prefix: "--sen", language: "en" as const, provider: "edge" as const, deleteSource: true, whisper: false }
    : normalizedContent.startsWith("--s")
      ? { prefix: "--s", language: "vi" as const, provider: "edge" as const, deleteSource: true, whisper: true }
      : normalizedContent.startsWith("--gen")
        ? { prefix: "--gen", language: "en" as const, provider: "google" as const, deleteSource: true, whisper: false }
        : normalizedContent.startsWith("--g")
          ? { prefix: "--g", language: "vi" as const, provider: "google" as const, deleteSource: true, whisper: true }
          : normalizedContent.startsWith("-gen")
            ? { prefix: "-gen", language: "en" as const, provider: "google" as const, deleteSource: false, whisper: false }
            : normalizedContent.startsWith("-g")
              ? { prefix: "-g", language: "vi" as const, provider: "google" as const, deleteSource: false, whisper: false }
      : normalizedContent.startsWith("-sen")
        ? { prefix: "-sen", language: "en" as const, provider: "edge" as const, deleteSource: false, whisper: false }
        : normalizedContent.startsWith("-s")
          ? { prefix: "-s", language: "vi" as const, provider: "edge" as const, deleteSource: false, whisper: false }
          : undefined;
  if (!command) return undefined;

  const message = commandContent.slice(command.prefix.length).trim();
  if (!message) return undefined;

  return {
    content: message,
    language: command.language,
    provider: command.provider,
    deleteSource: command.deleteSource,
    whisper: command.whisper,
    shouting: isShouting(content),
  };
}

type LastSpeaker = {
  userId: string;
  announcedAt: number;
};

export class SpeechIntroductionTracker {
  private readonly lastSpeakerByGuild = new Map<string, LastSpeaker>();

  format(guildId: string, userId: string, displayName: string, message: string, language: SpeechLanguage, whisper: boolean, shouting: boolean, now = Date.now()): string {
    const lastSpeaker = this.lastSpeakerByGuild.get(guildId);
    const shouldIntroduce = !lastSpeaker
      || lastSpeaker.userId !== userId
      || now - lastSpeaker.announcedAt >= REPEAT_SPEAKER_AFTER_MS;

    if (shouting) return language === "en" ? `${displayName} shouts ${message}` : `${displayName} gào thét rằng ${message}`;
    if (!shouldIntroduce) return message;
    if (language === "en") return `${displayName} says ${message}`;
    return whisper ? `${displayName} thì thầm rằng ${message}` : `${displayName} nói rằng ${message}`;
  }

  remember(guildId: string, userId: string, now = Date.now()): void {
    this.lastSpeakerByGuild.set(guildId, { userId, announcedAt: now });
  }
}
