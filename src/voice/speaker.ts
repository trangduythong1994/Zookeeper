import { createAudioPlayer, createAudioResource, entersState, getVoiceConnection, joinVoiceChannel, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, type VoiceConnection } from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { EdgeTTS } from "node-edge-tts";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { logger } from "../utils/logger.js";

const vietnameseTts = new EdgeTTS({
  voice: "vi-VN-HoaiMyNeural",
  lang: "vi-VN",
  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  timeout: 15_000,
});

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;

if (!ffmpegPath) {
  throw new Error("ffmpeg-static did not provide an FFmpeg executable.");
}

process.env.PATH = `${dirname(ffmpegPath)}${delimiter}${process.env.PATH ?? ""}`;

class GuildSpeaker {
  private readonly player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  private channelId?: string;
  private speaking = false;

  constructor(private readonly guildId: string) {
    this.player.on("error", (error) => {
      logger.error("Voice player error", { guildId, message: error.message });
    });
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  getChannelId(): string | undefined {
    return this.channelId;
  }

  async speak(channel: VoiceBasedChannel, text: string): Promise<"busy" | "spoken"> {
    if (this.speaking) return "busy";
    this.speaking = true;

    try {
      await this.connect(channel);
      const temporaryDirectory = await mkdtemp(join(tmpdir(), "zookeeper-tts-"));
      const audioPath = join(temporaryDirectory, "speech.mp3");

      try {
        await vietnameseTts.ttsPromise(text, audioPath);
        this.player.play(createAudioResource(audioPath));
        await entersState(this.player, AudioPlayerStatus.Idle, 120_000);
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }

      logger.info("Finished voice message", { guildId: this.guildId, channelId: channel.id });
      return "spoken";
    } finally {
      this.speaking = false;
    }
  }

  leave(): void {
    this.player.stop(true);
    getVoiceConnection(this.guildId)?.destroy();
    this.channelId = undefined;
    logger.info("Left voice channel", { guildId: this.guildId });
  }

  private async connect(channel: VoiceBasedChannel): Promise<VoiceConnection> {
    const existingConnection = getVoiceConnection(this.guildId);
    if (existingConnection && this.channelId === channel.id) return existingConnection;

    existingConnection?.destroy();
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: this.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    connection.subscribe(this.player);
    this.channelId = channel.id;
    logger.info("Joined voice channel", { guildId: this.guildId, channelId: channel.id });
    return connection;
  }
}

export class SpeakerManager {
  private readonly speakers = new Map<string, GuildSpeaker>();

  async speak(channel: VoiceBasedChannel, text: string): Promise<"busy" | "spoken"> {
    const speaker = this.speakers.get(channel.guild.id) ?? new GuildSpeaker(channel.guild.id);
    this.speakers.set(channel.guild.id, speaker);
    return speaker.speak(channel, text);
  }

  leaveIfAlone(channel: VoiceBasedChannel): void {
    const speaker = this.speakers.get(channel.guild.id);
    if (!speaker || speaker.getChannelId() !== channel.id) return;

    const humanCount = channel.members.filter((member) => !member.user.bot).size;
    if (humanCount > 0) return;

    speaker.leave();
    this.speakers.delete(channel.guild.id);
  }
}
