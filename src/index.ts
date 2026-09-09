import { ActionRowBuilder, ApplicationCommandOptionType, Client, GatewayIntentBits, ModalBuilder, REST, Routes, TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction } from 'discord.js';
import { MODELS } from './models.js';
import { config } from './config.js';
import { OpenCodeClient } from './opencode/client.js';
import { handleCodeCommand } from './commands/code.js';
import { handleModelCommand } from './commands/model.js';
import { handleStatusCommand } from './commands/status.js';
import { handleAbortCommand, handleResetCommand, handleSessionCommand } from './commands/session.js';
import { handleHelpCommand } from './commands/help.js';
import { buildAgentContainer, componentsV2Payload, getSessionKey, isAuthorized } from './utils/discord.js';
import { DEFAULT_MODEL, running, selectedModels, sessions } from './state.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const openCode = new OpenCodeClient();

const slashCommands = [
  {
    name: 'code',
    description: 'Jalankan request ke OpenCode',
    options: [{ name: 'prompt', description: 'Task yang akan dikerjakan OpenCode', type: ApplicationCommandOptionType.String, required: true }],
  },
  {
    name: 'model',
    description: 'Lihat atau ganti model yang aktif',
    options: [{ name: 'name', description: 'Nama model', type: ApplicationCommandOptionType.String, required: false }],
  },
  { name: 'status', description: 'Lihat status agent dan session' },
  { name: 'session', description: 'Lihat informasi session aktif' },
  { name: 'reset', description: 'Reset session OpenCode' },
  { name: 'abort', description: 'Batalkan request aktif' },
  { name: 'help', description: 'Tampilkan bantuan command' },
] as const;

async function replyUnauthorized(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: 'OpenCode',
        content: 'Anda tidak memiliki izin untuk menggunakan coding agent.',
        status: 'Unauthorized',
      }),
    ]),
  );
}

async function handleSlashCode(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  const key = getSessionKey({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: { id: interaction.user.id },
  } as never);

  if (running.has(key)) {
    await interaction.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: 'OpenCode',
          content: 'Task sebelumnya masih berjalan. Gunakan `/abort` untuk menghentikannya.',
          status: 'Working',
        }),
      ]),
    );
    return;
  }

  await interaction.deferReply();

  await handleCodeCommand(
    {
      channel: interaction.channel,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      author: interaction.user,
      reply: interaction.editReply.bind(interaction),
      edit: interaction.editReply.bind(interaction),
    } as never,
    prompt,
    openCode,
  );
}

async function handleSlashModel(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name')?.toLowerCase();
  const key = getSessionKey({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: { id: interaction.user.id },
  } as never);

  if (!name) {
    const current = selectedModels.get(key) ?? DEFAULT_MODEL;
    const model = MODELS[current];
    const available = Object.entries(MODELS)
      .map(([id, entry]) => `- ${id}: ${entry.providerID}/${entry.modelID}`)
      .join('\n');

    await interaction.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## Model',
          content: ['Model aktif:', `\`${model.providerID}/${model.modelID}\``, '', 'Available models:', available].join('\n'),
          status: 'Ready',
        }),
      ]),
    );
    return;
  }

  if (name !== 'cohere' && name !== 'gemini') {
    await interaction.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## Model',
          content: 'Model tidak tersedia. Gunakan `/model cohere` atau `/model gemini`.',
          status: 'Failed',
        }),
      ]),
    );
    return;
  }

  selectedModels.set(key, name as keyof typeof MODELS);
  const model = MODELS[name as keyof typeof MODELS];

  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Model',
        content: ['Model berhasil diubah.', `Provider: \`${model.providerID}\``, `Model: \`${model.modelID}\``].join('\n'),
        status: 'Ready',
        model: `${model.providerID}/${model.modelID}`,
      }),
    ]),
  );
}

