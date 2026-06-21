/**
 * Model registry — the single source of truth for which vision models are
 * allowed and how they are priced. The frontend may only ever send one of
 * these exact IDs; anything else is rejected at the route (prevents injection
 * of arbitrary upstream model strings).
 */

export type ModelId =
  | 'nvidia/llama-3.2-90b-vision-instruct'
  | 'anthropic/claude-3.5-haiku'
  | 'openai/gpt-4o'
  | 'anthropic/claude-3.5-sonnet'
  | 'anthropic/claude-opus-4.8-fast';

export interface ModelConfig {
  id: ModelId;
  label: string;
  tier: 'free' | 'paid';
  inputPricePerMillion: number; // USD per 1M input tokens
  outputPricePerMillion: number; // USD per 1M output tokens
  gateway: 'nvidia' | 'openrouter';
  openrouterSlug?: string;
}

export const MODEL_REGISTRY: Record<ModelId, ModelConfig> = {
  'nvidia/llama-3.2-90b-vision-instruct': {
    id: 'nvidia/llama-3.2-90b-vision-instruct',
    label: '⚡ Fast (NVIDIA NIM) — Default',
    tier: 'free',
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    gateway: 'nvidia',
  },
  'anthropic/claude-3.5-haiku': {
    id: 'anthropic/claude-3.5-haiku',
    label: '💎 Claude 3.5 Haiku',
    tier: 'paid',
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
    gateway: 'openrouter',
    openrouterSlug: 'anthropic/claude-3.5-haiku',
  },
  'openai/gpt-4o': {
    id: 'openai/gpt-4o',
    label: '🔵 GPT-4o',
    tier: 'paid',
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
    gateway: 'openrouter',
    openrouterSlug: 'openai/gpt-4o',
  },
  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    label: '🟠 Claude 3.5 Sonnet',
    tier: 'paid',
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    gateway: 'openrouter',
    openrouterSlug: 'anthropic/claude-3.5-sonnet',
  },
  'anthropic/claude-opus-4.8-fast': {
    id: 'anthropic/claude-opus-4.8-fast',
    label: '🔴 Claude Opus 4.8 — Frontier',
    tier: 'paid',
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 50.0,
    gateway: 'openrouter',
    openrouterSlug: 'anthropic/claude-opus-4.8-fast',
  },
};

export const ALLOWED_MODEL_IDS = new Set<string>(Object.keys(MODEL_REGISTRY));

export const DEFAULT_MODEL_ID: ModelId = 'nvidia/llama-3.2-90b-vision-instruct';

export function isModelId(value: string): value is ModelId {
  return ALLOWED_MODEL_IDS.has(value);
}

/** Public, price-only view of the registry — safe to serve to the frontend. */
export function publicModelCatalog() {
  return Object.values(MODEL_REGISTRY).map((m) => ({
    id: m.id,
    label: m.label,
    tier: m.tier,
    inputPricePerMillion: m.inputPricePerMillion,
    outputPricePerMillion: m.outputPricePerMillion,
  }));
}
