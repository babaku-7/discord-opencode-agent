export type AgentModel = 'cohere' | 'gemini';

export const MODELS: Record<AgentModel, { providerID: string; modelID: string; label: string }> = {
  cohere: { providerID: 'cohere', modelID: 'north-mini-code-1-0', label: 'Cohere North Mini Code' },
  gemini: { providerID: 'google', modelID: 'gemini-3.1-flash-lite', label: 'Google Gemini 3.1 Flash-Lite' },
};
