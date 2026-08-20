import type { AgentModel } from './models.js';

export const sessions = new Map<string, string>();
export const running = new Set<string>();
export const selectedModels = new Map<string, AgentModel>();
