/**
 * Content extraction.
 *
 * Supports declarative CSS/attribute rules, automatic meta (OpenGraph) +
 * JSON-LD extraction, and an optional LLM extraction callback for free-form
 * structured extraction. Designed to be pure and testable.
 */

import { load, type CheerioAPI } from "cheerio";
import type { ExtractMode, ExtractRule, LlmExtractor } from "./types.ts";

type Root = CheerioAPI;

export interface ExtractInput {
  html: string;
  url: string;
  mode: ExtractMode;
  rules?: ExtractRule[];
  llmExtract?: LlmExtractor;
}

export interface ExtractOutput {
  data: Record<string, unknown>;
  jsonLd: unknown[];
}

function parseRule(rule: ExtractRule): { selector: string; attribute?: string; many: boolean } {
  let selector = rule.selector;
  let attribute = rule.attribute;
  const at = selector.indexOf("@");
  if (at >= 0) {
    attribute = selector.slice(at + 1);
    selector = selector.slice(0, at);
  }
  return { selector: selector.trim(), attribute: attribute?.trim() || undefined, many: !!rule.many };
}

function applyRule($: Root, rule: ExtractRule): unknown {
  const { selector, attribute, many } = parseRule(rule);
  const els = $(selector);
  if (els.length === 0) return many ? [] : null;
  const read = (i: number): string => {
    const el = els.eq(i);
    if (attribute) return el.attr(attribute) ?? "";
    return el.text().replace(/\s+/g, " ").trim();
  };
  if (many) return els.toArray().map((_, i) => read(i));
  return read(0);
}

function extractMeta($: Root): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const title = $("title").first().text().trim();
  if (title) out.title = title;
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) out.canonical = canonical;
  const metaTags = [
    "description",
    "keywords",
    "author",
    "og:title",
    "og:description",
    "og:image",
    "og:type",
    "twitter:title",
    "twitter:description",
    "article:published_time",
  ];
  for (const name of metaTags) {
    const c = $(`meta[property="${name}"]`).attr("content") ?? $(`meta[name="${name}"]`).attr("content");
    if (c) out[name.replace(/^og:/, "og_").replace(/^twitter:/, "tw_")] = c;
  }
  return out;
}

function extractJsonLd($: Root): unknown[] {
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    try {
      const parsed = JSON.parse(txt);
      out.push(Array.isArray(parsed) ? parsed : [parsed]);
    } catch {
      /* ignore malformed json-ld */
    }
  });
  return out.flat();
}

function collectLinks($: Root, baseUrl: string): string[] {
  const out = new Set<string>();
  const base = new URL(baseUrl);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, base);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      abs.hash = "";
      out.add(abs.toString());
    } catch {
      /* skip invalid */
    }
  });
  return [...out];
}

export async function extract(input: ExtractInput): Promise<ExtractOutput> {
  const $ = load(input.html);
  const jsonLd = extractJsonLd($);
  const data: Record<string, unknown> = {};

  if (input.mode === "meta") {
    Object.assign(data, extractMeta($));
  } else if (input.mode === "llm") {
    if (input.llmExtract) {
      Object.assign(data, await input.llmExtract(input.html, input.url));
    } else {
      Object.assign(data, extractMeta($));
    }
  } else if (input.mode === "css") {
    for (const rule of input.rules ?? []) data[rule.name] = applyRule($, rule);
  } else {
    // auto: rules if provided, else meta + jsonld summary
    if (input.rules?.length) {
      for (const rule of input.rules) data[rule.name] = applyRule($, rule);
    } else {
      Object.assign(data, extractMeta($));
    }
  }

  return { data, jsonLd };
}

export { collectLinks };

/** Plain visible text of a page (tags stripped), used for page-level PII scan. */
export function extractText(html: string): string {
  const $ = load(html);
  const text = $("body").text() || $("html").text() || "";
  return text.replace(/\s+/g, " ").trim();
}
