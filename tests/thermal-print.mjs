// Read-only browser/PDF checks; launched against a disposable database by printing.py.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import assert from "node:assert/strict";
import fs from "node:fs";
const launch = { headless: true };
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launch);
const results = [];
const base = process.env.APG_TEST_URL;
assert.ok(
  base && process.env.APG_TEST_PASSWORD,
  "Run this through tests/printing.py",
);
const output = process.env.APG_PRINT_OUTPUT;
fs.mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/?view=deliveries");
  await page.locator("#f-username").fill(process.env.APG_TEST_USERNAME);
  await page.locator("#f-password").fill(process.env.APG_TEST_PASSWORD);
  await page.locator('#auth-form [type="submit"]').click();
  await page.locator('[data-action="delivery"]').first().waitFor();
  await page.locator('[data-action="delivery"]').first().click();
  await page
    .getByRole("button", { name: "Print receipt", exact: true })
    .click();
  await page.locator("#print-preview[open]").waitFor();
  assert.equal(await page.locator("#thermal-width").inputValue(), "80");
  results.push(
    "delivery print opens dedicated preview rather than printing desktop modal",
  );
  const pdfs = [];
  async function validate(kind, width) {
    await page.locator("#thermal-width").selectOption(width);
    const overflow = await page
      .locator("#thermal-preview-sheet .thermal-slip")
      .evaluate((root) =>
        [...root.querySelectorAll("*")]
          .filter(
            (el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
          )
          .map((el) => ({
            class: el.className,
            text: el.textContent.slice(0, 90),
            width: el.clientWidth,
            scroll: el.scrollWidth,
          })),
      );
    assert.deepEqual(overflow, [], kind + " " + width + " overflow");
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("#app").isVisible(), false);
    assert.equal(await page.locator("#thermal-print").isVisible(), true);
    assert.equal(await page.locator("#thermal-print table").count(), 0);
    const path = `${output}/apg-${kind}-${width}mm.pdf`;
    await page.pdf({ path, preferCSSPageSize: true, printBackground: false });
    pdfs.push({ path, width });
    await page.emulateMedia({ media: "screen" });
    results.push(
      kind + " " + width + "mm: no overflow, only narrow slip printed",
    );
  }
  await page.screenshot({ path: output + "/preview-80.png", fullPage: true });
  await validate("delivery", "58");
  await page.screenshot({ path: output + "/preview-58.png", fullPage: true });
  await validate("delivery", "80");
  await page.locator('[data-action="thermal-close"]').first().click();
  assert.equal(await page.locator("#modal[open]").count(), 1);
  assert.equal(
    await page.locator('#modal [data-action="print-dialog"]').isVisible(),
    true,
  );
  results.push("closing preview preserves source delivery");
  await page
    .getByRole("button", { name: "Print receipt", exact: true })
    .click();
  await page.locator("#thermal-width").selectOption("58");
  await page.locator('[data-action="thermal-close"]').first().click();
  await page
    .getByRole("button", { name: "Print receipt", exact: true })
    .click();
  assert.equal(await page.locator("#thermal-width").inputValue(), "58");
  await page.locator('[data-action="thermal-close"]').first().click();
  results.push("paper choice remembered between previews");
  const nativePath = `${output}/native-receipt-58mm.pdf`;
  await page.pdf({ path: nativePath, preferCSSPageSize: true });
  pdfs.push({ path: nativePath, width: "58" });
  await page.locator('#modal [data-action="close-modal"]').first().click();
  const nativeText = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeprint"));
    return document.querySelector("#thermal-print").textContent;
  });
  assert.match(nativeText, /CURRENT PAGE ONLY/);
  const registerPath = `${output}/native-register-58mm.pdf`;
  await page.pdf({ path: registerPath, preferCSSPageSize: true });
  pdfs.push({ path: registerPath, width: "58" });
  results.push(
    "native browser printing uses thermal receipts and paginated registers",
  );

  const session = await (
    await page.request.get(base + "/api.php?action=session")
  ).json();
  const api = async (action, params = {}) =>
    await (
      await page.request.get(
        base + "/api.php?" + new URLSearchParams({ action, ...params }),
      )
    ).json();
  const shipment = await api("shipment", {
    id: (await api("shipments", { kind: "booking" })).rows[0].id,
  });
  const incoming = await api("shipment", {
    id: (await api("shipments", { kind: "incoming" })).rows[0].id,
  });
  const vouchers = await api("vouchers");
  const voucher = await api("voucher", { id: vouchers.rows[0].id });
  const ledger = await api("ledger", {
    account_id: "1-116-252",
    from: "2017-10-28",
    to: "2026-11-02",
  });
  const financial = await api("financial_report", {
    report: "trial",
    from: "2017-10-28",
    to: "2026-11-02",
  });
  const transactionReport = await api("financial_report", {
    report: "daybook",
    from: "2017-10-28",
    to: "2026-11-02",
  });
  const chart = await api("lookups");
  for (const context of [
    { kind: "shipment", data: shipment },
    { kind: "shipment", data: incoming },
    {
      kind: "bilty",
      data: {
        ...shipment.items[0],
        kind: "booking",
        reference: shipment.reference,
        dated: shipment.dated,
        station: shipment.station,
      },
    },
    { kind: "voucher", data: voucher },
    { kind: "ledger", data: ledger },
    { kind: "financial", data: financial },
    { kind: "financial", data: transactionReport },
    { kind: "chart", data: { accounts: chart.accounts.slice(0, 4) } },
  ]) {
    await page.evaluate((context) => {
      closeThermalPreview();
      recordPrintContext = context;
      openThermalPreview("dialog");
    }, context);
    for (const width of ["58", "80"])
      await validate(
        context.kind + (context.data.kind || context.data.report || ""),
        width,
      );
    if (context.kind === "ledger" || context.kind === "financial")
      assert.match(
        await page.locator("#thermal-preview-sheet").innerText(),
        /CURRENT PAGE ONLY/,
      );
  }
  // Stress narrow slips with huge totals, unbroken identifiers, Urdu, and markup-like text.
  const stress = {
    kind: "bilty",
    data: {
      kind: "incoming",
      dated: "2026-11-02",
      reference: "IN-" + "X".repeat(100),
      bilty: "TEST-THERMAL",
      customer: "<script>alert(1)</script> " + "LongName".repeat(20),
      party_to: "وقاص علی",
      detail: "GoodsDescription".repeat(40),
      qty: 999999,
      bilty_amount: 999999999999999,
      total: 999999999999999,
      advance: 1234567890,
      loading: 999999999999999,
      suzuki: 0,
      godown: 0,
      remarks: "<img src=x onerror=alert(1)>",
    },
  };
  await page.evaluate((context) => {
    closeThermalPreview();
    recordPrintContext = context;
    openThermalPreview("dialog");
  }, stress);
  await validate("stress", "58");
  assert.equal(
    await page
      .locator("#thermal-preview-sheet script,#thermal-preview-sheet img")
      .count(),
    0,
  );
  results.push("markup-like customer data escaped");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  results.push("mobile preview fits viewport");
  fs.writeFileSync(output + "/pdfs.json", JSON.stringify(pdfs));
  console.log(JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
