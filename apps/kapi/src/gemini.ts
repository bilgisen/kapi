/**
 * S3-2: Gemini REST client (hono gemini-client referansı; SDK bağımlılığı yok).
 * REST: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 */
import { extractJson } from "./prompt";

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
}

/** Tek çağrı: system prompt + kullanıcı promptu -> ham JSON (validator çağırana ait). */
export async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options: GeminiOptions = {}
): Promise<unknown> {
  const model = options.model ?? "gemini-2.5-flash";
  const maxRetries = options.maxRetries ?? 3;
  const url = `${GEMINI_BASE}/${model}:generateContent`;

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            topP: 0.85,
            maxOutputTokens: options.maxOutputTokens ?? 2048,
            responseMimeType: "application/json",
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini yanıtında metin yok");
      const raw = extractJson(text);
      if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        throw new Error("Gemini çıktısı token limitine takıldı (MAX_TOKENS)");
      }
      return raw;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }
  throw lastErr ?? new Error("Gemini çağrısı başarısız");
}

import { validateAnalysis, type AnalysisOutput } from "./prompt";

/** S3-2: geriye uyumlu — Analiz şemasıyla doğrular (K2/K3 yolu). */
export async function analyzeWithGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options: GeminiOptions = {}
): Promise<AnalysisOutput> {
  const raw = await callGemini(apiKey, systemPrompt, userPrompt, options);
  return validateAnalysis(raw);
}
