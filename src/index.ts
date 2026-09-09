import { Client, GatewayIntentBits, type ChatInputCommandInteraction } from 'discord.js';
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
