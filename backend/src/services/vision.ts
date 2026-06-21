import { env } from '../config/env.js';
import type { ModelConfig } from '../lib/models.js';

export const VISION_SYSTEM_PROMPT = `You are a privacy and security analyst. Analyse the provided image and identify every element that could be used to locate or identify the subject. Return ONLY valid JSON in this exact schema — no other text:

{
  "risk_level": "low" | "medium" | "high" | "critical",
  "summary": "<1-2 sentence plain-English summary>",
  "findings": [
    {
      "type": "street_sign" | "house_number" | "license_plate" | "face" | "school_logo" | "reflection" | "landmark" | "window_view" | "other",
      "description": "<what you see>",
      "severity": "low" | "medium" | "high",
      "rough_location": "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right" | "full-image"
    }
  ]
}`;

const USER_TEXT = 'Analyse this image for privacy vulnerabilities.';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;

export interface VisionResult {
  /** Raw model text (expected to be JSON, but not guaranteed). */
  text: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function buildMessages(base64Image: string) {
  return [
    { role: 'system', content: VISION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
        { type: 'text', text: USER_TEXT },
      ],
    },
  ];
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Upstream ${res.status}: ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as ChatCompletion;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls the correct gateway for the chosen model and normalises the result.
 * `openrouterKeyOverride` lets a BYOK user supply their own OpenRouter key for
 * this single request; it is used transiently and never persisted.
 */
export async function runVisionScan(
  model: ModelConfig,
  base64Image: string,
  openrouterKeyOverride?: string,
): Promise<VisionResult> {
  let data: ChatCompletion;

  if (model.gateway === 'nvidia') {
    data = await postJson(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      { Authorization: `Bearer ${env.NVIDIA_NIM_API_KEY}` },
      {
        // NVIDIA hosts Llama 3.2 Vision under the `meta/` namespace. (The product
        // spec's `nvidia/...` id is the internal registry key only — see models.ts.)
        model: 'meta/llama-3.2-90b-vision-instruct',
        max_tokens: MAX_TOKENS,
        messages: buildMessages(base64Image),
      },
    );
  } else {
    data = await postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        Authorization: `Bearer ${openrouterKeyOverride || env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': env.APP_URL,
        'X-Title': 'Doxxing Shield',
      },
      {
        model: model.openrouterSlug,
        max_tokens: MAX_TOKENS,
        messages: buildMessages(base64Image),
      },
    );
  }

  return {
    text: data.choices?.[0]?.message?.content ?? '{}',
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

/** Best-effort parse of the model's JSON report; tolerant of code fences. */
export function parseReport(text: string): Record<string, unknown> {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return { risk_level: 'unknown', summary: text.slice(0, 500), findings: [] };
}
