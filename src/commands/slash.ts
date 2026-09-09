import { ApplicationCommandOptionType, MessageFlags, REST, Routes, type ChatInputCommandInteraction, type Client, type InteractionDeferReplyOptions } from 'discord.js';
import { MODELS } from '../models.js';
import { config } from '../config.js';
import { OpenCodeClient } from '../opencode/client.js';
import { DEFAULT_MODEL, running, selectedModels, sessions } from '../state.js';
import { buildAgentContainer, componentsV2Payload, getSessionKeyFromContext } from '../utils/discord.js';
import { handleCodeCommand } from './code.js';

export const slashCommands = [
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

async function handleSlashCode(interaction: ChatInputCommandInteraction, openCode: OpenCodeClient): Promise<void> {
  const prompt = interaction.options.getString('prompt', true);
  const key = getSessionKeyFromContext({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: interaction.user,
  });

  if (running.has(key)) {
    await interaction.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## OpenCode Agent',
          content: 'Task sebelumnya masih berjalan. Gunakan `/abort` untuk menghentikannya.',
          status: 'Working',
        }),
      ]),
    );
    return;
  }

  await interaction.deferReply({
    flags: MessageFlags.IsComponentsV2 as InteractionDeferReplyOptions['flags'],
  });

  if (!interaction.channel || !interaction.channel.isSendable()) {
    await interaction.editReply('Channel tidak tersedia untuk menjalankan request.');
    return;
  }

  await handleCodeCommand(
    {
      channel: interaction.channel,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      author: interaction.user,
      edit: interaction.editReply.bind(interaction),
    },
    prompt,
    openCode,
  );
}

async function handleSlashModel(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name')?.toLowerCase();
  const key = getSessionKeyFromContext({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: interaction.user,
  });

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
  const key = getSessionKeyFromContext({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: interaction.user,
  });

  const sessionId = sessions.get(key);
  const selected = selectedModels.get(key) ?? DEFAULT_MODEL;
  const model = MODELS[selected];
  const openCodeState = running.has(key) ? 'Busy' : sessionId ? 'Idle' : 'Offline';

  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Agent Status',
        content: [`Status: ${sessionId ? 'Online' : 'Offline'}`, `OpenCode: ${openCodeState}`].join('\n'),
        status: running.has(key) ? 'Working' : sessionId ? 'Ready' : 'Idle',
        model: `${model.providerID}/${model.modelID}`,
        session: sessionId ?? 'none',
      }),
    ]),
  );
}

async function handleSlashSession(interaction: ChatInputCommandInteraction): Promise<void> {
  const key = getSessionKeyFromContext({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: interaction.user,
  });

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
  const key = getSessionKeyFromContext({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: interaction.user,
  });

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

async function handleSlashAbort(interaction: ChatInputCommandInteraction, openCode: OpenCodeClient): Promise<void> {
  const key = getSessionKeyFromContext({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    author: interaction.user,
  });

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
  } catch (error) {
    console.error('[OpenCode Abort Error]', error);
    const text = error instanceof Error ? error.message : String(error);
    const safeText = text.replace(/(Authorization|authorization|token|secret|password|key)\s*[:=]\s*[^\s]+/gi, '[redacted]');

    await interaction.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## OpenCode Agent',
          content: `Gagal menghentikan request.\n\n${safeText.slice(0, 900)}`,
          status: 'Failed',
        }),
      ]),
    );
  }
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

export async function handleSlashInteraction(interaction: ChatInputCommandInteraction, openCode: OpenCodeClient): Promise<void> {
  switch (interaction.commandName) {
    case 'code':
      await handleSlashCode(interaction, openCode);
      return;
    case 'model':
      await handleSlashModel(interaction);
      return;
    case 'status':
      await handleSlashStatus(interaction);
      return;
    case 'session':
      await handleSlashSession(interaction);
      return;
    case 'reset':
      await handleSlashReset(interaction);
      return;
    case 'abort':
      await handleSlashAbort(interaction, openCode);
      return;
    case 'help':
      await handleSlashHelp(interaction);
      return;
    default:
      return;
  }
}

export async function registerSlashCommands(client: Client): Promise<void> {
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
