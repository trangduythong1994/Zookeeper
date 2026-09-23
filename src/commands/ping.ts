import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

export const pingCommand: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check whether the bot is online."),
  async execute(interaction): Promise<void> {
    await interaction.reply("Pong!");
  },
};
