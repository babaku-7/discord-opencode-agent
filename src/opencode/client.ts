import { createOpencodeClient } from '@opencode-ai/sdk/client';
import { config } from '../config.js';
import { MODELS, type AgentModel } from '../models.js';

export class OpenCodeClient {
  private readonly client;

  constructor() {
    this.client = createOpencodeClient({ baseUrl: config.opencodeUrl });
  }

  getWorkspace(): string { return config.workspace; }

  async createSession(title?: string) {
    return this.client.session.create({
      query: { directory: config.workspace },
      body: { title: title ?? 'Discord Coding Session' },
    });
  }

  async sendPrompt(sessionId: string, prompt: string, model: AgentModel = 'cohere') {
    const selected = MODELS[model];
    return this.client.session.prompt({
      path: { id: sessionId },
      query: { directory: config.workspace },
      body: {
        model: { providerID: selected.providerID, modelID: selected.modelID },
        agent: 'build',
        parts: [{ type: 'text', text: prompt }],
      },
    });
  }

  async abortSession(sessionId: string) {
    return this.client.session.abort({ path: { id: sessionId }, query: { directory: config.workspace } });
  }
}
