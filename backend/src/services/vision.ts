import { env } from '../config/env.js';
import type { ModelConfig } from '../lib/models.js';

export const VISION_SYSTEM_PROMPT = `You are an extremely meticulous privacy and security analyst. Analyse the provided image and identify every element that could be used to locate, fingerprint, or identify the subject or the environment.

Be exhaustive: faces, text, badges, QR codes, reflections, street signs, license plates, landmarks, logos, and any minute detail. DO NOT limit yourself to predefined categories.

Return ONLY valid JSON — no markdown, no explanation, nothing else:

{
  "risk_level": "low" | "medium" | "high" | "critical",
  "summary": "<1-2 sentence plain-English summary>",
  "findings": [
    {
      "type": "face" | "text" | "badge" | "qr_code" | "license_plate" | "street_sign" | "reflection" | "landmark" | "logo" | "other",
      "label": "<short human label e.g. 'Full name on badge'>",
      "description": "<exact description of what was found>",
      "severity": "low" | "medium" | "high",
      "bbox": [x_min_pct, y_min_pct, x_max_pct, y_max_pct],
      "polygon": [[x1_pct,y1_pct],[x2_pct,y2_pct],...]
    }
  ]
}

CRITICAL RULES:
1. bbox and polygon coordinates are PERCENTAGES from 0–100 of the image dimensions (0,0 = top-left corner).
2. polygon must trace the actual SHAPE of the element tightly (8–16 points for curved shapes like faces, 4–6 for rectangular objects like badges/signs/text). Follow the real contour — not a rough box.
3. For a face: trace hairline, jaw, ears, chin. For a badge: follow its physical rounded rectangle. For text lines: tight box around the glyphs. For QR code: exact square of the code.
4. Return at minimum 4 polygon points. For simple rectangles return exactly 4 corner points.`;

const USER_TEXT = 'Analyse this image for all privacy vulnerabilities. Be precise with polygon outlines.';
const MAX_TOKENS = 2048;
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
