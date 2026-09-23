# Discord Bot

A TypeScript Discord bot that reads Vietnamese voice messages triggered by chat. A user in a voice channel can send `-s <nội dung>` in any text channel; the bot joins that voice channel and says `User <tên hiển thị> nói rằng <nội dung>`.

## Stack

- Node.js **20.11.0 or newer**
- TypeScript
- [discord.js](https://discord.js.org/) v14
- dotenv for local environment configuration

## Project layout

```text
src/
  config/         Environment validation
  utils/          Shared utilities (logging)
  voice/          Chat trigger parsing and Discord voice playback
  index.ts        Client lifecycle and interaction routing
```

## Configure and run

1. Copy `.env.example` to `.env`.
2. Set `DISCORD_TOKEN`.
3. Run the bot:

```bash
npm start
```

For automatic restarts while editing source:

```bash
npm run dev
```

`npm start` builds the current source and then runs the compiled `dist/` output. To build without starting the bot:

```bash
npm run build
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal. Keep it secret. |

`.env` is ignored by Git. Never commit a bot token.

## Discord setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application.
2. Open **Bot**, create the bot user, and reset/copy its token into `.env` as `DISCORD_TOKEN`.
3. In **OAuth2 → URL Generator**, select the `bot` scope. Grant **Connect**, **Speak**, **View Channel**, and **Send Messages** permissions (or Administrator, if deliberately chosen). Open the generated URL and invite the bot to your server.
4. Under **Bot → Privileged Gateway Intents**, enable **Message Content Intent**. No other privileged intent is needed.
5. Start the bot. Join a voice channel, then send `-s Xin chào` in any text channel in the same server. The bot joins and speaks the message.

The bot uses only `Guilds`, `GuildMessages`, `GuildVoiceStates`, and `MessageContent` intents. It leaves a voice channel automatically once no human users remain there.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Troubleshooting

- **Missing environment variable:** ensure `.env` exists beside `package.json` and contains the required non-empty variables.
- **The bot ignores `-s`:** ensure Message Content Intent is enabled in the Developer Portal, then restart the bot.
- **The bot cannot join or speak:** verify it has Connect, Speak, and View Channel permissions in the relevant voice channel.
- **Invalid token:** reset the token in the Developer Portal, replace it in `.env`, and do not share it.
- **Bot is offline:** check the startup logs. The process must remain running after it reports that the client is ready.
