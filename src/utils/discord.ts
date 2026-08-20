import type { Message } from 'discord.js';

export function getSessionKey(message: Message): string {
  return [message.guildId ?? 'dm', message.channelId, message.author.id].join(':');
}

export function isAuthorized(message: Message, users: Set<string>): boolean {
  return users.has(message.author.id);
}

export function unwrapResponse(result: unknown): unknown {
  if (result && typeof result === 'object') {
    const value = result as Record<string, unknown>;
    if ('data' in value && value['data'] !== undefined) return value['data'];
  }
  return result;
}

export function extractText(data: unknown): string {
  if (typeof data === 'string') return data.trim();
  if (!data || typeof data !== 'object') return '';

  const value = data as Record<string, unknown>;
  const parts = value['parts'];

  if (Array.isArray(parts)) {
    const text = parts.map((part) => {
      if (!part || typeof part !== 'object') return '';
      const item = part as Record<string, unknown>;
      return item['type'] === 'text' && typeof item['text'] === 'string' ? item['text'] : '';
    }).filter(Boolean).join('\n').trim();
    if (text) return text;
  }

  if (typeof value['text'] === 'string') return value['text'].trim();
  if (typeof value['message'] === 'string') return value['message'].trim();
  if (value['data']) return extractText(value['data']);
  return '';
}

export async function sendLongMessage(message: Message, text: string): Promise<void> {
  const channel = message.channel;
  if (!channel.isSendable()) return;
  for (let i = 0; i < text.length; i += 1900) await channel.send(text.slice(i, i + 1900));
}
