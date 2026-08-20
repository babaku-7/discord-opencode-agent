import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  Message,
} from 'discord.js';

import { OpenCodeClient } from './opencode/client.js';

const DISCORD_BOT_TOKEN = process.env['DISCORD_BOT_TOKEN'];

if (!DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKEN is required');
}

const allowedUsers = new Set(
  (process.env['ALLOWED_USER_IDS'] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

if (allowedUsers.size === 0) {
  throw new Error(
    'ALLOWED_USER_IDS is required. Add at least one Discord user ID.',
  );
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

function isAuthorized(message: Message): boolean {
  return allowedUsers.has(message.author.id);
}

function getSessionKey(message: Message): string {
  return [
    message.guildId ?? 'dm',
    message.channelId,
    message.author.id,
  ].join(':');
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

  for (let offset = 0; offset < text.length; offset += limit) {
    await channel.send(text.slice(offset, offset + limit));
  }
}

async function handleCodeCommand(
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
      '⏳ Task sebelumnya masih berjalan. Gunakan `!abort`.',
    );
    return;
  }

  running.add(key);

  try {
    await channel.sendTyping();

    let sessionId = sessions.get(key);

    if (!sessionId) {
      console.log(
        `[OpenCode] Creating session for ${message.author.tag}`,
      );

      const result = await openCode.createSession(
        `Discord - ${message.author.username}`,
      );

      sessionId = result.data?.id;

      if (!sessionId) {
        throw new Error(
          'OpenCode tidak mengembalikan session ID.',
        );
      }

      sessions.set(key, sessionId);

      console.log(`[OpenCode] Session: ${sessionId}`);
    }

    console.log(
      `[OpenCode] ${message.author.tag}: ${prompt}`,
    );

    const result = await openCode.sendPrompt(
      sessionId,
      prompt,
    );

    const text = extractText(result.data);

    if (!text) {
      await channel.send(
        '⚠️ OpenCode selesai tetapi tidak menghasilkan output teks.',
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
      `❌ OpenCode error:\n\`\`\`\n${errorMessage.slice(
        0,
        1800,
      )}\n\`\`\``,
    );
  } finally {
    running.delete(key);
  }
}

async function handleStatusCommand(
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

async function handleResetCommand(
  message: Message,
): Promise<void> {
  const key = getSessionKey(message);

  sessions.delete(key);
  running.delete(key);

  await message.reply(
    '🧹 Session di-reset. Request berikutnya akan menggunakan session baru.',
  );
}

async function handleAbortCommand(
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
      '🛑 Request OpenCode dihentikan.',
    );
  } catch (error) {
    console.error('[Abort Error]', error);

    await message.reply(
      '❌ Gagal menghentikan request OpenCode.',
    );
  }
}

async function handleHelpCommand(
  message: Message,
): Promise<void> {
  await message.reply(
    [
      '**Discord OpenCode Agent**',
      '',
      '`!code <task>` — kirim task ke agent',
      '`!status` — status session',
      '`!reset` — reset session',
      '`!abort` — hentikan task',
      '`!help` — tampilkan bantuan',
    ].join('\n'),
  );
}

client.once('ready', () => {
  console.log(
    `[Discord] Logged in as ${client.user?.tag}`,
  );

  console.log(
    `[OpenCode] ${
      process.env['OPENCODE_URL'] ||
      'http://127.0.0.1:4096'
    }`,
  );

  console.log(
    `[Workspace] ${openCode.getWorkspace()}`,
  );

  console.log(
    `[Security] ${allowedUsers.size} authorized user(s)`,
  );

  console.log('[Agent] Ready.');
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) {
      return;
    }

    if (!message.content.startsWith('!')) {
      return;
    }

    if (!isAuthorized(message)) {
      await message.reply(
        '⛔ Kamu tidak memiliki izin menggunakan coding agent.',
      );
      return;
    }

    const content = message.content.trim();
    const spaceIndex = content.indexOf(' ');

    const command = (
      spaceIndex === -1
        ? content.slice(1)
        : content.slice(1, spaceIndex)
    ).toLowerCase();

    const args =
      spaceIndex === -1
        ? ''
        : content.slice(spaceIndex + 1).trim();

    switch (command) {
      case 'code':
        if (!args) {
          await message.reply(
            'Gunakan: `!code <task>`',
          );
          return;
        }

        await handleCodeCommand(message, args);
        break;

      case 'status':
        await handleStatusCommand(message);
        break;

      case 'reset':
        await handleResetCommand(message);
        break;

      case 'abort':
        await handleAbortCommand(message);
        break;

      case 'help':
        await handleHelpCommand(message);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error(
      '[Discord Handler Error]',
      error,
    );
  }
});

process.on('unhandledRejection', (error) => {
  console.error('[Unhandled Rejection]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
});

client.login(DISCORD_BOT_TOKEN);