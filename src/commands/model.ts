import type { Message } from 'discord.js';
import { MODELS, type AgentModel } from '../models.js';
import { DEFAULT_MODEL, selectedModels } from '../state.js';
import { buildAgentContainer, componentsV2Payload, getSessionKey } from '../utils/discord.js';

export async function handleModelCommand(message: Message, name: string): Promise<void> {
  const key = getSessionKey(message);

  if (!name) {
    const current = selectedModels.get(key) ?? DEFAULT_MODEL;
    const model = MODELS[current];
    const available = Object.entries(MODELS)
      .map(([keyName, entry]) => `- ${keyName}: ${entry.providerID}/${entry.modelID}`)
      .join('\n');

    await message.reply(
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

  const normalized = name.toLowerCase();
  if (normalized !== 'cohere' && normalized !== 'gemini') {
    await message.reply(
      componentsV2Payload([
        buildAgentContainer({
          title: '## Model',
          content: 'Model tidak tersedia. Gunakan `!model cohere` atau `!model gemini`.',
          status: 'Failed',
        }),
      ]),
    );
    return;
  }

  const selected = normalized as AgentModel;
  selectedModels.set(key, selected);
  const model = MODELS[selected];

  await message.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## Model',
        content: ['Model berhasil diubah.', `Provider: \`${model.providerID}\``, `Model: \`${model.modelID}\``].join('\n'),
        status: 'Ready',
        model: `${model.providerID}/${model.modelID}`,
      }),
    ]),
  );

  console.log(`[Model] ${message.author.tag} → ${model.providerID}/${model.modelID}`);
}
