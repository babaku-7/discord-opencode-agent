import type { Message } from 'discord.js';
import { running, sessions } from '../state.js';
import { OpenCodeClient } from '../opencode/client.js';
import { getSessionKey } from '../utils/discord.js';

export async function handleResetCommand(message: Message): Promise<void> {
  const key = getSessionKey(message);
  if (running.has(key)) { await message.reply('⚠️ Task masih berjalan. Gunakan `!abort` terlebih dahulu.'); return; }
  sessions.delete(key);
  await message.reply('🧹 Session OpenCode di-reset. Request berikutnya akan menggunakan session baru.');
}

export async function handleAbortCommand(message: Message, openCode: OpenCodeClient): Promise<void> {
  const key = getSessionKey(message);
  const sessionId = sessions.get(key);
  if (!sessionId) { await message.reply('⚪ Tidak ada session aktif.'); return; }
  if (!running.has(key)) { await message.reply('⚪ Tidak ada task yang sedang berjalan.'); return; }
  try {
    await openCode.abortSession(sessionId);
    running.delete(key);
    await message.reply('Request OpenCode dihentikan.');
  } catch (error) {
    console.error('[OpenCode Abort Error]', error);
    const text = error instanceof Error ? error.message : String(error);
    await message.reply(`❌ Gagal menghentikan request:\n\`${text.slice(0, 1000)}\``);
  }
}
