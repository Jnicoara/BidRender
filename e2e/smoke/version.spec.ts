/**
 * Recheck 4: an open tab is told when a newer build is live, and is never
 * reloaded under the person using it (client/src/components/NewVersionBar.tsx).
 *
 * The bar compares the page's own build stamp with /api/version. Waiting for
 * a real deploy cannot be part of a test, so the test answers /api/version
 * itself with a different commit — the exact condition a deploy creates.
 */
import { expect, test } from "@playwright/test";

test("an open tab is told about a newer build, and does not reload itself", async ({
  page,
  request,
}) => {
  const live = await (await request.get("/api/version")).json();
  test.skip(
    !live.commit,
    "this server has no build stamp (pnpm dev); the bar only exists in a real build"
  );

  await page.route("**/api/version", route =>
    route.fulfill({
      json: { ...live, commit: "ffffff0", builtAt: new Date().toISOString() },
    })
  );
  await page.goto("/#/dashboard");
  await page.evaluate(() => {
    (window as unknown as { __smokeMarker: number }).__smokeMarker = 1;
  });

  await expect(
    page.getByText("A new version of BidRidge is available")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Refresh/ })).toBeVisible();

  // Give an auto-reload every chance to happen; the marker would be gone.
  await page.waitForTimeout(3000);
  const marker = await page.evaluate(
    () => (window as unknown as { __smokeMarker?: number }).__smokeMarker
  );
  expect(marker, "the page reloaded by itself").toBe(1);
});
