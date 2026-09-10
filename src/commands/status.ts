import type { Message } from 'discord.js';
import { MODELS } from '../models.js';
import { DEFAULT_MODEL, running, selectedModels, sessions } from '../state.js';
import { OpenCodeClient } from '../opencode/client.js';
import { buildAgentContainer, componentsV2Payload, getSessionKey } from '../utils/discord.js';

export async function handleStatusCommand(message: Message, openCode: OpenCodeClient): Promise<void> {
  const key = getSessionKey(message);
  const sessionId = sessions.get(key);
  const selected = selectedModels.get(key) ?? DEFAULT_MODEL;
  const model = MODELS[selected];

  const openCodeState = running.has(key) ? 'Busy' : sessionId ? 'Idle' : 'Offline';

  await message.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Agent Status',
        content: [
          `Status: ${sessionId ? 'Online' : 'Offline'}`,
          `OpenCode: ${openCodeState}`,
          `Workspace: \`${openCode.getWorkspace()}\``,
        ].join('\n'),
        status: running.has(key) ? 'Working' : sessionId ? 'Ready' : 'Idle',
        model: `${model.providerID}/${model.modelID}`,
        session: sessionId ?? 'none',
      }),
    ]),
  );
}
