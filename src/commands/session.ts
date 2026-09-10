import type { Message } from 'discord.js';
import { running, sessions } from '../state.js';
import { OpenCodeClient } from '../opencode/client.js';
import { buildAgentContainer, componentsV2Payload, getSessionKey } from '../utils/discord.js';

export async function handleSessionCommand(message: Message): Promise<void> {
  const key = getSessionKey(message);
  const sessionId = sessions.get(key);

  await message.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Session',
        content: sessionId ? `Status: Active` : 'Status: Inactive',
        status: sessionId ? 'Active' : 'Inactive',
        session: sessionId ?? 'none',
      }),
    ]),
  );
}

export async function handleResetCommand(message: Message): Promise<void> {
  const key = getSessionKey(message);
  if (running.has(key)) {
    await message.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## Session Reset',
          content: 'Task masih berjalan. Gunakan `!abort` terlebih dahulu.',
          status: 'Working',
        }),
      ]),
    );
    return;
  }

  sessions.delete(key);

  await message.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Session Reset',
        content: 'Session berhasil di-reset.',
        status: 'Ready',
      }),
    ]),
  );
}

export async function handleAbortCommand(message: Message, openCode: OpenCodeClient): Promise<void> {
  const key = getSessionKey(message);
  const sessionId = sessions.get(key);

  if (!sessionId) {
    await message.reply(
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

  if (!running.has(key)) {
    await message.reply(
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
    await message.reply(
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

    await message.reply(
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
