/**
 * Scraper agent contract.
 *
 * The scraper runs as a first-class capability of the orchestrator. Unlike the
 * generalist planner agents, it is a deterministic worker: it performs
 * fetch/extract/redact and returns structured data. It is invoked through the
 * `scrape_task` job (see control-plane workers) rather than the LLM planner
 * path, keeping scraping deterministic, auditable, and cost-predictable.
 */

export interface ScraperAgentContract {
  id: string;
  name: string;
  kind: "scraper";
  description: string;
  capabilities: string[];
  /** Scraping is deterministic; no LLM budget is consumed by default. */
  consumesModelBudget: boolean;
  version: string;
}

export const SCRAPER_AGENT: ScraperAgentContract = {
  id: "agent_scraper",
  name: "Web Scraper",
  kind: "scraper",
  description:
    "Deterministic crawling, fetching, rendering, structured extraction, and PII redaction worker.",
  capabilities: [
    "robots-aware-crawl",
    "static-fetch",
    "js-render",
    "css-extract",
    "meta-extract",
    "jsonld-extract",
    "llm-extract",
    "pii-redact",
    "proxy-ready",
  ],
  consumesModelBudget: false,
  version: "0.1.0",
};
