import type Database from "better-sqlite3";
import type { SpeechLanguage, SpeechProvider } from "./command.js";

export type CloudVoiceTier = "neural2" | "standard";

export const CLOUD_TTS_TIERS: Record<CloudVoiceTier, { label: string; safetyLimit: number }> = {
  neural2: { label: "Neural2", safetyLimit: 850_000 },
  standard: { label: "Standard / WaveNet", safetyLimit: 3_400_000 },
};

export type TtsVoice = {
  id: string;
  label: string;
  language: SpeechLanguage | "both";
  provider: SpeechProvider;
  tier?: CloudVoiceTier;
};

const cloudVoice = (id: string, label: string, language: SpeechLanguage, tier: CloudVoiceTier): TtsVoice => ({ id, label, language, provider: "google-cloud", tier });

// Chirp 3: HD is intentionally excluded: its separate tier becomes expensive.
export const TTS_VOICES: readonly TtsVoice[] = [
  cloudVoice("vi-VN-Neural2-A", "Neural2 A · Nữ", "vi", "neural2"),
  cloudVoice("vi-VN-Neural2-D", "Neural2 D · Nam", "vi", "neural2"),
  cloudVoice("vi-VN-Standard-A", "Standard A · Nữ", "vi", "standard"),
  cloudVoice("vi-VN-Standard-B", "Standard B · Nam", "vi", "standard"),
  cloudVoice("vi-VN-Standard-C", "Standard C · Nữ", "vi", "standard"),
  cloudVoice("vi-VN-Standard-D", "Standard D · Nam", "vi", "standard"),
  cloudVoice("vi-VN-Wavenet-A", "WaveNet A · Nữ", "vi", "standard"),
  cloudVoice("vi-VN-Wavenet-B", "WaveNet B · Nam", "vi", "standard"),
  cloudVoice("vi-VN-Wavenet-C", "WaveNet C · Nữ", "vi", "standard"),
  cloudVoice("vi-VN-Wavenet-D", "WaveNet D · Nam", "vi", "standard"),
  cloudVoice("en-US-Neural2-A", "Neural2 A · Female", "en", "neural2"),
  cloudVoice("en-US-Neural2-C", "Neural2 C · Female", "en", "neural2"),
  cloudVoice("en-US-Neural2-D", "Neural2 D · Male", "en", "neural2"),
  cloudVoice("en-US-Neural2-F", "Neural2 F · Female", "en", "neural2"),
  { id: "edge", label: "Edge TTS · Free", language: "both", provider: "edge" },
  { id: "google", label: "Google TTS · Free", language: "both", provider: "google" },
];

function defaultVoice(language: SpeechLanguage): TtsVoice {
  return TTS_VOICES.find((voice) => voice.language === language && voice.provider === "google-cloud")!;
}

function monthKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(now);
}

export function ttsVoiceForPlayer(database: Database.Database, guildId: string, userId: string, language: SpeechLanguage): TtsVoice {
  const row = database.prepare("SELECT vi_voice AS viVoice, en_voice AS enVoice FROM tts_user_settings WHERE guild_id = ? AND user_id = ?").get(guildId, userId) as { viVoice: string; enVoice: string } | undefined;
  const voiceId = language === "vi" ? row?.viVoice : row?.enVoice;
  return TTS_VOICES.find((voice) => voice.id === voiceId && (voice.language === language || voice.language === "both")) ?? defaultVoice(language);
}

export function setTtsVoiceForPlayer(database: Database.Database, guildId: string, userId: string, language: SpeechLanguage, voiceId: string): TtsVoice | undefined {
  const voice = TTS_VOICES.find((candidate) => candidate.id === voiceId && (candidate.language === language || candidate.language === "both"));
  if (!voice) return undefined;
  const current = database.prepare("SELECT vi_voice AS viVoice, en_voice AS enVoice FROM tts_user_settings WHERE guild_id = ? AND user_id = ?").get(guildId, userId) as { viVoice: string; enVoice: string } | undefined;
  const viVoice = language === "vi" ? voice.id : current?.viVoice ?? defaultVoice("vi").id;
  const enVoice = language === "en" ? voice.id : current?.enVoice ?? defaultVoice("en").id;
  database.prepare(`INSERT INTO tts_user_settings (guild_id, user_id, vi_voice, en_voice) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET vi_voice = excluded.vi_voice, en_voice = excluded.en_voice`).run(guildId, userId, viVoice, enVoice);
  return voice;
}

export function googleCloudTtsUsage(database: Database.Database, tier: CloudVoiceTier, now = new Date()): number {
  const row = database.prepare("SELECT COALESCE(SUM(characters), 0) AS characters FROM google_cloud_tts_usage_v2 WHERE month_key = ? AND tier = ?").get(monthKey(now), tier) as { characters: number };
  return row.characters;
}

export function cloudQuotaRemainingPercent(database: Database.Database, tier: CloudVoiceTier): number {
  const limit = CLOUD_TTS_TIERS[tier].safetyLimit;
  return Math.max(0, Math.floor((1 - googleCloudTtsUsage(database, tier) / limit) * 100));
}

export function canUseGoogleCloudTts(database: Database.Database, tier: CloudVoiceTier, characters: number): boolean {
  return googleCloudTtsUsage(database, tier) + characters <= CLOUD_TTS_TIERS[tier].safetyLimit;
}

export function recordGoogleCloudTtsUsage(database: Database.Database, guildId: string, tier: CloudVoiceTier, characters: number, now = new Date()): void {
  database.prepare(`INSERT INTO google_cloud_tts_usage_v2 (guild_id, month_key, tier, characters) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, month_key, tier) DO UPDATE SET characters = characters + excluded.characters`).run(guildId, monthKey(now), tier, characters);
}
