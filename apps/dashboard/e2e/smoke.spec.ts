import { test, expect } from "@playwright/test";

test.describe("Dashboard smoke", () => {
  test("login shell renders and sign-in reveals the app shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Agency OS").first()).toBeVisible();
    const signIn = page.getByRole("button", { name: /sign in/i });
    await expect(signIn).toBeVisible();

    // Sign in (smoke key; backend queries may error but the shell must mount).
    await page.getByPlaceholder(/paste API key/i).fill("cpk_smoke");
    await signIn.click();

    // The authenticated shell (sidebar brand) must appear.
    await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Mission Control")).toBeVisible();
  });

  test("navigation reaches key enterprise pages", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/paste API key/i).fill("cpk_smoke");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText("Mission Control")).toBeVisible();

    for (const path of ["/projects", "/approvals", "/security", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });
});
