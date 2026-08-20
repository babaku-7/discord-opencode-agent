import { createOpencodeClient } from '@opencode-ai/sdk/client';

export class OpenCodeClient {
  private client;

  private readonly workspace =
    process.env['OPENCODE_WORKSPACE'] ||
    '/home/babaku/ai-workspace/projects';

  private readonly providerID = 'cohere';
  private readonly modelID = 'north-mini-code-1-0';

  constructor() {
    this.client = createOpencodeClient({
      baseUrl:
        process.env['OPENCODE_URL'] ||
        'http://127.0.0.1:4096',
    });
  }

  getWorkspace(): string {
    return this.workspace;
  }

  async createSession(title?: string) {
    return this.client.session.create({
      query: {
        directory: this.workspace,
      },
      body: {
        title: title || 'Discord Coding Session',
      },
    });
  }

  async sendPrompt(
    sessionId: string,
    prompt: string,
  ) {
    return this.client.session.prompt({
      path: {
        id: sessionId,
      },
      query: {
        directory: this.workspace,
      },
      body: {
        model: {
          providerID: this.providerID,
          modelID: this.modelID,
        },
        agent: 'build',
        parts: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    });
  }

  async abortSession(sessionId: string) {
    return this.client.session.abort({
      path: {
        id: sessionId,
      },
      query: {
        directory: this.workspace,
      },
    });
  }
}
