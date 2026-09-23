# Discord Bot

A minimal TypeScript Discord bot with a `/ping` slash command. It uses the Discord Gateway only for guild interactions and is structured for small, incremental features.

## Stack

- Node.js **20.11.0 or newer**
- TypeScript
- [discord.js](https://discord.js.org/) v14
- dotenv for local environment configuration

## Project layout

```text
src/
  commands/       Slash-command definitions and handlers
  config/         Environment validation
  utils/          Shared utilities (logging)
  index.ts        Client lifecycle and interaction routing
  register-commands.ts
```

## Configure and run

1. Copy `.env.example` to `.env`.
2. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Set `DISCORD_GUILD_ID` during development to register `/ping` immediately in one server; omit it to register globally.
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
| `DISCORD_CLIENT_ID` | Yes | Application ID used to register slash commands. |
| `DISCORD_GUILD_ID` | No | Development server ID. Enables fast guild command registration. |

`.env` is ignored by Git. Never commit a bot token.

## Discord setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application.
2. Open **Bot**, create the bot user, and reset/copy its token into `.env` as `DISCORD_TOKEN`.
3. On **General Information**, copy **Application ID** into `.env` as `DISCORD_CLIENT_ID`.
4. For development, enable Developer Mode in Discord, copy the target server ID, and set `DISCORD_GUILD_ID`.
5. In **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes. Under Bot Permissions, select no permissions: `/ping` needs none beyond the command scope. Open the generated URL and invite the bot to your server.
6. Start the bot, then run `/ping` in the server. It replies `Pong!`.

No privileged Gateway Intents are needed or enabled.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Troubleshooting

- **Missing environment variable:** ensure `.env` exists beside `package.json` and contains the required non-empty variables.
- **`/ping` does not appear:** for global registration, Discord can take up to an hour to propagate. Set `DISCORD_GUILD_ID` for instant development registration, restart the bot, then retry.
- **Invalid token:** reset the token in the Developer Portal, replace it in `.env`, and do not share it.
- **Bot is offline:** check the startup logs. The process must remain running after it reports that the client is ready.
