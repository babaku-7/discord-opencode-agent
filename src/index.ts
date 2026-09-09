import { ActionRowBuilder, Client, GatewayIntentBits, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction } from 'discord.js';
import { config } from './config.js';
import { OpenCodeClient } from './opencode/client.js';
import { handleCodeCommand } from './commands/code.js';
import { handleModelCommand } from './commands/model.js';
import { handleStatusCommand } from './commands/status.js';
import { handleAbortCommand, handleResetCommand, handleSessionCommand } from './commands/session.js';
import { handleHelpCommand } from './commands/help.js';
import { handleSlashInteraction, registerSlashCommands } from './commands/slash.js';
import { buildAgentContainer, componentsV2Payload, isAuthorized } from './utils/discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const openCode = new OpenCodeClient();

async function replyUnauthorized(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## OpenCode Agent',
        content: 'Anda tidak memiliki izin untuk menggunakan coding agent.',
        status: 'Unauthorized',
      }),
    ]),
  );
}

function buildReplyModal(sessionKey: string): ModalBuilder {
  const promptInput = new TextInputBuilder()
    .setCustomId('opencode_reply_prompt')
    .setLabel('Follow-up to OpenCode')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Type your follow-up prompt...');

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(promptInput);

  return new ModalBuilder()
    .setCustomId(`opencode_reply_modal:${sessionKey}`)
    .setTitle('Reply to OpenCode')
    .addComponents(row);
}

async function handleReplyButton(interaction: any): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('opencode_reply:')) return;

  if (!config.allowedUsers.has(interaction.user.id)) {
    await interaction.reply({ content: 'Anda tidak memiliki izin untuk menggunakan coding agent.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sessionKey = interaction.customId.replace('opencode_reply:', '');
  await interaction.showModal(buildReplyModal(sessionKey));
}

async function handleReplyModal(interaction: any): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith('opencode_reply_modal:')) return;

  if (!config.allowedUsers.has(interaction.user.id)) {
    await interaction.reply({ content: 'Anda tidak memiliki izin untuk menggunakan coding agent.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sessionKey = interaction.customId.replace('opencode_reply_modal:', '');
  if (!sessionKey) {
    await interaction.reply({ content: 'Target balasan tidak valid.', flags: MessageFlags.Ephemeral });
    return;
  }

  const prompt = interaction.fields.getTextInputValue('opencode_reply_prompt').trim();

  if (!prompt) {
    await interaction.reply({ content: 'Prompt tidak boleh kosong.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.channel || !interaction.channel.isSendable()) {
    await interaction.reply({ content: 'Channel tidak tersedia untuk menjalankan request.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 as any });
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

client.once('clientReady', async () => {
  console.log(`[Discord] Logged in as ${client.user?.tag}`);
  console.log(`[OpenCode] URL: ${config.opencodeUrl}`);
  console.log(`[Workspace] ${config.workspace}`);
  console.log(`[Security] ${config.allowedUsers.size} authorized user(s)`);
  console.log('[Models] Cohere North Mini Code + Google Gemini 3.1 Flash-Lite');
  console.log('[Agent] Ready.');
  await registerSlashCommands(client);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    await handleReplyButton(interaction);
    return;
  }

  if (interaction.isModalSubmit()) {
    await handleReplyModal(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (!config.allowedUsers.has(interaction.user.id)) {
    await replyUnauthorized(interaction);
    console.log(`[Security] Unauthorized user: ${interaction.user.tag} (${interaction.user.id})`);
    return;
  }

  await handleSlashInteraction(interaction, openCode);
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
      case 'model':
        await handleModelCommand(message, args);
        break;
      case 'status':
        await handleStatusCommand(message, openCode);
        break;
      case 'session':
        await handleSessionCommand(message);
        break;
      case 'reset':
        await handleResetCommand(message);
        break;
      case 'abort':
        await handleAbortCommand(message, openCode);
        break;
      case 'help':
        await handleHelpCommand(message);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error('[Discord Handler Error]', error);
  }
});

process.on('unhandledRejection', (error) => console.error('[Unhandled Rejection]', error));
process.on('uncaughtException', (error) => console.error('[Uncaught Exception]', error));

client.login(config.discordBotToken);
