import type { Message } from 'discord.js';

import { MODELS } from '../models.js';
import { DEFAULT_MODEL, running, selectedModels, sessions } from '../state.js';
import { OpenCodeClient } from '../opencode/client.js';
import { OpenCodeEvents, type OpenCodeProgress } from '../opencode/events.js';
import {
  buildAgentContainer,
  buildReplyActionRow,
  componentsV2Payload,
  extractText,
  getSessionKey,
  sendLongMessage,
  unwrapResponse,
} from '../utils/discord.js';

function getProgressPayload(content: string, model: string, session: string, status = 'Working'): ReturnType<typeof componentsV2Payload> {
  return componentsV2Payload([
    buildAgentContainer({
      title: '## OpenCode Agent',
      content,
      status,
      model,
      session,
    }),
  ]);
}

function makePromptPreview(prompt: string): string {
  return prompt.length > 180 ? `${prompt.slice(0, 177).trimEnd()}...` : prompt;
}

async function updateProgress(progressMessage: Message | { edit: (payload: ReturnType<typeof componentsV2Payload>) => Promise<unknown> }, content: string, model: string, session: string, status = 'Working'): Promise<void> {
  try {
    await progressMessage.edit(getProgressPayload(content, model, session, status));
  } catch (error) {
    console.error('[Discord Progress]', error);
  }
}

