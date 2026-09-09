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

function splitTextBlock(block: string, maxLength: number): string[] {
  const paragraphs = block.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const flushCurrent = (): void => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
  };

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const candidate = current ? `${current}\n\n${trimmed}` : trimmed;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) flushCurrent();

    const lines = trimmed.split('\n');
    for (const line of lines) {
      const next = current ? `${current}\n${line}` : line;
      if (next.length <= maxLength) {
        current = next;
        continue;
      }

      if (current) flushCurrent();

      let segment = line;
      while (segment.length > maxLength) {
        const cut = segment.slice(0, maxLength).lastIndexOf(' ');
        const splitAt = cut > 0 ? cut : maxLength;
        chunks.push(segment.slice(0, splitAt).trim());
        segment = segment.slice(splitAt).trimStart();
      }

      if (segment.trim()) current = segment.trim();
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function splitCodeFenceBlock(language: string, lines: string[], maxLength: number): string[] {
  const opener = `\`\`\`${language ? `${language}` : ''}\n`;
  const closer = '```';
  const chunks: string[] = [];
  let current = opener;

  const flushCurrent = (): void => {
    if (current !== opener) {
      chunks.push(`${current}${closer}`);
      current = opener;
    }
  };

  const splitLongLine = (line: string): void => {
    const contentLimit = Math.max(1, maxLength - opener.length - closer.length - 1);
    let segment = line;
    while (segment.length > contentLimit) {
      const piece = segment.slice(0, contentLimit);
      chunks.push(`${opener}${piece}\n${closer}`);
      segment = segment.slice(contentLimit);
    }
    if (segment.length > 0) {
      current = `${current}${segment}\n`;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine ?? '';
    const candidate = `${current}${line}\n`;
    if (candidate.length + closer.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current !== opener) {
      flushCurrent();
    }

    const contentLimit = Math.max(1, maxLength - opener.length - closer.length - 1);
    if (line.length > contentLimit) {
      splitLongLine(line);
      continue;
    }

    current = `${opener}${line}\n`;
  }

  if (current !== opener) {
    chunks.push(`${current}${closer}`);
  } else if (lines.length === 0) {
    chunks.push(`${opener}${closer}`);
  }

  return chunks.filter(Boolean);
}

export function splitLongText(text: string, maxLength = 1800): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? '';

    if (/^```/.test(line.trim())) {
      const languageMatch = line.trim().match(/^```(.*)$/);
      const language = languageMatch?.[1]?.trim() ?? '';
      const codeLines: string[] = [];
      i += 1;

      while (i < lines.length) {
        const currentLine = lines[i] ?? '';
        if (/^```/.test(currentLine.trim())) break;
        codeLines.push(currentLine);
        i += 1;
      }

      if (i < lines.length && /^```/.test((lines[i] ?? '').trim())) {
        i += 1;
      }

      chunks.push(...splitCodeFenceBlock(language, codeLines, maxLength));
      continue;
    }

    const textLines: string[] = [];
    while (i < lines.length) {
      const currentLine = lines[i] ?? '';
      if (/^```/.test(currentLine.trim())) break;
      textLines.push(currentLine);
      i += 1;
    }

    const block = textLines.join('\n');
    chunks.push(...splitTextBlock(block, maxLength));
  }

  return chunks.filter((chunk) => chunk.length <= maxLength && chunk.trim().length > 0);
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
