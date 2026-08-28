import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { parseRobots } from "../src/robots.ts";
import { extract } from "../src/extract.ts";
import { redactPII, redactValues } from "../src/pii.ts";
import { runScrapeJob, defaultConfig } from "../src/index.ts";
import { Agent } from "undici";

function startServer(routesOrFn: Record<string, { body: string; type?: string }> | ((base: string) => Record<string, { body: string; type?: string }>)) {
  let routes: Record<string, { body: string; type?: string }> = {};
  const server = http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0] ?? "/";
    const r = routes[url];
    if (!r) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("content-type", r.type || "text/html; charset=utf-8");
    res.end(r.body);
  });
  // Don't let accepted (keep-alive) sockets keep the test process alive.
  server.on("connection", (socket) => socket.unref());
  return new Promise<{ server: http.Server; base: string }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}`;
      routes = typeof routesOrFn === "function" ? routesOrFn(base) : routesOrFn;
      // Don't let the listening socket keep the test process alive.
      server.unref();
      resolve({ server, base });
    });
  });
}

test("robots.txt: disallow blocks matching path", () => {
  const txt = `User-agent: *\nDisallow: /private\nCrawl-delay: 1\nSitemap: https://example.com/sitemap.xml`;
  const rs = parseRobots(txt);
  assert.equal(rs.canFetch("Agent", "/"), true);
  assert.equal(rs.canFetch("Agent", "/private"), false);
  assert.equal(rs.canFetch("Agent", "/private/secret"), false);
  assert.equal(rs.canFetch("Agent", "/public"), true);
  assert.equal(rs.crawlDelay("Agent"), 1);
  assert.deepEqual(rs.sitemaps, ["https://example.com/sitemap.xml"]);
});

test("extract: applies CSS + attribute rules", async () => {
  const html = `<html><body>
    <h1 class="title">Hello</h1>
    <a href="/x">link</a>
    <ul><li>one</li><li>two</li></ul>
  </body></html>`;
  const out = await extract({
    html,
    url: "http://x/",
    mode: "css",
    rules: [
      { name: "heading", selector: "h1.title" },
      { name: "firstLink", selector: "a@href" },
      { name: "items", selector: "li", many: true },
    ],
  });
  assert.equal(out.data.heading, "Hello");
  assert.equal(out.data.firstLink, "/x");
  assert.deepEqual(out.data.items, ["one", "two"]);
});

test("pii: redacts emails, phones, cc, ip", () => {
  const r = redactPII("contact me at jane.doe@example.com or +1 415 555 0199, card 4111 1111 1111 1111, ip 10.0.0.5");
  assert.ok(r.found.includes("EMAIL"));
  assert.ok(r.found.includes("PHONE"));
  assert.ok(r.found.includes("CREDIT_CARD"));
  assert.ok(r.found.includes("IPV4"));
  assert.ok(!r.text.includes("jane.doe@example.com"));
  assert.ok(r.text.includes("[EMAIL]"));
});

test("pii: redactValues handles arrays", () => {
  const { data, found } = redactValues({ emails: ["a@b.com", "c@d.com"] }, true);
  assert.deepEqual(data.emails, ["[EMAIL]", "[EMAIL]"]);
  assert.ok(found.includes("EMAIL"));
});

test("end-to-end: crawl seeds, follow links, extract, redact", async () => {
  const { server, base } = await startServer((b) => ({
    "/robots.txt": { body: "User-agent: *\nDisallow:\n", type: "text/plain" },
    "/page1": {
      body: `<html><body>
        <h1>Page One</h1>
        <p>Email support@site.com for help.</p>
        <a href="${b}/page2">next</a>
      </body></html>`,
    },
    "/page2": {
      body: `<html><body><h1>Page Two</h1><p>Done.</p></body></html>`,
    },
  }));

  const agent = new Agent({ keepAliveTimeout: 100 });
  try {
    const result = await runScrapeJob(
      defaultConfig({
        seeds: [`${base}/page1`],
        depth: 1, render: "static",
        followLinks: true,
        maxPages: 5,
        extract: "css",
        rules: [{ name: "title", selector: "h1" }],
        respectRobots: true,
        politenessDelayMs: 0,
        proxyDispatcher: agent,
      })
    );

    assert.ok(result.pages.length >= 2, `expected >=2 pages, got ${result.pages.length}`);
    const p1 = result.pages.find((p) => p.url.endsWith("/page1"));
    const p2 = result.pages.find((p) => p.url.endsWith("/page2"));
    assert.ok(p1, "page1 fetched");
    assert.ok(p2, "page2 discovered via link");
    assert.equal(p1?.data.title, "Page One");
    assert.deepEqual(p1?.piiFound, ["EMAIL"]);
    assert.equal(result.stats.pagesSucceeded, 2);
    assert.equal(result.stats.robotsBlocked, 0);
  } finally {
    server.closeAllConnections?.();
    server.close();
    await agent.close().catch(() => {});
  }
});

test("end-to-end: robots disallow respected", async () => {
  const { server, base } = await startServer({
    "/robots.txt": { body: "User-agent: *\nDisallow: /secret\n", type: "text/plain" },
    "/secret": { body: "<html><body><h1>Hidden</h1></body></html>" },
  });
  const agent = new Agent({ keepAliveTimeout: 100 });
  try {
    const result = await runScrapeJob(
      defaultConfig({
        seeds: [`${base}/secret`],
        depth: 0, render: "static",
        respectRobots: true,
        politenessDelayMs: 0,
        proxyDispatcher: agent,
      })
    );
    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0]?.robotsBlocked, true);
    assert.equal(result.stats.robotsBlocked, 1);
  } finally {
    server.closeAllConnections?.();
    server.close();
    await agent.close().catch(() => {});
  }
});
