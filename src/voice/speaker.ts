import { createAudioPlayer, createAudioResource, entersState, getVoiceConnection, joinVoiceChannel, AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnectionStatus, type VoiceConnection } from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { EdgeTTS } from "node-edge-tts";
import { createRequire } from "node:module";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough } from "node:stream";
import { delimiter, dirname } from "node:path";
import { logger } from "../utils/logger.js";
import type { SpeechLanguage } from "./command.js";

const edgeTts = new EdgeTTS({
  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  timeout: 15_000,
});

const speechSettings: Record<SpeechLanguage, { locale: string; voice: string }> = {
  vi: { locale: "vi-VN", voice: "vi-VN-HoaiMyNeural" },
  en: { locale: "en-US", voice: "en-US-JennyNeural" },
};

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;

if (!ffmpegPath) {
  throw new Error("ffmpeg-static did not provide an FFmpeg executable.");
}

const ffmpegExecutable = ffmpegPath;
process.env.PATH = `${dirname(ffmpegExecutable)}${delimiter}${process.env.PATH ?? ""}`;

type EdgeTtsSocket = {
  close(): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "message", listener: (data: Buffer, isBinary: boolean) => void): void;
  once(event: "error", listener: (error: Error) => void): void;
  send(data: string): void;
};

type StreamableEdgeTts = {
  _connectWebSocket(): Promise<EdgeTtsSocket>;
};

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

async function streamSpeech(text: string, language: SpeechLanguage, destination: PassThrough): Promise<void> {
  const socket = await (edgeTts as unknown as StreamableEdgeTts)._connectWebSocket();
  const settings = speechSettings[language];

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => fail(new Error("Edge TTS timed out.")), 15_000);
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      destination.end();
      resolve();
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      // The caller receives this rejection and reports it to Discord. Ending the
      // stream without an error prevents Node from treating a transient TTS
      // network failure as an uncaught process-wide exception.
      destination.end();
      reject(error);
    };

    socket.once("error", fail);
    socket.on("close", (code, reason) => {
      if (!settled) fail(new Error(`Edge TTS closed unexpectedly (${code}): ${reason.toString() || "no reason"}`));
    });
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        const separator = Buffer.from("Path:audio\r\n");
        const index = data.indexOf(separator);
        if (index >= 0) destination.write(data.subarray(index + separator.length));
        return;
      }

      if (data.toString().includes("Path:turn.end")) finish();
    });

    const requestId = crypto.randomUUID().replaceAll("-", "");
    socket.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${settings.locale}"><voice name="${settings.voice}"><prosody rate="default" pitch="default" volume="default">${escapeXml(text)}</prosody></voice></speak>`);
  });
}

function createLowLatencyResource(audio: PassThrough) {
  const decoder = spawn(ffmpegExecutable, [
    "-hide_banner",
    "-loglevel", "error",
    "-f", "mp3",
    "-analyzeduration", "0",
    "-probesize", "32",
    "-i", "pipe:0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ]) as ChildProcessWithoutNullStreams;

  audio.pipe(decoder.stdin);
  decoder.stderr.on("data", (data: Buffer) => {
    const message = data.toString().trim();
    if (message) logger.error("FFmpeg voice decoder error", { message });
  });

  return createAudioResource(decoder.stdout, { inputType: StreamType.Raw });
}

async function warmUpEdgeTts(): Promise<void> {
  await Promise.all((["vi", "en"] as const).map(async (language) => {
    const sink = new PassThrough();
    sink.resume();
    await streamSpeech(language === "vi" ? "Sẵn sàng." : "Ready.", language, sink);
  }));
}

class GuildSpeaker {
  private readonly player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  private channelId?: string;
  private speaking = false;
  private speechStartedAt?: number;

  constructor(private readonly guildId: string) {
    this.player.on("error", (error) => {
      logger.error("Voice player error", { guildId, message: error.message });
    });
    this.player.on("stateChange", (oldState, newState) => {
      if (oldState.status !== AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Playing && this.speechStartedAt) {
        logger.info("Voice playback started", { guildId, latencyMs: Date.now() - this.speechStartedAt });
      }
    });
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  getChannelId(): string | undefined {
    return this.channelId;
  }

  async speak(channel: VoiceBasedChannel, text: string, language: SpeechLanguage): Promise<"busy" | "spoken"> {
    if (this.speaking) return "busy";
    this.speaking = true;
    this.speechStartedAt = Date.now();

    try {
      const audio = new PassThrough();
      const resource = createLowLatencyResource(audio);
      const synthesis = streamSpeech(text, language, audio);
      await this.connect(channel);
      this.player.play(resource);
      await Promise.all([synthesis, entersState(this.player, AudioPlayerStatus.Idle, 120_000)]);

      logger.info("Finished voice message", { guildId: this.guildId, channelId: channel.id });
      return "spoken";
    } finally {
      this.speaking = false;
      this.speechStartedAt = undefined;
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
      daveEncryption: true,
      selfDeaf: true,
    });

    connection.on("stateChange", (oldState, newState) => {
      logger.info("Voice connection state changed", {
        guildId: this.guildId,
        channelId: channel.id,
        from: oldState.status,
        to: newState.status,
      });
    });
    connection.on("error", (error) => {
      logger.error("Voice connection error", { guildId: this.guildId, channelId: channel.id, message: error.message });
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Voice connection did not become ready", {
        guildId: this.guildId,
        channelId: channel.id,
        state: connection.state.status,
        message,
      });
      connection.destroy();
      throw error;
    }

    connection.subscribe(this.player);
    this.channelId = channel.id;
    logger.info("Joined voice channel", { guildId: this.guildId, channelId: channel.id });
    return connection;
  }
}

export class SpeakerManager {
  private readonly speakers = new Map<string, GuildSpeaker>();
  private lastTtsWarmUpAt = 0;
  private warmingUp?: Promise<void>;

  async warmUpTts(): Promise<void> {
    const now = Date.now();
    if (this.warmingUp) return this.warmingUp;
    if (now - this.lastTtsWarmUpAt < 10 * 60_000) return;

    this.lastTtsWarmUpAt = now;
    this.warmingUp = warmUpEdgeTts()
      .then(() => logger.info("Edge TTS warmed up"))
      .finally(() => { this.warmingUp = undefined; });
    return this.warmingUp;
  }

  async speak(channel: VoiceBasedChannel, text: string, language: SpeechLanguage): Promise<"busy" | "spoken"> {
    const speaker = this.speakers.get(channel.guild.id) ?? new GuildSpeaker(channel.guild.id);
    this.speakers.set(channel.guild.id, speaker);
    return speaker.speak(channel, text, language);
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
