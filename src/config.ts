import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const token = process.env['DISCORD_BOT_TOKEN'];
if (!token) throw new Error('DISCORD_BOT_TOKEN environment variable is required');

const allowedUsers = new Set(
  (process.env['ALLOWED_USER_IDS'] ?? '').split(',').map((id) => id.trim()).filter(Boolean),
);
if (!allowedUsers.size) throw new Error('ALLOWED_USER_IDS is required.');

const fallbackPrefix = process.env['DISCORD_PREFIX']?.trim() || '!';
const configPath = join(process.cwd(), 'data', 'config.json');

function isValidPrefix(prefix: unknown): prefix is string {
  return typeof prefix === 'string' && prefix.length > 0 && prefix.length <= 3 && !/\s/.test(prefix);
}

function loadCommandPrefix(): string {
  if (!existsSync(configPath)) return fallbackPrefix;

  try {
    const stored = JSON.parse(readFileSync(configPath, 'utf8')) as { prefix?: unknown };
    return isValidPrefix(stored.prefix) ? stored.prefix : fallbackPrefix;
  } catch (error) {
    console.error('[Config] Could not read data/config.json; using fallback prefix.', error);
    return fallbackPrefix;
  }
}

let commandPrefix = loadCommandPrefix();

export function getCommandPrefix(): string {
  return commandPrefix;
}

export function setCommandPrefix(prefix: string): boolean {
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    const temporaryPath = `${configPath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify({ prefix })}\n`, 'utf8');
    renameSync(temporaryPath, configPath);
    commandPrefix = prefix;
    return true;
  } catch (error) {
    console.error('[Config] Could not persist command prefix.', error);
    return false;
  }
}

export function getCommandPrefixes(): string[] {
  return [...new Set(['!', commandPrefix])].sort((left, right) => right.length - left.length);
}

export const config = {
  discordBotToken: token,
  allowedUsers,
  opencodeUrl: process.env['OPENCODE_URL'] ?? 'http://127.0.0.1:4096',
  workspace: process.env['OPENCODE_WORKSPACE'] ?? '/home/babaku/ai-workspace/projects',
  discordGuildId: process.env['DISCORD_GUILD_ID']?.trim() || undefined,
} as const;