async function handleSlashStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const key = getSessionKey({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: { id: interaction.user.id },
  } as never);

  const sessionId = sessions.get(key);
  const selected = selectedModels.get(key) ?? DEFAULT_MODEL;
  const model = MODELS[selected];

  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Agent Status',
        content: [
          `Status: ${sessionId ? 'Online' : 'Offline'}`,
          `OpenCode: ${running.has(key) ? 'Busy' : 'Connected'}`,
        ].join('\n'),
        status: running.has(key) ? 'Working' : 'Ready',
        model: `${model.providerID}/${model.modelID}`,
        session: sessionId ?? 'none',
      }),
    ]),
  );
}

async function handleSlashSession(interaction: ChatInputCommandInteraction): Promise<void> {
  const key = getSessionKey({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: { id: interaction.user.id },
  } as never);

  const sessionId = sessions.get(key);

  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Session',
        content: sessionId ? 'Status: Active' : 'Status: Inactive',
        status: sessionId ? 'Active' : 'Inactive',
        session: sessionId ?? 'none',
      }),
    ]),
  );
}

async function handleSlashReset(interaction: ChatInputCommandInteraction): Promise<void> {
  const key = getSessionKey({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: { id: interaction.user.id },
  } as never);

  if (running.has(key)) {
    await interaction.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## Session Reset',
          content: 'Task masih berjalan. Gunakan `/abort` terlebih dahulu.',
          status: 'Working',
        }),
      ]),
    );
    return;
  }

  sessions.delete(key);

  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Session Reset',
        content: 'Session berhasil di-reset.',
        status: 'Ready',
      }),
    ]),
  );
}

async function handleSlashAbort(interaction: ChatInputCommandInteraction): Promise<void> {
  const key = getSessionKey({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: { id: interaction.user.id },
  } as never);

  const sessionId = sessions.get(key);

  if (!sessionId || !running.has(key)) {
    await interaction.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## OpenCode Agent',
          content: 'Tidak ada request aktif untuk dibatalkan.',
          status: 'Idle',
        }),
      ]),
    );
    return;
  }

  try {
    await openCode.abortSession(sessionId);
  } catch (error) {
    console.error('[OpenCode Abort Error]', error);
  }

  running.delete(key);

  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## OpenCode Agent',
        content: 'Request dibatalkan.',
        status: 'Aborted',
        session: sessionId,
      }),
    ]),
  );
}

async function handleSlashHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## OpenCode Agent',
        content: [
          'Available commands:',
          '',
          '`/code <prompt>` — Menjalankan request ke OpenCode.',
          '`/model` — Melihat model aktif.',
          '`/status` — Melihat status agent.',
          '`/session` — Melihat session aktif.',
          '`/reset` — Reset session.',
          '`/abort` — Membatalkan request aktif.',
          '`/help` — Menampilkan bantuan.',
        ].join('\n'),
        status: 'Ready',
      }),
    ]),
  );
}

