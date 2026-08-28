import { test, expect } from "@playwright/test";

// The dashboard auto-authenticates against a local control plane via its
// built-in `demo-key` fallback (see src/api.ts), so the interactive Login
// form is not reachable in automation. The smoke therefore verifies the real
// goal: the app shell mounts and every primary route renders its page title.
// CI starts the control plane with ADMIN_BOOTSTRAP_KEY=demo-key so the default
// key is valid and the pages are data-backed.
test.describe("Dashboard smoke", () => {
  test("app shell mounts on the overview", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Agency OS").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mission Control", level: 1 })).toBeVisible();
  });

  test("navigation reaches key enterprise pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible({ timeout: 10000 });

    for (const path of ["/projects", "/approvals", "/security", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });
});
