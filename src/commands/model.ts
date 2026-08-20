import type { Message } from 'discord.js';
import { MODELS, type AgentModel } from '../models.js';
import { selectedModels } from '../state.js';
import { getSessionKey } from '../utils/discord.js';

export async function handleModelCommand(message: Message, name: string): Promise<void> {
  const key = getSessionKey(message);
  if (!name) {
    const current = selectedModels.get(key) ?? 'cohere';
    const model = MODELS[current];
    await message.reply([`**🤖 Current Agent Model**`, '', `Provider: \`${model.providerID}\``, `Model: \`${model.modelID}\``, `Name: **${model.label}**`, '', '`!model cohere`', '`!model gemini`'].join('\n'));
    return;
  }
  const normalized = name.toLowerCase();
  if (normalized !== 'cohere' && normalized !== 'gemini') { await message.reply('❌ Model tidak tersedia. Gunakan `!model cohere` atau `!model gemini`.'); return; }
  const selected = normalized as AgentModel;
  selectedModels.set(key, selected);
  const model = MODELS[selected];
  await message.reply(`✅ **Model berhasil diganti**\n\nProvider: \`${model.providerID}\`\nModel: \`${model.modelID}\`\nName: **${model.label}**`);
  console.log(`[Model] ${message.author.tag} → ${model.providerID}/${model.modelID}`);
}