async function registerSlashCommands(): Promise<void> {
  if (!client.user) return;
  const rest = new REST({ version: '10' }).setToken(config.discordBotToken);

  if (config.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, config.discordGuildId), { body: slashCommands });
    console.log(`[Slash Commands] Registered to guild ${config.discordGuildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
  console.log('[Slash Commands] Registered globally. This can take up to 1 hour to appear in all servers.');
}

function buildReplyModal(customId: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('opencode_reply_prompt')
    .setLabel('Reply to OpenCode')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Tulis follow-up prompt...')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(4000);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Reply to OpenCode')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

client.once('clientReady', async () => {
  console.log(`[Discord] Logged in as ${client.user?.tag}`);
  console.log(`[OpenCode] URL: ${config.opencodeUrl}`);
  console.log(`[Workspace] ${config.workspace}`);
  console.log(`[Security] ${config.allowedUsers.size} authorized user(s)`);
  console.log('[Models] Cohere North Mini Code + Google Gemini 3.1 Flash-Lite');
  console.log('[Agent] Ready.');
  await registerSlashCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith('opencode_reply:')) return;

    const parts = interaction.customId.split(':');
    const authorId = parts[3];
    if (!authorId || interaction.user.id !== authorId) {
      await interaction.reply({ content: 'Hanya pengguna yang memulai task ini yang dapat membalas.', ephemeral: true });
      return;
    }

    const modal = buildReplyModal(interaction.customId);
    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit()) {
    if (!interaction.customId.startsWith('opencode_reply:')) return;

    const parts = interaction.customId.split(':');
    const channelId = parts[1];
    const authorId = parts[3];
    if (!channelId || !authorId) {
      await interaction.reply({ content: 'Payload reply tidak valid.', ephemeral: true });
      return;
    }

    if (interaction.user.id !== authorId) {
      await interaction.reply({ content: 'Hanya pengguna yang memulai task ini yang dapat membalas.', ephemeral: true });
      return;
    }

    const prompt = interaction.fields.getTextInputValue('opencode_reply_prompt').trim();
    if (!prompt) {
      await interaction.reply({ content: 'Prompt tidak boleh kosong.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isSendable()) {
      await interaction.editReply({ content: 'Channel tujuan tidak tersedia.' });
      return;
    }

    await handleCodeCommand(
      {
        channel,
        guildId: interaction.guildId,
        channelId: channel.id,
        author: interaction.user,
      } as never,
      prompt,
      openCode,
    );

    await interaction.editReply({ content: 'Follow-up dikirim ke OpenCode.' });
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (!isAuthorized({
    author: { id: interaction.user.id },
  } as never, config.allowedUsers)) {
    await replyUnauthorized(interaction);
    console.log(`[Security] Unauthorized user: ${interaction.user.tag} (${interaction.user.id})`);
    return;
  }

  switch (interaction.commandName) {
    case 'code':
      await handleSlashCode(interaction);
      break;
    case 'model':
      await handleSlashModel(interaction);
      break;
    case 'status':
      await handleSlashStatus(interaction);
      break;
    case 'session':
      await handleSlashSession(interaction);
      break;
    case 'reset':
      await handleSlashReset(interaction);
      break;
    case 'abort':
      await handleSlashAbort(interaction);
      break;
    case 'help':
      await handleSlashHelp(interaction);
      break;
    default:
      break;
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const content = message.content.trim();
    if (!content.startsWith('!')) return;
    if (!isAuthorized(message, config.allowedUsers)) {
      await message.reply(
        componentsV2Payload([
          buildAgentContainer({
            title: '## OpenCode Agent',
            content: 'Anda tidak memiliki izin untuk menggunakan coding agent.',
            status: 'Unauthorized',
          }),
        ]),
      );
      console.log(`[Security] Unauthorized user: ${message.author.tag} (${message.author.id})`);
      return;
    }

    const space = content.indexOf(' ');
    const command = (space === -1 ? content.slice(1) : content.slice(1, space)).toLowerCase();
    const args = space === -1 ? '' : content.slice(space + 1).trim();

    switch (command) {
      case 'code':
        if (!args) {
          await message.reply(
            componentsV2Payload([
              buildAgentContainer({
                title: '## OpenCode Agent',
                content: 'Gunakan: `!code <task>`',
                status: 'Idle',
              }),
            ]),
          );
          return;
        }
        await handleCodeCommand(message, args, openCode);
        break;
      case 'model': await handleModelCommand(message, args); break;
      case 'status': await handleStatusCommand(message, openCode); break;
      case 'session': await handleSessionCommand(message); break;
      case 'reset': await handleResetCommand(message); break;
      case 'abort': await handleAbortCommand(message, openCode); break;
      case 'help': await handleHelpCommand(message); break;
      default: break;
    }
  } catch (error) { console.error('[Discord Handler Error]', error); }
});

process.on('unhandledRejection', (error) => console.error('[Unhandled Rejection]', error));
process.on('uncaughtException', (error) => console.error('[Uncaught Exception]', error));

client.login(config.discordBotToken);
