import type { Message } from 'discord.js';

import { MODELS } from '../models.js';

import {
  running,
  selectedModels,
  sessions,
} from '../state.js';

import { OpenCodeClient } from '../opencode/client.js';

import {
  extractText,
  getSessionKey,
  sendLongMessage,
  unwrapResponse,
} from '../utils/discord.js';

import {
  OpenCodeEvents,
  type OpenCodeProgress,
} from '../opencode/events.js';

function formatProgress(
  lines: string[],
): string {
  const header =
    '🤖 **OpenCode Agent**\n\n';

  const body =
    lines
      .slice(-8)
      .join('\n');

  return `${header}${body}`;
}

async function updateProgress(
  progressMessage: Message,
  lines: string[],
): Promise<void> {
  try {
    await progressMessage.edit(
      formatProgress(lines),
    );
  } catch (error) {
    console.error(
      '[Discord Progress]',
      error,
    );
  }
}

export async function handleCodeCommand(
  message: Message,
  prompt: string,
  openCode: OpenCodeClient,
): Promise<void> {
  const key =
    getSessionKey(message);

  const channel =
    message.channel;

  if (!channel.isSendable()) {
    return;
  }

  if (running.has(key)) {
    await channel.send(
      '⏳ Task sebelumnya masih berjalan. Gunakan `!abort` untuk menghentikannya.',
    );
    return;
  }

  running.add(key);

  let stopEvents:
    | (() => void)
    | undefined;

  try {
    await channel.sendTyping();

    /*
     * Get/create session.
     */
    let sessionId =
      sessions.get(key);

    if (!sessionId) {
      console.log(
        `[OpenCode] Creating session for ${message.author.tag}`,
      );

      const result =
        await openCode.createSession(
          `Discord - ${message.author.username}`,
        );

      const data =
        unwrapResponse(result) as
          | Record<string, unknown>
          | undefined;

      sessionId =
        typeof data?.['id'] ===
        'string'
          ? data['id']
          : undefined;

      if (!sessionId) {
        throw new Error(
          'OpenCode tidak mengembalikan session ID.',
        );
      }

      sessions.set(
        key,
        sessionId,
      );

      console.log(
        `[OpenCode] Session created: ${sessionId}`,
      );
    }

    const selectedModel =
      selectedModels.get(key) ??
      'cohere';

    const model =
      MODELS[selectedModel];

    console.log(
      `[OpenCode] User: ${message.author.tag}`,
    );

    console.log(
      `[OpenCode] Session: ${sessionId}`,
    );

    console.log(
      `[OpenCode] Model: ${model.providerID}/${model.modelID}`,
    );

    console.log(
      `[OpenCode] Prompt: ${prompt}`,
    );

    /*
     * Create progress message BEFORE
     * starting the OpenCode request.
     */
    const progressMessage =
      await channel.send(
        [
          '🤖 **OpenCode Agent**',
          '',
          '⏳ Agent sedang bekerja...',
          '',
          `Model: \`${model.providerID}/${model.modelID}\``,
        ].join('\n'),
      );

    const progressLines: string[] =
      [
        '⏳ Agent sedang bekerja...',
      ];

    /*
     * Subscribe BEFORE prompt.
     *
     * This is important so we don't miss
     * early events.
     */
    const eventClient =
      new OpenCodeEvents(
        process.env['OPENCODE_URL'] ??
          'http://127.0.0.1:4096',
      );

    let updateTimer:
      ReturnType<
        typeof setTimeout
      > | undefined;

    let updateQueued = false;

    const onProgress = (
      progress: OpenCodeProgress,
    ) => {
      progressLines.push(
        progress.message,
      );

      /*
       * Avoid editing Discord message
       * on every event.
       *
       * Maximum one update / 750ms.
       */
      if (updateQueued) {
        return;
      }

      updateQueued = true;

      updateTimer =
        setTimeout(
          async () => {
            updateQueued =
              false;

            await updateProgress(
              progressMessage,
              progressLines,
            );
          },
          750,
        );
    };

    stopEvents =
      await eventClient.watchSession(
        sessionId,
        onProgress,
      );

    /*
     * Start agent.
     */
    const result =
      await openCode.sendPrompt(
        sessionId,
        prompt,
        selectedModel,
      );

    /*
     * Give trailing SSE events a
     * moment to arrive.
     */
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          500,
        ),
    );

    const responseData =
      unwrapResponse(result);

    const text =
      extractText(
        responseData,
      );

    /*
     * Stop SSE watcher.
     */
    stopEvents();
    stopEvents =
      undefined;

    if (updateTimer) {
      clearTimeout(
        updateTimer,
      );
    }

    /*
     * Final progress.
     */
    progressLines.push(
      '✅ Task selesai.',
    );

    await updateProgress(
      progressMessage,
      progressLines,
    );

    /*
     * Send final textual answer
     * if OpenCode produced one.
     */
    if (text) {
      await sendLongMessage(
        message,
        text,
      );
    } else {
      /*
       * Tool-based tasks may finish
       * without assistant text.
       */
      console.log(
        '[OpenCode] No text response.',
      );

      console.log(
        '[OpenCode] Raw response:',
        JSON.stringify(
          responseData,
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(
      '[OpenCode Error]',
      error,
    );

    if (stopEvents) {
      stopEvents();
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    await channel.send(
      [
        '❌ **OpenCode Error**',
        '',
        '```',
        errorMessage.slice(
          0,
          1800,
        ),
        '```',
      ].join('\n'),
    );
  } finally {
    if (stopEvents) {
      stopEvents();
    }

    running.delete(key);
  }
}