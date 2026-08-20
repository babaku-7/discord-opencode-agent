import type { Message } from 'discord.js';
import { MODELS } from '../models.js';
import { running, selectedModels, sessions } from '../state.js';
import { OpenCodeClient } from '../opencode/client.js';
import { extractText, getSessionKey, sendLongMessage, unwrapResponse } from '../utils/discord.js';

export async function handleCodeCommand(message: Message, prompt: string, openCode: OpenCodeClient): Promise<void> {
  const key = getSessionKey(message);
  const channel = message.channel;
  if (!channel.isSendable()) return;
  if (running.has(key)) { await channel.send('⏳ Task sebelumnya masih berjalan. Gunakan `!abort`.'); return; }
  running.add(key);

  try {
    await channel.sendTyping();
    let sessionId = sessions.get(key);

    if (!sessionId) {
      const result = await openCode.createSession(`Discord - ${message.author.username}`);
      const data = unwrapResponse(result) as Record<string, unknown> | undefined;
      sessionId = typeof data?.['id'] === 'string' ? data['id'] : undefined;
      if (!sessionId) throw new Error('OpenCode tidak mengembalikan session ID.');
      sessions.set(key, sessionId);
      console.log(`[OpenCode] Session created: ${sessionId}`);
    }

    const selected = selectedModels.get(key) ?? 'cohere';
    const model = MODELS[selected];
    console.log(`[OpenCode] User: ${message.author.tag}`);
    console.log(`[OpenCode] Session: ${sessionId}`);
    console.log(`[OpenCode] Model: ${model.providerID}/${model.modelID}`);
    console.log(`[OpenCode] Prompt: ${prompt}`);

    const result = await openCode.sendPrompt(sessionId, prompt, selected);
    const response = unwrapResponse(result);
    const text = extractText(response);

    if (!text) {
      console.log('[OpenCode] No text response.');
      console.log('[OpenCode] Raw response:', JSON.stringify(response, null, 2));
      await channel.send([
        '✅ OpenCode selesai.', '',
        `Model: \`${model.providerID}/${model.modelID}\``,
        `Session: \`${sessionId}\``, '',
        'Tidak ada output teks dari OpenCode.',
        'Jika task membuat/edit file, cek workspace untuk hasilnya.',
      ].join('\n'));
      return;
    }
    await sendLongMessage(message, text);
  } catch (error) {
    console.error('[OpenCode Error]', error);
    const text = error instanceof Error ? error.message : String(error);
    await channel.send(`❌ OpenCode error:\n\`\`\`\n${text.slice(0, 1800)}\n\`\`\``);
  } finally { running.delete(key); }
}
