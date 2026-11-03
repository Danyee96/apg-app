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
  assert.equal(await page.locator("#thermal-values").inputValue(), "receipt");
  const deliveryContext = await page.evaluate(() => recordPrintContext.data);
  const deliveryRows = deliveryContext.print_items ?? deliveryContext.items;
  const centsSum = (key) =>
    deliveryRows.reduce((n, row) => n + Number(row[key] || 0), 0);
  const amount = (value) =>
    "Rs " +
    (value / 100).toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const receiptTotals = await page
    .locator("#thermal-preview-sheet .slip-section")
    .last()
    .innerText();
  assert.ok(
    receiptTotals.includes(
      amount(centsSum("bilty_amount") + centsSum("godown")),
    ),
  );
  assert.ok(receiptTotals.includes(amount(centsSum("loading"))));
  assert.ok(receiptTotals.includes(amount(centsSum("suzuki"))));
  await page.locator("#thermal-values").selectOption("cash");
  const cashTotals = await page
    .locator("#thermal-preview-sheet .slip-section")
    .last()
    .innerText();
  assert.ok(
    cashTotals.includes(
      amount(centsSum("bilty_received") + centsSum("service_received")),
    ),
  );
  assert.match(cashTotals, /Discounts/);
  await page.locator("#thermal-values").selectOption("receipt");
  results.push(
    "original charge receipt and cash-summary values remain separate",
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
  async function validateA4(kind) {
    await page.locator("#print-format").selectOption("a4");
    assert.equal(await page.locator("#thermal-width").isVisible(), false);
    assert.equal(await page.locator("#thermal-preview-title").innerText(), "A4 print preview");
    const check = await page.evaluate(() => {
      const original = document.createElement("div"); original.innerHTML = thermalSnapshot.html;
      const sheet = document.querySelector("#thermal-preview-sheet");
      if(original.querySelector(".slip-entry") && !sheet.querySelector(".a4-table")) throw Error("A4 entries must use tables");
      if(sheet.querySelector(".slip-entry")) throw Error("Thermal entry layout leaked into A4");
      const missing = [...original.querySelectorAll("strong")].map(el=>el.textContent).filter(text=>!sheet.textContent.includes(text));
      const root = sheet.querySelector(".a4-document");
      const overflow = [...root.querySelectorAll("*")].filter(el=>el.clientWidth && el.scrollWidth>el.clientWidth+2).map(el=>el.className);
      return {missing,overflow};
    });
    assert.deepEqual(check.missing, [], kind + " A4 values lost");
    assert.deepEqual(check.overflow, [], kind + " A4 overflow");
    await page.emulateMedia({media:"print"});
    assert.equal(await page.locator("#app").isVisible(),false);
    assert.equal(await page.locator("#thermal-print .a4-document").isVisible(),true);
    const path = `${output}/apg-${kind}-a4.pdf`;
    await page.pdf({path,preferCSSPageSize:true});pdfs.push({path,width:"210"});
    await page.emulateMedia({media:"screen"});
    await page.locator("#print-format").selectOption("thermal");
    assert.equal(await page.locator("#thermal-width").isVisible(),true);
    results.push(kind + " A4: all values retained, no overflow, A4 document printed");
  }
  await validateA4("delivery");
  await page.locator("#print-format").selectOption("a4");
  await page.screenshot({path:output + "/preview-a4.png",fullPage:true});
  await page.locator("#print-format").selectOption("thermal");
  await page.locator("#thermal-values").selectOption("cash");
  await validateA4("delivery-cash");
  await validate("delivery-cash", "58");
  await validate("delivery-cash", "80");
  await page.locator("#thermal-values").selectOption("receipt");
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
    await validateA4(context.kind + (context.data.kind || context.data.report || ""));
    if (context.kind === "ledger" || context.kind === "financial")
      assert.match(
        await page.locator("#thermal-preview-sheet").innerText(),
        /CURRENT PAGE ONLY/,
      );
  }
  await page.evaluate((incoming)=>{
    closeThermalPreview();recordPrintContext={kind:"shipment",data:{...incoming,items:Array.from({length:65},(_,n)=>({...incoming.items[0],bilty:"A4-"+n,detail:"Multi-page goods record "+n}))}};openThermalPreview("dialog");
  },incoming);
  await validateA4("bulk-incoming");
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
  await validateA4("stress");
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
  await page.locator("#print-format").selectOption("a4");
  assert.ok(await page.locator("#thermal-preview-sheet").evaluate(el=>el.getBoundingClientRect().width <= innerWidth));
  await page.locator('[data-action="thermal-close"]').first().click();
  await page.evaluate(()=>openThermalPreview("dialog"));
  assert.equal(await page.locator("#print-format").inputValue(),"a4");
  results.push("A4 preview fits mobile; printer type remembered across records");
  await page.locator('[data-action="thermal-close"]').first().click();
  const nativeA4 = `${output}/native-a4.pdf`;
  await page.pdf({path:nativeA4,preferCSSPageSize:true});pdfs.push({path:nativeA4,width:"210"});
  fs.writeFileSync(output + "/pdfs.json", JSON.stringify(pdfs));
  console.log(JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
