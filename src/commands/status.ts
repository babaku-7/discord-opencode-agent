import type { Message } from 'discord.js';
import { MODELS } from '../models.js';
import { running, selectedModels, sessions } from '../state.js';
import { OpenCodeClient } from '../opencode/client.js';
import { getSessionKey } from '../utils/discord.js';

export async function handleStatusCommand(message: Message, openCode: OpenCodeClient): Promise<void> {
  const key = getSessionKey(message);
  const sessionId = sessions.get(key);
  const selected = selectedModels.get(key) ?? 'cohere';
  const model = MODELS[selected];
  await message.reply([
    '**🤖 Agent Status**', '',
    `Status: ${sessionId ? '🟢 Session active' : '⚪ No session'}`,
    `Session: \`${sessionId ?? 'none'}\``,
    `Running: \`${running.has(key)}\``, '',
    `Provider: \`${model.providerID}\``,
    `Model: \`${model.modelID}\``,
    `Name: **${model.label}**`, '',
    `Workspace: \`${openCode.getWorkspace()}\``,
  ].join('\n'));
}
