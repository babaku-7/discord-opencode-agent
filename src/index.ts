import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { OpenCodeClient } from './opencode/client.js';
import { handleCodeCommand } from './commands/code.js';
import { handleModelCommand } from './commands/model.js';
import { handleStatusCommand } from './commands/status.js';
import { handleAbortCommand, handleResetCommand } from './commands/session.js';
import { handleHelpCommand } from './commands/help.js';
import { isAuthorized } from './utils/discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const openCode = new OpenCodeClient();

client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user?.tag}`);
  console.log(`[OpenCode] URL: ${config.opencodeUrl}`);
  console.log(`[Workspace] ${config.workspace}`);
  console.log(`[Security] ${config.allowedUsers.size} authorized user(s)`);
  console.log('[Models] Cohere North Mini Code + Google Gemini 3.1 Flash-Lite');
  console.log('[Agent] Ready.');
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const content = message.content.trim();
    if (!content.startsWith('!')) return;
    if (!isAuthorized(message, config.allowedUsers)) {
      await message.reply('Kamu tidak memiliki izin menggunakan coding agent.');
      console.log(`[Security] Unauthorized user: ${message.author.tag} (${message.author.id})`);
      return;
    }

    const space = content.indexOf(' ');
    const command = (space === -1 ? content.slice(1) : content.slice(1, space)).toLowerCase();
    const args = space === -1 ? '' : content.slice(space + 1).trim();

    switch (command) {
      case 'code':
        if (!args) { await message.reply('Gunakan: `!code <task>`'); return; }
        await handleCodeCommand(message, args, openCode);
        break;
      case 'model': await handleModelCommand(message, args); break;
      case 'status': await handleStatusCommand(message, openCode); break;
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
