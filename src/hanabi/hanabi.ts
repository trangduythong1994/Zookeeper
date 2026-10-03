import type Database from "better-sqlite3";

export const HANABI_COLORS = ["red", "yellow", "green", "blue", "white"] as const;
export const HANABI_NUMBERS = [1, 2, 3, 4, 5] as const;
export const HANABI_MAX_PLAYERS = 5;
export const HANABI_MAX_CLUES = 8;
export const HANABI_STARTING_FUSES = 3;

export type HanabiColor = typeof HANABI_COLORS[number];
export type HanabiNumber = typeof HANABI_NUMBERS[number];
export type HanabiCard = {
  id: string;
  color: HanabiColor;
  number: HanabiNumber;
  knownColor?: HanabiColor;
  knownNumber?: HanabiNumber;
};
export type HanabiPlayer = { userId: string; displayName: string; hand: HanabiCard[] };
export type HanabiState = {
  players: HanabiPlayer[];
  deck: HanabiCard[];
  discard: HanabiCard[];
  fireworks: Record<HanabiColor, number>;
  clues: number;
  fuses: number;
  turnIndex: number;
  finalTurnsRemaining?: number;
  endReason?: "fuses" | "perfect" | "impossible-firework" | "final-round";
  impossibleColor?: HanabiColor;
  lastAction?: string;
};
export type HanabiGame = {
  gameId: string;
  guildId: string;
  hostUserId: string;
  channelId?: string;
  lobbyMessageId?: string;
  threadId?: string;
  boardMessageId?: string;
  state: "lobby" | "active" | "completed" | "cancelled";
  data: HanabiState;
  createdAt: number;
  updatedAt: number;
};

type StoredGame = Omit<HanabiGame, "data"> & { dataJson: string };

export function colorEmoji(color: HanabiColor): string {
  return { red: "🔴", yellow: "🟡", green: "🟢", blue: "🔵", white: "⚪" }[color];
}

export function cardText(card: Pick<HanabiCard, "color" | "number">): string {
  return `${colorEmoji(card.color)}${card.number}`;
}

export function handSize(playerCount: number): number {
  return playerCount <= 3 ? 5 : 4;
}

export function emptyState(hostUserId: string, hostDisplayName: string): HanabiState {
  return {
    players: [{ userId: hostUserId, displayName: hostDisplayName, hand: [] }],
    deck: [], discard: [],
    fireworks: { red: 0, yellow: 0, green: 0, blue: 0, white: 0 },
    clues: HANABI_MAX_CLUES,
    fuses: HANABI_STARTING_FUSES,
    turnIndex: 0,
  };
}

