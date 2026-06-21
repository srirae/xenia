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
      "rough_location": "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right" | "full-image",
      "bbox": { "x": <number>, "y": <number>, "w": <number>, "h": <number> }
    }
  ]
}

COORDINATE RULES for "bbox" (this drives automatic redaction, so accuracy is critical):
- All four values are PERCENTAGES of the image, each 0–100. The origin (0,0) is the TOP-LEFT corner; x increases rightward, y increases downward.
- "x","y" = the top-left corner of the box. "w","h" = its width and height.
- Make the box as TIGHT as possible around ONLY the sensitive element (e.g. just the license plate, just the readable sign, just the face) — never the whole quadrant. A human reading the redacted image must not be able to recover the detail, but nothing harmless should be covered.
- Keep the box fully inside the image: x + w <= 100 and y + h <= 100.
- "rough_location" must still be filled in and should agree with the bbox (it is the fallback if a box is ever missing).
- Every finding MUST include a bbox.`;

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
 */
export async function runVisionScan(
  model: ModelConfig,
  base64Image: string,
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
    // Every OpenRouter call is a paid ("credit") or admin scan, so it bills
    // against the dedicated credit key and is served the single configured
    // credit model — NOT the per-model openrouterSlug. (Falls back to the
    // legacy key only if the credit key is somehow unset.)
    const openrouterKey = env.CREDIT_API_KEY_OPENROUTER || env.OPENROUTER_API_KEY;
    data = await postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        Authorization: `Bearer ${openrouterKey}`,
        'HTTP-Referer': env.APP_URL,
        'X-Title': 'Xyris Vision',
      },
      {
        model: env.MODEL_API_USERS_OPENROUTER,
        reasoning_effort: 'xhigh',
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
