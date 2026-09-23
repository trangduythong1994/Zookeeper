export function speechTextForMessage(displayName: string, content: string): string | undefined {
  if (!content.startsWith("-s")) return undefined;

  const message = content.slice(2).trim();
  if (!message) return undefined;

  return `User ${displayName} nói rằng ${message}`;
}
