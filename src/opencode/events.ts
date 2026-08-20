import { createOpencodeClient } from '@opencode-ai/sdk/client';

export interface OpenCodeProgress {
  type: 'tool' | 'text' | 'status';
  message: string;
}

export class OpenCodeEvents {
  private readonly client;

  constructor(baseUrl: string) {
    this.client = createOpencodeClient({
      baseUrl,
    });
  }

  async watchSession(
    sessionId: string,
    onProgress: (
      progress: OpenCodeProgress,
    ) => void,
  ): Promise<() => void> {
    const controller =
      new AbortController();

    const events =
      await this.client.event.subscribe({
        signal: controller.signal,
      });

    void (async () => {
      try {
        for await (
          const event of events.stream
        ) {
          this.handleEvent(
            event,
            sessionId,
            onProgress,
          );
        }
      } catch (error) {
        if (
          !controller.signal.aborted
        ) {
          console.error(
            '[OpenCode Events]',
            error,
          );
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }

  private handleEvent(
    event: any,
    sessionId: string,
    onProgress: (
      progress: OpenCodeProgress,
    ) => void,
  ): void {
    const properties =
      event?.properties;

    if (!properties) {
      return;
    }

    /*
     * Tool progress.
     */
    if (
      event.type ===
      'message.part.updated'
    ) {
      const part =
        properties.part;

      if (
        !part ||
        part.sessionID !==
          sessionId
      ) {
        return;
      }

      if (
        part.type === 'tool'
      ) {
        const tool =
          part.tool ?? 'tool';

        const state =
          part.state;

        if (
          state?.status ===
          'running'
        ) {
          onProgress({
            type: 'tool',
            message:
              `🔧 ${tool} sedang berjalan...`,
          });
        }

        if (
          state?.status ===
          'completed'
        ) {
          const title =
            state.title ||
            tool;

          onProgress({
            type: 'tool',
            message:
              `✅ ${tool} → ${title}`,
          });
        }

        if (
          state?.status ===
          'error'
        ) {
          onProgress({
            type: 'tool',
            message:
              `❌ ${tool} gagal`,
          });
        }
      }

      return;
    }

    /*
     * Session status.
     */
    if (
      event.type ===
      'session.status'
    ) {
      const session =
        properties.sessionID ??
        properties.session?.id;

      if (
        session !==
        sessionId
      ) {
        return;
      }

      const status =
        properties.status;

      if (
        status?.type ===
        'busy'
      ) {
        onProgress({
          type: 'status',
          message:
            '🤖 Agent sedang bekerja...',
        });
      }

      if (
        status?.type ===
        'idle'
      ) {
        onProgress({
          type: 'status',
          message:
            '✅ Agent selesai.',
        });
      }
    }
  }
}