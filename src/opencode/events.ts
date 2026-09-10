import { createOpencodeClient } from '@opencode-ai/sdk/client';

export interface OpenCodeProgress {
  type: 'tool' | 'text' | 'status';
  message: string;
}

function humanizeToolName(tool: string): string {
  switch (tool.toLowerCase()) {
    case 'read':
      return 'membaca file';
    case 'write':
      return 'menulis file';
    case 'bash':
    case 'shell':
      return 'menjalankan perintah';
    case 'edit':
      return 'mengedit file';
    case 'grep':
      return 'mencari kode';
    case 'search':
      return 'mencari referensi';
    default:
      return tool;
  }
}

function formatToolMessage(tool: string, status: 'running' | 'completed' | 'error', details?: string): string {
  const label = humanizeToolName(tool);

  if (status === 'running') {
    return `${label} sedang berjalan${details ? `: ${details}` : '...'}`;
  }

  if (status === 'completed') {
    return `${label} selesai${details ? `: ${details}` : ''}`;
  }

  return `${label} gagal${details ? `: ${details}` : ''}`;
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
        const detail =
          typeof state?.title === 'string'
            ? state.title
            : typeof state?.summary === 'string'
              ? state.summary
              : undefined;

        if (
          state?.status ===
          'running'
        ) {
          onProgress({
            type: 'tool',
            message: formatToolMessage(tool, 'running', detail),
          });
        }

        if (
          state?.status ===
          'completed'
        ) {
          onProgress({
            type: 'tool',
            message: formatToolMessage(tool, 'completed', detail),
          });
        }

        if (
          state?.status ===
          'error'
        ) {
          onProgress({
            type: 'tool',
            message: formatToolMessage(tool, 'error', detail),
          });
        }
      }

      return;
    }

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
            'Agent sedang menganalisis dan menyiapkan solusi...',
        });
      }

      if (
        status?.type ===
        'idle'
      ) {
        onProgress({
          type: 'status',
          message:
            'Agent selesai dan siap mengirim hasil.',
        });
      }
    }
  }
}