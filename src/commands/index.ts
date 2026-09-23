import type { Command } from "./types.js";
import { pingCommand } from "./ping.js";

export const commands: readonly Command[] = [pingCommand];

export const commandsByName = new Map(commands.map((command) => [command.data.name, command]));
