import { expect, test } from "@playwright/test";

/**
 * Sparkplug B in the browser (#1720).
 *
 * The unit, integration and live layers drive the provider directly, so they say the code is
 * right and nothing about whether a user can reach it. What a new type-id needs in order to be
 * SELECTABLE lives outside the provider - the picker, the dialog's fields, the labels and the
 * read-only declaration are all `DatabaseUIConfig` and `READ_ONLY_ENFORCED` - which is why this
 * runs in a browser.
 *
 * Two of these tests reach the fixture of `docker/sparkplug/compose-service.yml` on
 * 127.0.0.1:1884. The rest are answered before any socket opens.
 *
 * ABSENCE IS ASSERTED HERE TOO, and on purpose: a spec that only claims what IS drawn passes
 * just as well on a dialog that draws everything. Sparkplug reads three connection fields and
 * no credential, so the user and password boxes must NOT be there; the connection-string toggle
 * must not be there either, because a broker address has no URI form that says more.
 */
const EMPTY_GROUP_HINT =
  "One Sparkplug group id, or empty for every group. A group is a level of the topic and nothing else: " +
  "it is not a thing on the broker that can be subscribed to on its own, so an empty field reads every " +
  "group under spBv1.0 and a filled one reads that group alone.";

const READ_ONLY_HINT =
  "Sparkplug connections are read-only whether or not this is ticked, and not by a setting: this " +
  "provider's encoder has no function that writes a PUBLISH, and its CONNECT carries no Will, which is " +
  "how a death certificate would be registered.";

test.describe("Sparkplug B in the connection dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("user@libredb.org");
    await page.locator('input[type="password"]').fill("test-user");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("/");
    await expect(page.locator("text=Query 1").first()).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "New connection", exact: true }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
  });

  test("is offered as its own driver", async ({ page }) => {
    await expect(
      page.locator('[role="dialog"]').getByRole("button", { name: "Sparkplug B", exact: true }),
    ).toBeVisible();
  });

  test("prefills 1883, the MQTT port Sparkplug runs over, and offers no connection string", async ({ page }) => {
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();

    await expect(dialog.locator('input[value="1883"]')).toBeVisible();
    await expect(dialog.getByText("Connection String", { exact: true })).toHaveCount(0);
  });

  test("draws three boxes and NO credential boxes, because the read touches none", async ({ page }) => {
    // The absence half. A user and a password here would be collected and dropped: the provider
    // reads `host`, `port` and `database` and nothing else, so a box for either would be a
    // promise the read does not keep.
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();

    await expect(dialog.locator("#host")).toBeVisible();
    await expect(dialog.locator("#database")).toBeVisible();
    await expect(dialog.locator("#user")).toHaveCount(0);
    await expect(dialog.locator("#password")).toHaveCount(0);
    // MQTT, which Sparkplug runs over, draws six boxes here and an insecure-auth toggle with
    // them; this provider reads three and declares no credential, so that toggle is absent too.
    await expect(dialog.locator("#allowInsecureAuth")).toHaveCount(0);
  });

  test("the Database box is NOT called Database, because the word would name the wrong thing", async ({ page }) => {
    // A group is a level of the topic, not a database on the broker, and the dialog says so by
    // never using the house word for this box. The absence is the claim.
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();

    await expect(dialog.getByText("Group", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Database", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Schema", { exact: true })).toHaveCount(0);
  });

  test("the Database box is labelled Group, with the hint that says what an empty one reads", async ({ page }) => {
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();

    await expect(dialog.getByText("Group", { exact: true })).toBeVisible();
    await expect(dialog.getByText(EMPTY_GROUP_HINT, { exact: true })).toBeVisible();
    // The placeholder is empty rather than an example, because an empty field is a MEANING here
    // (every group) and a greyed-out example would read as the value it takes when left alone.
    await expect(dialog.locator("#database")).toHaveAttribute("placeholder", "");
  });

  test("draws the Read-only toggle, whose hint says the mode is not what makes it read-only", async ({ page }) => {
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();

    const box = dialog.getByLabel("Read-only", { exact: true });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await expect(dialog.locator("#readOnly")).toHaveAttribute("aria-describedby", "readOnly-hint");
    await expect(dialog.getByText(READ_ONLY_HINT, { exact: true })).toBeVisible();
  });

  test("a group holding an MQTT filter character is refused before any socket opens", async ({ page }) => {
    // `+`, `#` and `/` are filter characters: a group holding one would either widen the
    // subscription past that group or make the filter invalid, and escaping it would hide the
    // mistake. The refusal lands before the dial, which is what this asserts.
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();
    await dialog.locator("#host").fill("127.0.0.1");
    await dialog.locator("#database").fill("Plant/Line1");
    await dialog.getByRole("button", { name: "Test Connection", exact: true }).click();

    await expect(dialog.getByTestId("connection-test-result")).toContainText(
      'A group name cannot contain "+", "#" or "/"',
      { timeout: 15000 },
    );
  });

  test("Test Connection reaches the fixture broker, with the Group left empty", async ({ page }) => {
    // Needs `docker compose -f docker/sparkplug/compose-service.yml up -d`. The empty Group is
    // the case the dialog's own hint promises: every group under spBv1.0.
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();
    await dialog.locator("#host").fill("127.0.0.1");
    await dialog.locator("#port").fill("1884");
    await dialog.getByRole("button", { name: "Test Connection", exact: true }).click();

    // "Connected successfully" is the DIALOG's word. The route answers "Connection successful",
    // and asserting that string here passed every layer below and failed on the screen, which is
    // the one thing this layer is for.
    await expect(dialog.getByTestId("connection-test-result")).toContainText("Connected successfully", {
      timeout: 30000,
    });
  });

  test("a port with no broker is refused with a sentence that is not about an empty plant", async ({ page }) => {
    // The other half of the test above, and the distinction the provider exists to keep: nothing
    // listening is not the same as a broker with nothing on it.
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Sparkplug B", exact: true }).click();
    await dialog.locator("#host").fill("127.0.0.1");
    await dialog.locator("#port").fill("1");
    await dialog.getByRole("button", { name: "Test Connection", exact: true }).click();

    const result = dialog.getByTestId("connection-test-result");
    await expect(result).toContainText("Nothing was read", { timeout: 20000 });
    await expect(result).toContainText("not an empty broker", { timeout: 20000 });
  });
});