function deckForClassicGame(): HanabiCard[] {
  const cards: HanabiCard[] = [];
  let nextId = 1;
  for (const color of HANABI_COLORS) {
    for (const number of HANABI_NUMBERS) {
      const copies = number === 1 ? 3 : number === 5 ? 1 : 2;
      for (let copy = 0; copy < copies; copy += 1) cards.push({ id: `${color}-${number}-${nextId++}`, color, number });
    }
  }
  return cards;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

export function joinLobby(data: HanabiState, userId: string, displayName: string): "joined" | "already-joined" | "full" {
  if (data.players.some((player) => player.userId === userId)) return "already-joined";
  if (data.players.length >= HANABI_MAX_PLAYERS) return "full";
  data.players.push({ userId, displayName, hand: [] });
  return "joined";
}

export function leaveLobby(data: HanabiState, userId: string): boolean {
  const index = data.players.findIndex((player) => player.userId === userId);
  if (index < 0) return false;
  data.players.splice(index, 1);
  return true;
}

export function startClassicGame(data: HanabiState, random = Math.random): void {
  if (data.players.length < 2 || data.players.length > HANABI_MAX_PLAYERS) throw new Error("Hanabi needs 2 to 5 players");
  data.players = shuffled(data.players, random);
  data.deck = shuffled(deckForClassicGame(), random);
  const cardsPerPlayer = handSize(data.players.length);
  for (let round = 0; round < cardsPerPlayer; round += 1) {
    for (const player of data.players) player.hand.push(data.deck.pop()!);
  }
  data.turnIndex = 0;
  data.clues = HANABI_MAX_CLUES;
  data.fuses = HANABI_STARTING_FUSES;
  data.discard = [];
  data.fireworks = { red: 0, yellow: 0, green: 0, blue: 0, white: 0 };
  data.finalTurnsRemaining = undefined;
  data.endReason = undefined;
  data.impossibleColor = undefined;
  data.lastAction = "The fireworks are ready. Do not embarrass yourselves.";
}

export function currentPlayer(data: HanabiState): HanabiPlayer {
  return data.players[data.turnIndex]!;
}

export function score(data: HanabiState): number {
  return Object.values(data.fireworks).reduce((total, value) => total + value, 0);
}

/** A color is impossible once any needed number has no copy left in a hand or the deck. */
export function impossibleFireworkColor(data: HanabiState): HanabiColor | undefined {
  const remainingCards = [...data.deck, ...data.players.flatMap((player) => player.hand)];
  return HANABI_COLORS.find((color) => {
    for (let number = data.fireworks[color] + 1; number <= 5; number += 1) {
      if (!remainingCards.some((card) => card.color === color && card.number === number)) return true;
    }
    return false;
  });
}

function draw(data: HanabiState, player: HanabiPlayer): void {
  const nextCard = data.deck.pop();
  if (!nextCard) return;
  player.hand.push(nextCard);
  if (data.deck.length === 0) data.finalTurnsRemaining = data.players.length;
}

function finishTurn(data: HanabiState, deckWasEmptyBeforeTurn: boolean): "active" | "completed" {
  if (data.fuses <= 0) {
    data.endReason = "fuses";
    return "completed";
  }
  if (score(data) === 25) {
    data.endReason = "perfect";
    return "completed";
  }
  const impossibleColor = impossibleFireworkColor(data);
  if (impossibleColor) {
    data.endReason = "impossible-firework";
    data.impossibleColor = impossibleColor;
    return "completed";
  }
  if (deckWasEmptyBeforeTurn && data.finalTurnsRemaining !== undefined) {
    data.finalTurnsRemaining -= 1;
    if (data.finalTurnsRemaining <= 0) {
      data.endReason = "final-round";
      return "completed";
    }
  }
  data.turnIndex = (data.turnIndex + 1) % data.players.length;
  return "active";
}

function assertTurn(data: HanabiState, userId: string): HanabiPlayer {
  const player = currentPlayer(data);
  if (player.userId !== userId) throw new Error("It is not your turn");
  return player;
}

export function giveHint(data: HanabiState, actorUserId: string, targetUserId: string, hint: HanabiColor | HanabiNumber): { matches: number; status: "active" | "completed" } {
  const actor = assertTurn(data, actorUserId);
  const target = data.players.find((player) => player.userId === targetUserId);
  if (!target || target.userId === actor.userId) throw new Error("Choose another player");
  if (data.clues <= 0) throw new Error("No Hint Tokens left");
  data.clues -= 1;
  const isColor = typeof hint === "string";
  const matches = target.hand.filter((card) => isColor ? card.color === hint : card.number === hint).length;
  for (const card of target.hand) {
    if (isColor && card.color === hint) card.knownColor = hint;
    if (!isColor && card.number === hint) card.knownNumber = hint;
  }
  data.lastAction = `${actor.displayName} hinted ${target.displayName}: ${isColor ? `${colorEmoji(hint)} ${hint}` : hint} (${matches} card${matches === 1 ? "" : "s"}).`;
  return { matches, status: finishTurn(data, data.deck.length === 0) };
}

export function playCard(data: HanabiState, actorUserId: string, cardIndex: number): { card: HanabiCard; correct: boolean; status: "active" | "completed" } {
  const player = assertTurn(data, actorUserId);
  const card = player.hand[cardIndex];
  if (!card) throw new Error("That card is no longer in your hand");
  const deckWasEmptyBeforeTurn = data.deck.length === 0;
  player.hand.splice(cardIndex, 1);
  const correct = card.number === data.fireworks[card.color] + 1;
  if (correct) {
    data.fireworks[card.color] += 1;
    if (card.number === 5) data.clues = Math.min(HANABI_MAX_CLUES, data.clues + 1);
  } else {
    data.discard.push(card);
    data.fuses -= 1;
  }
  draw(data, player);
  data.lastAction = correct
    ? `${player.displayName} played ${cardText(card)} correctly.`
    : `${player.displayName} played ${cardText(card)} and blew up a Fuse.`;
  return { card, correct, status: finishTurn(data, deckWasEmptyBeforeTurn) };
}

export function discardCard(data: HanabiState, actorUserId: string, cardIndex: number): { card: HanabiCard; status: "active" | "completed" } {
  const player = assertTurn(data, actorUserId);
  const card = player.hand[cardIndex];
  if (!card) throw new Error("That card is no longer in your hand");
  const deckWasEmptyBeforeTurn = data.deck.length === 0;
  player.hand.splice(cardIndex, 1);
  data.discard.push(card);
  data.clues = Math.min(HANABI_MAX_CLUES, data.clues + 1);
  draw(data, player);
  data.lastAction = `${player.displayName} discarded ${cardText(card)} and recovered a Hint Token.`;
  return { card, status: finishTurn(data, deckWasEmptyBeforeTurn) };
}

function rowToGame(row: StoredGame | undefined): HanabiGame | undefined {
  if (!row) return undefined;
  return {
    ...row,
    channelId: row.channelId ?? undefined,
    lobbyMessageId: row.lobbyMessageId ?? undefined,
    threadId: row.threadId ?? undefined,
    boardMessageId: row.boardMessageId ?? undefined,
    data: JSON.parse(row.dataJson) as HanabiState,
  };
}

export function createHanabiGame(database: Database.Database, game: Omit<HanabiGame, "createdAt" | "updatedAt">): void {
  const now = Date.now();
  database.prepare(`
    INSERT INTO hanabi_games (game_id, guild_id, host_user_id, channel_id, lobby_message_id, thread_id, board_message_id, state, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(game.gameId, game.guildId, game.hostUserId, game.channelId ?? null, game.lobbyMessageId ?? null, game.threadId ?? null, game.boardMessageId ?? null, game.state, JSON.stringify(game.data), now, now);
}

export function hanabiGame(database: Database.Database, gameId: string): HanabiGame | undefined {
  return rowToGame(database.prepare(`
    SELECT game_id AS gameId, guild_id AS guildId, host_user_id AS hostUserId, channel_id AS channelId, lobby_message_id AS lobbyMessageId,
      thread_id AS threadId, board_message_id AS boardMessageId, state, data_json AS dataJson, created_at AS createdAt, updated_at AS updatedAt
    FROM hanabi_games WHERE game_id = ?
  `).get(gameId) as StoredGame | undefined);
}

export function saveHanabiGame(database: Database.Database, game: HanabiGame): void {
  database.prepare(`
    UPDATE hanabi_games SET channel_id = ?, lobby_message_id = ?, thread_id = ?, board_message_id = ?, state = ?, data_json = ?, updated_at = ?
    WHERE game_id = ?
  `).run(game.channelId ?? null, game.lobbyMessageId ?? null, game.threadId ?? null, game.boardMessageId ?? null, game.state, JSON.stringify(game.data), Date.now(), game.gameId);
}

export function reserveHanabiGameNumber(database: Database.Database, guildId: string): number {
  return database.transaction(() => {
    database.prepare("INSERT INTO hanabi_guild_settings (guild_id, next_game_number) VALUES (?, 1) ON CONFLICT(guild_id) DO NOTHING").run(guildId);
    const settings = database.prepare("SELECT next_game_number AS nextGameNumber FROM hanabi_guild_settings WHERE guild_id = ?").get(guildId) as { nextGameNumber: number };
    database.prepare("UPDATE hanabi_guild_settings SET next_game_number = ? WHERE guild_id = ?").run(settings.nextGameNumber + 1, guildId);
    return settings.nextGameNumber;
  })();
}
