import { randomInt } from "node:crypto";

export type ChanceResult = {
  percent: number;
  response: string;
};

export function responseForChance(percent: number): string {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError("Chance must be an integer from 0 to 100.");
  }

  if (percent === 0) return "Không. Vũ trụ từ chối.";
  if (percent <= 20) return "Khó xảy ra.";
  if (percent <= 40) return "Cũng có cửa.";
  if (percent <= 59) return "50/50... đại khái vậy.";
  if (percent <= 79) return "Khả năng khá cao 👀";
  if (percent <= 99) return "Chuẩn bị tinh thần đi 💀";
  return "Không chạy được đâu.";
}

export function rollChance(): ChanceResult {
  const percent = randomInt(0, 101);
  return { percent, response: responseForChance(percent) };
}
