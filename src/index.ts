import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  Message,
} from 'discord.js';

import {
  OpenCodeClient,
  type AgentModel,
  MODELS,
} from './opencode/client.js';

const DISCORD_BOT_TOKEN =
  process.env['DISCORD_BOT_TOKEN'];

if (!DISCORD_BOT_TOKEN) {
  throw new Error(
    'DISCORD_BOT_TOKEN environment variable is required',
  );
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

/**
 * OpenCode session per:
 *
 * guildId:channelId:userId
 */
const sessions = new Map<string, string>();

/**
 * Prevent the same user/channel from
 * running multiple tasks simultaneously.
 */
const running = new Set<string>();

/**
 * Selected model per user/channel.
 *
 * Default: Cohere.
 */
const selectedModels = new Map<
  string,
  AgentModel
>();

function isAuthorized(
  message: Message,
): boolean {
  return allowedUsers.has(
    message.author.id,
  );
}

function getSessionKey(
  message: Message,
): string {
  return [
    message.guildId ?? 'dm',
    message.channelId,
    message.author.id,
  ].join(':');
}

/**
 * Extract text from different OpenCode
 * response shapes.
 */
function extractText(
  data: unknown,
): string {
  if (typeof data === 'string') {
    return data.trim();
  }

  if (!data || typeof data !== 'object') {
    return '';
  }

  const value =
    data as Record<string, unknown>;

  /*
   * Standard OpenCode message response:
   *
   * {
   *   info: {...},
   *   parts: [...]
   * }
   */
  const parts = value['parts'];

  if (Array.isArray(parts)) {
    const text = parts
      .filter(
        (part) =>
          typeof part === 'object' &&
          part !== null,
      )
      .map((part) => {
        const item =
          part as Record<string, unknown>;

        if (
          item['type'] === 'text' &&
          typeof item['text'] === 'string'
        ) {
          return item['text'];
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();

    if (text) {
      return text;
    }
  }

  /*
   * Direct text response.
   */
  if (typeof value['text'] === 'string') {
    return value['text'].trim();
  }

  /*
   * Some response wrappers.
   */
  if (
    typeof value['message'] === 'string'
  ) {
    return value['message'].trim();
  }

  /*
   * Try nested data.
   */
  if (value['data']) {
    return extractText(value['data']);
  }

  return '';
}

/**
 * Safely unwrap SDK response.
 *
 * Supports:
 *
 * result.data
 *
 * and:
 *
 * result
 */
function unwrapResponse(
  result: unknown,
): unknown {
  if (
    result &&
    typeof result === 'object'
  ) {
    const value =
      result as Record<string, unknown>;

    if (
      'data' in value &&
      value['data'] !== undefined
    ) {
      return value['data'];
    }
  }

  return result;
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

  if (text.length <= limit) {
    await channel.send(text);
    return;
  }

  for (
    let offset = 0;
    offset < text.length;
    offset += limit
  ) {
    await channel.send(
      text.slice(
        offset,
        offset + limit,
      ),
    );
  }
}

async function handleCodeCommand(
  message: Message,
  prompt: string,
): Promise<void> {
  const key =
    getSessionKey(message);

  const channel =
    message.channel;

  if (!channel.isSendable()) {
    return;
  }

  if (running.has(key)) {
    await channel.send(
      '⏳ Task sebelumnya masih berjalan. Gunakan `!abort` untuk menghentikannya.',
    );
    return;
  }

  running.add(key);

  try {
    await channel.sendTyping();

    let sessionId =
      sessions.get(key);

    /*
     * Create session if needed.
     */
    if (!sessionId) {
      console.log(
        `[OpenCode] Creating session for ${message.author.tag}`,
      );

      const sessionResult =
        await openCode.createSession(
          `Discord - ${message.author.username}`,
        );

      const sessionData =
        unwrapResponse(
          sessionResult,
        ) as
          | Record<string, unknown>
          | undefined;

      sessionId =
        typeof sessionData?.['id'] ===
        'string'
          ? sessionData['id']
          : undefined;

      if (!sessionId) {
        console.error(
          '[OpenCode] Invalid session response:',
          JSON.stringify(
            sessionResult,
            null,
            2,
          ),
        );

        throw new Error(
          'OpenCode tidak mengembalikan session ID.',
        );
      }

      sessions.set(
        key,
        sessionId,
      );

      console.log(
        `[OpenCode] Session created: ${sessionId}`,
      );
    }

    const selectedModel =
      selectedModels.get(key) ??
      'cohere';

    const model =
      MODELS[selectedModel];

    console.log(
      `[OpenCode] User: ${message.author.tag}`,
    );

    console.log(
      `[OpenCode] Session: ${sessionId}`,
    );

    console.log(
      `[OpenCode] Model: ${model.providerID}/${model.modelID}`,
    );

    console.log(
      `[OpenCode] Prompt: ${prompt}`,
    );

    /*
     * Send prompt to OpenCode.
     */
    const result =
      await openCode.sendPrompt(
        sessionId,
        prompt,
        selectedModel,
      );

    /*
     * IMPORTANT:
     *
     * Depending on the SDK response shape,
     * the actual payload may be:
     *
     * result.data
     *
     * or:
     *
     * result
     */
    const responseData =
      unwrapResponse(result);

    console.log(
      '[OpenCode] Response received.',
    );

    const text =
      extractText(responseData);

    /*
     * OpenCode may return no text when the
     * actual task is performed through tools.
     *
     * In that case, don't incorrectly report
     * an API failure.
     */
    if (!text) {
      console.log(
        '[OpenCode] No text response.',
      );

      console.log(
        '[OpenCode] Raw response:',
        JSON.stringify(
          responseData,
          null,
          2,
        ),
      );

      await channel.send(
        [
          '✅ OpenCode selesai.',
          '',
          `Model: \`${model.providerID}/${model.modelID}\``,
          `Session: \`${sessionId}\``,
          '',
          'Tidak ada output teks dari OpenCode.',
          'Jika task berupa pembuatan/edit file, cek workspace untuk melihat hasilnya.',
        ].join('\n'),
      );

      return;
    }

    console.log(
      `[OpenCode] Response length: ${text.length}`,
    );

    await sendLongMessage(
      message,
      text,
    );
  } catch (error) {
    console.error(
      '[OpenCode Error]',
      error,
    );

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

async function handleModelCommand(
  message: Message,
  modelName: string,
): Promise<void> {
  const key =
    getSessionKey(message);

  /*
   * !model
   *
   * Show current model.
   */
  if (!modelName) {
    const current =
      selectedModels.get(key) ??
      'cohere';

    const model =
      MODELS[current];

    await message.reply(
      [
        '**🤖 Current Agent Model**',
        '',
        `Provider: \`${model.providerID}\``,
        `Model: \`${model.modelID}\``,
        `Name: **${model.label}**`,
        '',
        '**Available models:**',
        '`!model cohere`',
        '`!model gemini`',
      ].join('\n'),
    );

    return;
  }

  const normalized =
    modelName.toLowerCase();

  if (
    normalized !== 'cohere' &&
    normalized !== 'gemini'
  ) {
    await message.reply(
      [
        '❌ Model tidak tersedia.',
        '',
        '**Available:**',
        '`!model cohere`',
        '`!model gemini`',
      ].join('\n'),
    );

    return;
  }

  const selected =
    normalized as AgentModel;

  selectedModels.set(
    key,
    selected,
  );

  const model =
    MODELS[selected];

  await message.reply(
    [
      '✅ **Model berhasil diganti**',
      '',
      `Provider: \`${model.providerID}\``,
      `Model: \`${model.modelID}\``,
      `Name: **${model.label}**`,
    ].join('\n'),
  );

  console.log(
    `[Model] ${message.author.tag} → ${model.providerID}/${model.modelID}`,
  );
}

async function handleStatusCommand(
  message: Message,
): Promise<void> {
  const key =
    getSessionKey(message);

  const sessionId =
    sessions.get(key);

  const selectedModel =
    selectedModels.get(key) ??
    'cohere';

  const model =
    MODELS[selectedModel];

  await message.reply(
    [
      '**🤖 Agent Status**',
      '',
      `Status: ${
        sessionId
          ? '🟢 Session active'
          : '⚪ No session'
      }`,
      `Session: \`${sessionId ?? 'none'}\``,
      `Running: \`${running.has(key)}\``,
      '',
      `Provider: \`${model.providerID}\``,
      `Model: \`${model.modelID}\``,
      `Name: **${model.label}**`,
      '',
      `Workspace: \`${openCode.getWorkspace()}\``,
    ].join('\n'),
  );
}

async function handleResetCommand(
  message: Message,
): Promise<void> {
  const key =
    getSessionKey(message);

  if (running.has(key)) {
    await message.reply(
      '⚠️ Task masih berjalan. Gunakan `!abort` terlebih dahulu.',
    );
    return;
  }

  sessions.delete(key);

  await message.reply(
    '🧹 Session OpenCode di-reset. Request berikutnya akan menggunakan session baru.',
  );
}

async function handleAbortCommand(
  message: Message,
): Promise<void> {
  const key =
    getSessionKey(message);

  const sessionId =
    sessions.get(key);

  if (!sessionId) {
    await message.reply(
      '⚪ Tidak ada session aktif.',
    );
    return;
  }

  if (!running.has(key)) {
    await message.reply(
      '⚪ Tidak ada task yang sedang berjalan.',
    );
    return;
  }

  try {
    await openCode.abortSession(
      sessionId,
    );

    running.delete(key);

    await message.reply(
      '🛑 Request OpenCode dihentikan.',
    );
  } catch (error) {
    console.error(
      '[OpenCode Abort Error]',
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    await message.reply(
      `❌ Gagal menghentikan request:\n\`${errorMessage.slice(
        0,
        1000,
      )}\``,
    );
  }
}

async function handleHelpCommand(
  message: Message,
): Promise<void> {
  await message.reply(
    [
      '**🤖 Discord OpenCode Agent**',
      '',
      '**Coding**',
      '`!code <task>` — kirim task ke agent',
      '`!abort` — hentikan task aktif',
      '',
      '**Session**',
      '`!status` — lihat status agent',
      '`!reset` — reset session',
      '',
      '**Model**',
      '`!model` — lihat model aktif',
      '`!model cohere` — gunakan Cohere',
      '`!model gemini` — gunakan Gemini 3.1 Flash-Lite',
      '',
      '**Other**',
      '`!help` — tampilkan bantuan',
    ].join('\n'),
  );
}

client.once(
  'ready',
  () => {
    console.log(
      `[Discord] Logged in as ${client.user?.tag}`,
    );

    console.log(
      `[OpenCode] URL: ${
        process.env['OPENCODE_URL'] ??
        'http://127.0.0.1:4096'
      }`,
    );

    console.log(
      `[Workspace] ${openCode.getWorkspace()}`,
    );

    console.log(
      `[Security] ${allowedUsers.size} authorized user(s)`,
    );

    console.log(
      '[Models] Cohere North Mini Code + Google Gemini 3.1 Flash-Lite',
    );

    console.log(
      '[Agent] Ready.',
    );
  },
);

client.on(
  'messageCreate',
  async (message) => {
    try {
      if (message.author.bot) {
        return;
      }

      const content =
        message.content.trim();

      if (!content.startsWith('!')) {
        return;
      }

      /*
       * Authorization check.
       */
      if (!isAuthorized(message)) {
        await message.reply(
          '⛔ Kamu tidak memiliki izin menggunakan coding agent.',
        );

        console.log(
          `[Security] Unauthorized user: ${message.author.tag} (${message.author.id})`,
        );

        return;
      }

      const spaceIndex =
        content.indexOf(' ');

      const command =
        (
          spaceIndex === -1
            ? content.slice(1)
            : content.slice(
                1,
                spaceIndex,
              )
        ).toLowerCase();

      const args =
        spaceIndex === -1
          ? ''
          : content
              .slice(
                spaceIndex + 1,
              )
              .trim();

      switch (command) {
        case 'code':
          if (!args) {
            await message.reply(
              'Gunakan: `!code <task>`',
            );
            return;
          }

          await handleCodeCommand(
            message,
            args,
          );
          break;

        case 'model':
          await handleModelCommand(
            message,
            args,
          );
          break;

        case 'status':
          await handleStatusCommand(
            message,
          );
          break;

        case 'reset':
          await handleResetCommand(
            message,
          );
          break;

        case 'abort':
          await handleAbortCommand(
            message,
          );
          break;

        case 'help':
          await handleHelpCommand(
            message,
          );
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
  },
);

process.on(
  'unhandledRejection',
  (error) => {
    console.error(
      '[Unhandled Rejection]',
      error,
    );
  },
);

process.on(
  'uncaughtException',
  (error) => {
    console.error(
      '[Uncaught Exception]',
      error,
    );
  },
);

client.login(
  DISCORD_BOT_TOKEN,
);