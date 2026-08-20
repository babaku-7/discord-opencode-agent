import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  Message,
} from 'discord.js';

import { OpenCodeClient } from './opencode/client.js';

const DISCORD_BOT_TOKEN =
  process.env['DISCORD_BOT_TOKEN'];

if (!DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKEN is required');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openCode = new OpenCodeClient();

const sessions = new Map<string, string>();
const running = new Set<string>();

function getSessionKey(message: Message): string {
  return `${message.guildId ?? 'dm'}:${message.channelId}:${message.author.id}`;
}

function extractText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return '';
  }

  const value = data as Record<string, unknown>;
  const parts = value['parts'];

  if (Array.isArray(parts)) {
    const text = parts
      .filter(
        (part): part is { type: 'text'; text: string } =>
          typeof part === 'object' &&
          part !== null &&
          (part as Record<string, unknown>)['type'] === 'text' &&
          typeof (part as Record<string, unknown>)['text'] === 'string',
      )
      .map((part) => part.text)
      .join('\n');

    if (text) {
      return text;
    }
  }

  if (typeof value['text'] === 'string') {
    return value['text'];
  }

  if (typeof value['message'] === 'string') {
    return value['message'];
  }

  return '';
}

async function sendLongMessage(
  message: Message,
  text: string,
): Promise<void> {
  const channel = message.channel;

  if (!channel.isSendable()) {
    return;
  }

  const limit = 1900;

  for (let i = 0; i < text.length; i += limit) {
    await channel.send(text.slice(i, i + limit));
  }
}

async function handleCode(
  message: Message,
  prompt: string,
): Promise<void> {
  const key = getSessionKey(message);
  const channel = message.channel;

  if (!channel.isSendable()) {
    return;
  }

  if (running.has(key)) {
    await channel.send(
      '⏳ Task masih berjalan. Gunakan `!abort` untuk menghentikannya.',
    );
    return;
  }

  running.add(key);

  try {
    await channel.sendTyping();

    let sessionId = sessions.get(key);

    if (!sessionId) {
      const result = await openCode.createSession(
        `Discord - ${message.author.username}`,
      );

      sessionId = result.data?.id;

      if (!sessionId) {
        throw new Error('OpenCode tidak mengembalikan session ID');
      }

      sessions.set(key, sessionId);

      console.log(`[OpenCode] Session: ${sessionId}`);
    }

    console.log(`[OpenCode] Task: ${prompt}`);

    const result = await openCode.sendPrompt(
      sessionId,
      prompt,
    );

    const text = extractText(result.data);

    if (!text) {
      await channel.send(
        '⚠️ OpenCode selesai tetapi tidak menghasilkan teks.',
      );
      return;
    }

    await sendLongMessage(message, text);
  } catch (error) {
    console.error('[OpenCode Error]', error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    await channel.send(
      `❌ Error:\n\`\`\`\n${errorMessage.slice(0, 1800)}\n\`\`\``,
    );
  } finally {
    running.delete(key);
  }
}

async function handleStatus(
  message: Message,
): Promise<void> {
  const key = getSessionKey(message);
  const sessionId = sessions.get(key);

  await message.reply(
    [
      '**Agent Status**',
      '',
      `Status: ${sessionId ? '🟢 Active' : '⚪ No session'}`,
      `Session: \`${sessionId ?? 'none'}\``,
      `Running: \`${running.has(key)}\``,
      `Workspace: \`${openCode.getWorkspace()}\``,
      'Model: `cohere/north-mini-code-1-0`',
    ].join('\n'),
  );
}

async function handleReset(
  message: Message,
): Promise<void> {
  const key = getSessionKey(message);

  sessions.delete(key);
  running.delete(key);

  await message.reply(
    '🧹 Session di-reset. Request berikutnya akan membuat session baru.',
  );
}

async function handleAbort(
  message: Message,
): Promise<void> {
  const key = getSessionKey(message);
  const sessionId = sessions.get(key);

  if (!sessionId) {
    await message.reply('Tidak ada session aktif.');
    return;
  }

  try {
    await openCode.abortSession(sessionId);
    running.delete(key);

    await message.reply(
      '🛑 OpenCode session dihentikan.',
    );
  } catch (error) {
    console.error('[Abort Error]', error);

    await message.reply(
      '❌ Gagal menghentikan session.',
    );
  }
}

async function handleHelp(
  message: Message,
): Promise<void> {
  await message.reply(
    [
      '**Discord OpenCode Agent**',
      '',
      '`!code <task>` — kirim task ke AI',
      '`!status` — status session',
      '`!reset` — reset session',
      '`!abort` — hentikan task',
      '`!help` — bantuan',
    ].join('\n'),
  );
}

client.once('ready', () => {
  console.log(
    `[Discord] Logged in as ${client.user?.tag}`,
  );

  console.log(
    `[OpenCode] ${process.env['OPENCODE_URL'] || 'http://127.0.0.1:4096'}`,
  );

  console.log(
    `[Workspace] ${openCode.getWorkspace()}`,
  );

  console.log('[Agent] Ready.');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) {
    return;
  }

  const content = message.content.trim();

  if (!content.startsWith('!')) {
    return;
  }

  const space = content.indexOf(' ');

  const command = (
    space === -1
      ? content.slice(1)
      : content.slice(1, space)
  ).toLowerCase();

  const args =
    space === -1
      ? ''
      : content.slice(space + 1).trim();

  switch (command) {
    case 'code':
      if (!args) {
        await message.reply(
          'Gunakan: `!code <task>`',
        );
        return;
      }

      await handleCode(message, args);
      break;

    case 'status':
      await handleStatus(message);
      break;

    case 'reset':
      await handleReset(message);
      break;

    case 'abort':
      await handleAbort(message);
      break;

    case 'help':
      await handleHelp(message);
      break;
  }
});

process.on('unhandledRejection', (error) => {
  console.error('[Unhandled Rejection]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
});

client.login(DISCORD_BOT_TOKEN);