import { createOpencodeClient } from '@opencode-ai/sdk/client';

export type AgentModel = 'cohere' | 'gemini';

export const MODELS: Record<
  AgentModel,
  {
    providerID: string;
    modelID: string;
    label: string;
  }
> = {
  cohere: {
    providerID: 'cohere',
    modelID: 'north-mini-code-1-0',
    label: 'Cohere North Mini Code',
  },

  gemini: {
    providerID: 'google',
    modelID: 'gemini-3.1-flash-lite',
    label: 'Google Gemini 3.1 Flash-Lite',
  },
};

export class OpenCodeClient {
  private client;

  private readonly workspace =
    process.env['OPENCODE_WORKSPACE'] ||
    '/home/babaku/ai-workspace/projects';

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
        title:
          title || 'Discord Coding Session',
      },
    });
  }

  async sendPrompt(
    sessionId: string,
    prompt: string,
    model: AgentModel = 'cohere',
  ) {
    const selectedModel = MODELS[model];

    return this.client.session.prompt({
      path: {
        id: sessionId,
      },

      query: {
        directory: this.workspace,
      },

      body: {
        model: {
          providerID:
            selectedModel.providerID,

          modelID:
            selectedModel.modelID,
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

  async abortSession(
    sessionId: string,
  ) {
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