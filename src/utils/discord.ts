import type { APIMessageTopLevelComponent, Message } from 'discord.js';
import { MessageFlags, SeparatorSpacingSize } from 'discord.js';
import { ContainerBuilder, SeparatorBuilder, TextDisplayBuilder } from '@discordjs/builders';
import type { JSONEncodable } from '@discordjs/util';

export function getSessionKeyFromContext(context: { guildId: string | null; channelId: string; author: { id: string } }): string {
  return [context.guildId ?? 'dm', context.channelId, context.author.id].join(':');
}

export function getSessionKey(message: Message): string {
  return getSessionKeyFromContext({ guildId: message.guildId, channelId: message.channelId, author: message.author });
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
    const text = parts
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const item = part as Record<string, unknown>;
        return item['type'] === 'text' && typeof item['text'] === 'string' ? item['text'] : '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) return text;
  }

  if (typeof value['text'] === 'string') return value['text'].trim();
  if (typeof value['message'] === 'string') return value['message'].trim();
  if (value['data']) return extractText(value['data']);
  return '';
}

function normalizeTitle(title: string): string {
  return title.replace(/^#+\s*/, '').trim();
}

export function buildAgentContainer({
  title = 'OpenCode',
  content = '',
  status,
  model,
  session,
  tool,
}: {
  title?: string;
  content?: string;
  status?: string;
  model?: string;
  session?: string;
  tool?: string;
}): ContainerBuilder {
  const cleanedTitle = normalizeTitle(title);
  const body = content.trim();
  const metadata: string[] = [];

  if (status) metadata.push(`Status: ${status}`);
  if (model) metadata.push(`Model: ${model}`);
  if (session) metadata.push(`Session: ${session}`);
  if (tool) metadata.push(`Tool: ${tool}`);

  const container = new ContainerBuilder().setAccentColor(0x5865f2);

  if (cleanedTitle && cleanedTitle !== 'OpenCode') {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(cleanedTitle));
  }

  if (body) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  }

  if (metadata.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(metadata.join(' • ')));
  }

  return container;
}

export function splitLongText(text: string, maxLength = 1800): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current.trim());
      current = '';
    }

    const lines = paragraph.split('\n');
    for (const line of lines) {
      const next = current ? `${current}\n${line}` : line;
      if (next.length <= maxLength) {
        current = next;
        continue;
      }

      if (current) {
        chunks.push(current.trim());
        current = '';
      }

      let segment = line;
      while (segment.length > maxLength) {
        const cut = segment.slice(0, maxLength).lastIndexOf(' ');
        const splitAt = cut > 0 ? cut : maxLength;
        chunks.push(segment.slice(0, splitAt).trim());
        segment = segment.slice(splitAt).trimStart();
      }

      current = segment;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(Boolean);
}

export function componentsV2Payload<const T extends JSONEncodable<APIMessageTopLevelComponent>>(
  components: readonly T[],
): {
  components: readonly T[];
  flags: MessageFlags.IsComponentsV2;
} {
  return { components, flags: MessageFlags.IsComponentsV2 };
}

export async function sendLongMessage(
  target: { channel: { isSendable(): boolean; send: (...args: unknown[]) => Promise<unknown> } },
  text: string,
): Promise<void> {
  const channel = target.channel;
  if (!channel.isSendable()) return;

  const safeText = text.trim();
  if (!safeText) return;

  const chunks = splitLongText(safeText, 1800);

  for (const chunk of chunks) {
    const payload = componentsV2Payload([
      buildAgentContainer({
        title: '## OpenCode Agent',
        content: chunk,
        status: 'Completed',
      }),
    ]);

    await channel.send(payload);
  }
}