export async function handleCodeCommand(message: Message, prompt: string, openCode: OpenCodeClient): Promise<void> {
  const key = getSessionKey(message);
  const channel = message.channel;
  const isDeferredInteraction = typeof (message as Message & { edit?: unknown; reply?: unknown }).edit === 'function';

  if (!channel.isSendable()) return;
  if (running.has(key)) {
    await channel.send(
      componentsV2Payload([
        buildAgentContainer({
          title: '## OpenCode Agent',
          content: 'Task sebelumnya masih berjalan. Gunakan `!abort` untuk menghentikannya.',
          status: 'Working',
        }),
      ]),
    );
    return;
  }

  running.add(key);
  let stopEvents: (() => void) | undefined;

  try {
    await channel.sendTyping();

    let sessionId = sessions.get(key);

    if (!sessionId) {
      console.log(`[OpenCode] Creating session for ${message.author.tag}`);
      const result = await openCode.createSession(`Discord - ${message.author.username}`);
      const data = unwrapResponse(result) as Record<string, unknown> | undefined;
      sessionId = typeof data?.['id'] === 'string' ? data['id'] : undefined;

      if (!sessionId) {
        throw new Error('OpenCode tidak mengembalikan session ID.');
      }

      sessions.set(key, sessionId);
      console.log(`[OpenCode] Session created: ${sessionId}`);
    }

    const selectedModel = selectedModels.get(key) ?? DEFAULT_MODEL;
    const model = MODELS[selectedModel];
    const modelLabel = `${model.providerID}/${model.modelID}`;

    console.log(`[OpenCode] User: ${message.author.tag}`);
    console.log(`[OpenCode] Session: ${sessionId}`);
    console.log(`[OpenCode] Model: ${modelLabel}`);
    console.log(`[OpenCode] Prompt: ${prompt}`);

    const promptPreview = makePromptPreview(prompt);
    const progressPayload = componentsV2Payload([
      buildAgentContainer({
        title: 'OpenCode',
        content: ['Processing request...', '', `Prompt: \`${promptPreview}\``, '', `Model: \`${modelLabel}\``].join('\n'),
        status: 'Working',
        model: modelLabel,
        session: sessionId,
      }),
    ]);

    const progressMessage = isDeferredInteraction
      ? { edit: async (payload: ReturnType<typeof componentsV2Payload>) => (message as Message & { edit: (payload: ReturnType<typeof componentsV2Payload>) => Promise<unknown> }).edit(payload) }
      : await channel.send(progressPayload);

    if (isDeferredInteraction) {
      await (progressMessage as { edit: (payload: ReturnType<typeof componentsV2Payload>) => Promise<unknown> }).edit(progressPayload);
    } else {
      await (progressMessage as Message).edit(progressPayload);
    }

    const progressLines = ['Sedang mengerjakan task...'];
    const eventClient = new OpenCodeEvents(process.env['OPENCODE_URL'] ?? 'http://127.0.0.1:4096');

    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    let updateQueued = false;

    const onProgress = (progress: OpenCodeProgress) => {
      progressLines.push(progress.message);
      if (updateQueued) return;

      updateQueued = true;
      updateTimer = setTimeout(async () => {
        updateQueued = false;
        const latest = progressLines.slice(-8).join('\n');
        await updateProgress(progressMessage, latest, modelLabel, sessionId);
      }, 750);
    };

    stopEvents = await eventClient.watchSession(sessionId, onProgress);

    const result = await openCode.sendPrompt(sessionId, prompt, selectedModel);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const responseData = unwrapResponse(result);
    const text = extractText(responseData);
    const errorInfo =
      typeof responseData === 'object' && responseData !== null
        ? (responseData as Record<string, unknown>)['info']
        : undefined;
    const errorPayload =
      typeof errorInfo === 'object' && errorInfo !== null
        ? (errorInfo as Record<string, unknown>)['error']
        : undefined;
    const errorName =
      typeof errorPayload === 'object' && errorPayload !== null
        ? (errorPayload as Record<string, unknown>)['name']
        : undefined;
    const errorMessage =
      typeof errorPayload === 'object' && errorPayload !== null && 'data' in (errorPayload as Record<string, unknown>)
        ? (errorPayload as Record<string, unknown>)['data']
        : undefined;
    const aborted = typeof errorName === 'string' && /aborted/i.test(errorName)
      || typeof errorMessage === 'object' && errorMessage !== null && 'message' in (errorMessage as Record<string, unknown>) && typeof (errorMessage as Record<string, unknown>)['message'] === 'string' && /aborted/i.test((errorMessage as Record<string, unknown>)['message'] as string);

    stopEvents();
    stopEvents = undefined;

    if (updateTimer) clearTimeout(updateTimer);

    if (aborted) {
      await updateProgress(progressMessage, 'Request dibatalkan.', modelLabel, sessionId, 'Aborted');
      console.log('[OpenCode] Request aborted by OpenCode:', JSON.stringify(responseData, null, 2));
      return;
    }

    await updateProgress(progressMessage, 'Request selesai.', modelLabel, sessionId, 'Completed');

    if (text) {
      const replyCustomId = `opencode_reply:${message.channelId}:${sessionId}:${message.author.id}`;
      const finalPayload = componentsV2Payload([
        buildAgentContainer({
          title: 'OpenCode',
          content: isDeferredInteraction ? `${text.slice(0, 1600).trimEnd()}${text.length > 1600 ? '\n\n... (output dipotong karena terlalu panjang)' : ''}` : text,
          status: 'Completed',
          model: modelLabel,
          session: sessionId,
        }),
        buildReplyActionRow(replyCustomId),
      ]);

      if (isDeferredInteraction) {
        await (message as Message & { edit: (payload: ReturnType<typeof componentsV2Payload>) => Promise<unknown> }).edit(finalPayload);
      } else {
        await sendLongMessage(message, text, replyCustomId);
      }
    } else {
      console.log('[OpenCode] No text response.');
      console.log('[OpenCode] Raw response:', JSON.stringify(responseData, null, 2));
    }
  } catch (error) {
    console.error('[OpenCode Error]', error);

    if (stopEvents) stopEvents();

    const errorMessage = error instanceof Error ? error.message : String(error);
    const safeText = errorMessage
      .replace(/(Authorization|authorization|token|secret|password|key)\s*[:=]\s*[^\s]+/gi, '[redacted]')
      .slice(0, 900);

    const failedPayload = componentsV2Payload([
      buildAgentContainer({
        title: '## OpenCode Agent',
        content: `Request gagal.\n\n${safeText}`,
        status: 'Failed',
      }),
    ]);

    if (isDeferredInteraction) {
      await (message as Message & { edit: (payload: ReturnType<typeof componentsV2Payload>) => Promise<unknown> }).edit(failedPayload);
    } else {
      await channel.send(failedPayload);
    }
  } finally {
    if (stopEvents) stopEvents();
    running.delete(key);
  }
}
