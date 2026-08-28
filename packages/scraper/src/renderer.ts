/**
 * Optional JS rendering via Playwright.
 *
 * Many modern pages require a real browser to execute client-side rendering.
 * This module dynamically imports `playwright` so the core engine has no hard
 * dependency on it; when Playwright (or its browsers) is unavailable the
 * caller falls back to static fetching (see crawler.ts).
 */

import type { FetchOptions } from "./fetcher.ts";
import { fetchWithRetry } from "./fetcher.ts";

export interface RenderResult {
  html: string;
  rendered: boolean;
}

/** Render a URL in a headless browser and return the post-JS DOM HTML. */
export async function renderPage(
  url: string,
  _opts: FetchOptions = {},
  timeoutMs = 20000
): Promise<string> {
  let playwright: { chromium?: { launch: (o?: unknown) => Promise<BrowserLike> } };
  try {
    playwright = (await import("playwright" as string)) as typeof playwright;
  } catch {
    throw new Error("playwright is not installed; cannot render JS. Use render:'static'.");
  }
  if (!playwright.chromium) {
    throw new Error("playwright.chromium unavailable; cannot render JS.");
  }
  const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
      const html = await page.content();
      return html;
    } finally {
      clearTimeout(timer);
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

interface BrowserLike {
  newPage(): Promise<{ goto: (u: string, o: unknown) => Promise<void>; content: () => Promise<string>; close: () => Promise<void> }>;
  close(): Promise<void>;
}

/**
 * Acquire HTML for a URL, honoring the render mode.
 * 'js'  -> browser render (throws if unavailable)
 * 'auto'-> browser render, fall back to static on failure
 * 'static' (default) -> plain HTTP GET
 */
export async function acquireHtml(
  url: string,
  mode: "auto" | "static" | "js",
  opts: FetchOptions = {}
): Promise<RenderResult> {
  if (mode === "static") {
    const res = await fetchWithRetry(url, { ...opts, retries: opts.retries ?? 2 });
    return { html: res.html, rendered: false };
  }
  try {
    const html = await renderPage(url, opts);
    return { html, rendered: true };
  } catch (e) {
    if (mode === "js") throw e;
    // auto: degrade to static fetch
    const res = await fetchWithRetry(url, { ...opts, retries: opts.retries ?? 2 });
    return { html: res.html, rendered: false };
  }
}
