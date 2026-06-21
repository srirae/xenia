// Client-side mirror of the backend model registry — labels + tier only.
// Pricing/gateway details and the master keys stay server-side. The backend is
// the authority; this exists purely so the UI can render the switcher/labels.

export interface ClientModel {
  id: string;
  label: string;
  tier: 'free' | 'paid';
}

export const DEFAULT_MODEL_ID = 'nvidia/llama-3.2-90b-vision-instruct';

export const CLIENT_MODELS: ClientModel[] = [
  { id: 'nvidia/llama-3.2-90b-vision-instruct', label: '⚡ Fast (NVIDIA NIM) — Default', tier: 'free' },
  { id: 'anthropic/claude-3.5-haiku', label: '💎 Claude 3.5 Haiku', tier: 'paid' },
  { id: 'openai/gpt-4o', label: '🔵 GPT-4o', tier: 'paid' },
  { id: 'anthropic/claude-3.5-sonnet', label: '🟠 Claude 3.5 Sonnet', tier: 'paid' },
  { id: 'anthropic/claude-opus-4.8-fast', label: '🔴 Claude Opus 4.8 — Frontier', tier: 'paid' },
];

// Approximate per-scan cost guidance for the billing page (display only).
export const MODEL_COST_HINTS: Array<{ label: string; perScan: string }> = [
  { label: '⚡ NVIDIA NIM (default)', perScan: 'included, no deduction' },
  { label: '💎 Claude Haiku', perScan: '~$0.001 / scan' },
  { label: '🔵 GPT-4o', perScan: '~$0.003 / scan' },
  { label: '🟠 Claude Sonnet', perScan: '~$0.004 / scan' },
  { label: '🔴 Claude Opus 4.8', perScan: '~$0.008 / scan' },
];
