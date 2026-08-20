import 'dotenv/config';

const token = process.env['DISCORD_BOT_TOKEN'];
if (!token) throw new Error('DISCORD_BOT_TOKEN environment variable is required');

const allowedUsers = new Set(
  (process.env['ALLOWED_USER_IDS'] ?? '').split(',').map((id) => id.trim()).filter(Boolean),
);
if (!allowedUsers.size) throw new Error('ALLOWED_USER_IDS is required.');

export const config = {
  discordBotToken: token,
  allowedUsers,
  opencodeUrl: process.env['OPENCODE_URL'] ?? 'http://127.0.0.1:4096',
  workspace: process.env['OPENCODE_WORKSPACE'] ?? '/home/babaku/ai-workspace/projects',
} as const;
