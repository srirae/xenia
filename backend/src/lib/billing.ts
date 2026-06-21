import { MODEL_REGISTRY, type ModelId } from './models.js';

/**
 * Exact USD cost of a completed vision call, rounded to 6 decimal places to
 * match the numeric(10,6) precision of profiles.virtual_balance.
 */
export function calculateScanCost(
  modelId: string,
  tokensInput: number,
  tokensOutput: number,
): number {
  const model = MODEL_REGISTRY[modelId as ModelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const safeIn = Number.isFinite(tokensInput) ? Math.max(0, tokensInput) : 0;
  const safeOut = Number.isFinite(tokensOutput) ? Math.max(0, tokensOutput) : 0;

  const inputCost = (safeIn / 1_000_000) * model.inputPricePerMillion;
  const outputCost = (safeOut / 1_000_000) * model.outputPricePerMillion;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
