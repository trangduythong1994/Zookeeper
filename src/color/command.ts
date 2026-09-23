const HEX_COLOR = /^#([0-9a-f]{6})$/i;

export function normalizeHexColor(value: string): string | undefined {
  const match = HEX_COLOR.exec(value.trim());
  return match ? `#${match[1].toUpperCase()}` : undefined;
}

export function isColorRoleName(name: string): boolean {
  return HEX_COLOR.test(name);
}

export function colorInteger(hex: string): number {
  const normalized = normalizeHexColor(hex);
  if (!normalized) throw new RangeError("Color must be a six-digit hexadecimal value.");

  return Number.parseInt(normalized.slice(1), 16);
}
