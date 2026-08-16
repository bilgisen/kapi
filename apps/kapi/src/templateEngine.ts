/**
 * S9-2: Şablon eşleştirme motoru (K1) — saf TS, deterministik.
 *
 * normalize() kural motorundan (rules.ts) alınır; metinler normalizasyon sonrası
 * aranır. İlk eşleşen kalıp kazanır (templates.ts sırası = öncelik).
 * patterns'teki named/plain capture grupları {m1, m2, ...} olarak render'a geçer.
 */

import { normalize } from "./rules";
import { TEMPLATES, type TemplateDef } from "./templates";

export interface TemplateResult {
  templateId: string;
  category: string;
  summary_tr: string;
  impact_analysis: string;
  fields: Record<string, string>;
}

export interface TemplateInput {
  subject?: string | null;
  title?: string | null;
  summary?: string | null;
  disclosureBody?: string | null;
}

export function matchTemplate(input: TemplateInput): TemplateResult | null {
  const subject = normalize(input.subject);
  const title = normalize(input.title);
  const summary = normalize(input.summary);
  const body = normalize(input.disclosureBody);
  const haystack = `${title} ${subject} ${summary} ${body}`;

  for (const tpl of TEMPLATES) {
    if (!tpl.match.keys.some((k) => haystack.includes(normalize(k)))) continue;
    const fields: Record<string, string> = {};
    let captureIdx = 1;
    for (const pattern of tpl.match.patterns ?? []) {
      const m = haystack.match(pattern);
      if (!m) continue;
      for (let i = 1; i < m.length && m[i] !== undefined; i++) {
        if (!fields[`m${captureIdx}`]) fields[`m${captureIdx}`] = m[i];
        captureIdx += 1;
      }
    }
    const rendered = tpl.render(fields);
    return {
      templateId: tpl.id,
      category: tpl.category,
      summary_tr: rendered.summary_tr,
      impact_analysis: rendered.impact_analysis,
      fields,
    };
  }
  return null;
}

/** Şablon eşleşme sayısı (istatistik/ölçüm için) */
export function countTemplateMatches(input: TemplateInput): number {
  let hits = 0;
  const subject = normalize(input.subject);
  const title = normalize(input.title);
  const summary = normalize(input.summary);
  const body = normalize(input.disclosureBody);
  const haystack = `${title} ${subject} ${summary} ${body}`;
  for (const tpl of TEMPLATES) {
    if (tpl.match.keys.some((k) => haystack.includes(normalize(k)))) hits += 1;
  }
  return hits;
}

export type { TemplateDef };