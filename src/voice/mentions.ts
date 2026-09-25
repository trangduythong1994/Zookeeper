const USER_MENTION_PATTERN = /<@!?(\d+)>/gu;

export function replaceUserMentionsForSpeech(content: string, displayNameForUserId: (userId: string) => string | undefined): string {
  return content.replace(USER_MENTION_PATTERN, (_match, userId: string) => displayNameForUserId(userId) ?? "một người dùng");
}
