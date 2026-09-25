import { createAudioPlayer, createAudioResource, entersState, getVoiceConnection, joinVoiceChannel, AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnectionStatus, type VoiceConnection } from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { EdgeTTS } from "node-edge-tts";
import { createRequire } from "node:module";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough } from "node:stream";
import { delimiter, dirname } from "node:path";
import { logger } from "../utils/logger.js";
import type { SpeechLanguage, SpeechProvider } from "./command.js";
import { SpeechQueue, type SpeechPriority } from "./queue.js";

const edgeTtsOptions = {
  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  timeout: 15_000,
} as const;

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
const MAX_TTS_ATTEMPTS = 3;

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
  // Edge sometimes drops an individual socket (close code 1006).  A TTS client
  // has no session state, so make a fresh client and a fresh WebSocket for every
  // synthesis attempt instead of ever reusing a closed connection.
  const edgeTts = new EdgeTTS(edgeTtsOptions);
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

function googleTtsChunks(text: string, maxLength = 180): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxLength) {
    const splitAt = Math.max(remaining.lastIndexOf(" ", maxLength), remaining.lastIndexOf(",", maxLength), remaining.lastIndexOf(".", maxLength));
    const end = splitAt > 0 ? splitAt + 1 : maxLength;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function streamGoogleSpeech(text: string, language: SpeechLanguage, destination: PassThrough): Promise<void> {
  try {
    for (const chunk of googleTtsChunks(text)) {
      const url = new URL("https://translate.google.com/translate_tts");
      url.searchParams.set("client", "tw-ob");
      url.searchParams.set("ie", "UTF-8");
      url.searchParams.set("tl", language);
      url.searchParams.set("q", chunk);
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error(`Google TTS request failed (${response.status}).`);
      destination.write(Buffer.from(await response.arrayBuffer()));
    }
    destination.end();
  } catch (error) {
    destination.end();
    throw error;
  }
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

  async speak(channel: VoiceBasedChannel, text: string, language: SpeechLanguage, provider: SpeechProvider): Promise<"busy" | "spoken"> {
    if (this.speaking) return "busy";
    this.speaking = true;
    this.speechStartedAt = Date.now();

    try {
      if (provider === "google") {
        await this.playOnce(channel, text, language, "google");
        return "spoken";
      }

      let lastEdgeError: unknown;
      for (let attempt = 1; attempt <= MAX_TTS_ATTEMPTS; attempt += 1) {
        try {
          await this.playOnce(channel, text, language, "edge");
          return "spoken";
        } catch (error) {
          this.player.stop(true);
          lastEdgeError = error;
          if (!isRetryableTtsFailure(error)) throw error;
          if (attempt === MAX_TTS_ATTEMPTS) break;

          const message = error instanceof Error ? error.message : String(error);
          const delayMs = ttsRetryDelayMs(attempt);
          logger.warn("Edge TTS failed; retrying voice message", {
            guildId: this.guildId,
            channelId: channel.id,
            attempt,
            remainingAttempts: MAX_TTS_ATTEMPTS - attempt,
            delayMs,
            message,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
      }

      logger.warn("Edge TTS remained unavailable; falling back to Google TTS", {
        guildId: this.guildId,
        channelId: channel.id,
        message: lastEdgeError instanceof Error ? lastEdgeError.message : String(lastEdgeError),
      });
      await this.playOnce(channel, text, language, "google");
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

  private async playOnce(channel: VoiceBasedChannel, text: string, language: SpeechLanguage, provider: SpeechProvider): Promise<void> {
    const audio = new PassThrough();
    const resource = createLowLatencyResource(audio);
    const synthesis = provider === "google" ? streamGoogleSpeech(text, language, audio) : streamSpeech(text, language, audio);
    await this.connect(channel);
    this.player.play(resource);
    await Promise.all([synthesis, entersState(this.player, AudioPlayerStatus.Idle, 120_000)]);
    logger.info("Finished voice message", { guildId: this.guildId, channelId: channel.id, provider });
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
  private readonly queues = new Map<string, QueueState>();
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

  speak(channel: VoiceBasedChannel, text: string, language: SpeechLanguage, provider: SpeechProvider): Promise<"spoken"> {
    return this.enqueue(channel, text, language, provider, "standard");
  }

  speakArrival(channel: VoiceBasedChannel, text: string): Promise<"spoken"> {
    return this.enqueue(channel, text, "vi", "edge", "arrival");
  }

  isGreeting(guildId: string): boolean {
    return (this.queues.get(guildId)?.arrivalCount ?? 0) > 0;
  }

  getVoiceChannelId(guildId: string): string | undefined {
    return getVoiceConnection(guildId)?.joinConfig.channelId ?? undefined;
  }

  leaveIfAlone(channel: VoiceBasedChannel): void {
    const speaker = this.speakers.get(channel.guild.id);
    if (!speaker || speaker.getChannelId() !== channel.id) return;

    const humanCount = channel.members.filter((member) => !member.user.bot).size;
    if (humanCount > 0) return;

    speaker.leave();
    this.speakers.delete(channel.guild.id);
    const queueState = this.queues.get(channel.guild.id);
    if (queueState) {
      queueState.cancelled = true;
      for (const speech of queueState.queue.drain()) {
        if (speech.priority === "arrival") queueState.arrivalCount -= 1;
        speech.reject(new Error("No human members remain in the voice channel."));
      }
      this.queues.delete(channel.guild.id);
    }
  }

  private enqueue(channel: VoiceBasedChannel, text: string, language: SpeechLanguage, provider: SpeechProvider, priority: SpeechPriority): Promise<"spoken"> {
    const guildId = channel.guild.id;
    const queueState = this.queues.get(guildId) ?? { queue: new SpeechQueue<QueuedSpeech>(), processing: false, cancelled: false, arrivalCount: 0 };
    this.queues.set(guildId, queueState);
    if (priority === "arrival") queueState.arrivalCount += 1;

    const pendingSpeech = new Promise<"spoken">((resolve, reject) => {
      queueState.queue.enqueue({ channel, text, language, provider, priority, resolve, reject }, priority);
    });
    void this.processQueue(guildId, queueState);
    return pendingSpeech;
  }

  private async processQueue(guildId: string, queueState: QueueState): Promise<void> {
    if (queueState.processing) return;
    queueState.processing = true;

    try {
      let pendingSpeech: QueuedSpeech | undefined;
      while (!queueState.cancelled && (pendingSpeech = queueState.queue.dequeue())) {
        const speaker = this.speakers.get(guildId) ?? new GuildSpeaker(guildId);
        this.speakers.set(guildId, speaker);
        try {
          await speaker.speak(pendingSpeech.channel, pendingSpeech.text, pendingSpeech.language, pendingSpeech.provider);
          if (queueState.cancelled) pendingSpeech.reject(new Error("No human members remain in the voice channel."));
          else pendingSpeech.resolve("spoken");
        } catch (error) {
          pendingSpeech.reject(error);
        } finally {
          if (pendingSpeech.priority === "arrival") queueState.arrivalCount -= 1;
        }
      }
    } finally {
      queueState.processing = false;
      if (this.queues.get(guildId) === queueState && queueState.queue.size === 0) {
        this.queues.delete(guildId);
      }
    }
  }
}

export function isRetryableTtsFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("Edge TTS closed unexpectedly") || message === "Edge TTS timed out.";
}

export function ttsRetryDelayMs(attempt: number): number {
  return 1_500 * attempt;
}

type QueuedSpeech = {
  channel: VoiceBasedChannel;
  text: string;
  language: SpeechLanguage;
  provider: SpeechProvider;
  priority: SpeechPriority;
  resolve: (value: "spoken") => void;
  reject: (reason?: unknown) => void;
};

type QueueState = {
  queue: SpeechQueue<QueuedSpeech>;
  processing: boolean;
  cancelled: boolean;
  arrivalCount: number;
};
