const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:3000";
const SUPER = "akalus@gmail.com";
const VOL = "volunteer.test@example.com";
const OUT = require("path").join(require("os").tmpdir(), "phonebank-e2e");
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log("•", ...a);
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓", msg);
}

async function getMagicLink(page, email) {
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', email);
  await Promise.all([page.waitForURL(/\/login\?/), page.click('button[type="submit"]')]);
  const url = new URL(page.url());
  const link = url.searchParams.get("link");
  if (!link) throw new Error("no magic link on page: " + page.url());
  return link;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const CTX = { ignoreHTTPSErrors: true };

  // ---------- SUPER ADMIN ----------
  const admin = await browser.newContext({ viewport: { width: 430, height: 900 }, ...CTX });
  const p = await admin.newPage();
  p.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  log("super admin login");
  const link = await getMagicLink(p, SUPER);
  await p.goto(link);
  await p.waitForURL(/\/admin/);
  assert(p.url().includes("/admin"), "super admin lands on /admin");

  // Regression: a page render must never destroy the session. Next prefetches
  // Links, so a GET sign-out route was being fetched on every page load and
  // silently logging the user out mid-session.
  const beforeNav = (await admin.cookies()).find((c) => c.name === "pb_session");
  await p.goto(BASE + "/admin");
  await p.waitForTimeout(2500);
  const afterNav = (await admin.cookies()).find((c) => c.name === "pb_session");
  assert(!!beforeNav, "session cookie set at login");
  assert(
    !!afterNav && afterNav.value === beforeNav.value,
    "session survives a page render (no prefetchable sign-out route)",
  );

  log("create campaign");
  await p.fill('input[name="name"]', "Vaziri for Cranston");
  await p.fill('input[name="candidate_name"]', "Emilia Vaziri");
  await p.fill('input[name="lookup_column"]', "Contact");
  await Promise.all([p.waitForURL(/\/admin\/[0-9a-f-]{36}/), p.click('form button[type="submit"]')]);
  const campaignId = p.url().split("/admin/")[1].split("?")[0];
  assert(!!campaignId, "campaign created: " + campaignId);

  log("add volunteer");
  const addForm = p.locator("form", { hasText: "Add a person" });
  await addForm.locator('input[name="name"]').fill("Test Volunteer");
  await addForm.locator('input[name="email"]').fill(VOL);
  await addForm.locator('select[name="role"]').selectOption("volunteer");
  await addForm.locator('button[type="submit"]').click();
  await p.waitForTimeout(1200);
  assert(await p.getByText(VOL).first().isVisible(), "volunteer listed on campaign");

  log("upload call list");
  const upForm = p.locator("form", { hasText: "Upload a call list" });
  await upForm.locator('input[name="name"]').fill("Ward 3 week 1");
  await upForm.locator('select[name="canvassing_for"]').selectOption("Primary");
  await upForm.locator('input[name="file"]').setInputFiles(require("path").join(__dirname, "fixtures-list.csv"));
  await upForm
    .locator('textarea[name="script"]')
    .fill("Hi, is this [name]? I'm a volunteer with Emilia Vaziri's campaign.");
  await Promise.all([p.waitForURL(/\/list\//), upForm.locator('button[type="submit"]').click()]);
  const listId = p.url().split("/list/")[1].split("?")[0];
  const banner = await p.locator("text=/Loaded \\d+ contacts/").first().textContent();
  log("  banner:", banner.trim());
  assert(/Loaded 12 contacts/.test(banner), "12 valid rows loaded");
  assert(/Skipped 1 with no phone/.test(banner), "row with no phone skipped");
  assert(/Skipped 1 with no Contact ID/.test(banner), "row with no contact id skipped");

  log("assign 5 contacts to volunteer");
  const asForm = p.locator("form", { hasText: "Assign contacts" });
  await asForm.locator('input[name="count"]').fill("5");
  await asForm.locator('button[type="submit"]').click();
  await p.waitForTimeout(1200);
  assert(
    await p.getByText("0/5 called").first().isVisible(),
    "volunteer shows 0/5 assigned",
  );

  // ---------- VOLUNTEER ----------
  log("volunteer login");
  const vol = await browser.newContext({ viewport: { width: 390, height: 844 }, ...CTX });
  const v = await vol.newPage();
  v.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  const vlink = await getMagicLink(v, VOL);
  await v.goto(vlink);
  await v.waitForURL(/\/call/);
  assert(v.url().endsWith("/call"), "volunteer lands on /call");
  assert(await v.getByText("5 left to call").isVisible(), "volunteer sees 5 left");

  await v.getByText("Ward 3 week 1").click();
  await v.waitForURL(/\/call\/[0-9a-f-]{36}/);

  const tel = await v.locator('a[href^="tel:"]').getAttribute("href");
  assert(/^tel:\+1401555\d+/.test(tel), "tap-to-call href is E.164: " + tel);
  assert(
    (await v.locator("details").first().textContent()).includes("Hi, is this "),
    "script renders with name substituted",
  );

  // Call 1: full contact
  log("log call 1 - Voter Contacted");
  await v.getByRole("button", { name: "Voter Contacted", exact: true }).click();
  assert(
    await v.getByRole("button", { name: "Save and next" }).isDisabled(),
    "save blocked until all three questions answered",
  );
  await v.getByRole("button", { name: "Knows Candidate", exact: true }).click();
  await v.getByRole("button", { name: "1-Strong Supporter", exact: true }).click();
  await v.getByRole("button", { name: "Mail Ballot", exact: true }).click();
  await v.locator('textarea[name="notes"]').fill('Said "call back after 6" — enthusiastic');
  await v.getByRole("button", { name: "Save and next" }).click();
  await v.waitForTimeout(1500);
  assert(await v.getByText("1 of 5 done").isVisible(), "counter advanced to 1 of 5");

  // Call 2: no answer, short form
  log("log call 2 - No Answer");
  await v.getByRole("button", { name: "No Answer", exact: true }).click();
  assert(
    !(await v.getByRole("button", { name: "Knows Candidate", exact: true }).isVisible()),
    "canvass questions hidden on No Answer",
  );
  await v.getByRole("button", { name: "Save and next" }).click();
  await v.waitForTimeout(1500);

  // Call 3: wrong number with replacement
  log("log call 3 - Wrong Number");
  await v.getByRole("button", { name: "Wrong Number", exact: true }).click();
  await v.locator('input[name="new_phone"]').fill("401-555-7788");
  await v.getByRole("button", { name: "Save and next" }).click();
  await v.waitForTimeout(1500);

  // Call 4: voicemail
  log("log call 4 - Voicemail Left");
  await v.getByRole("button", { name: "Voicemail Left", exact: true }).click();
  await v.getByRole("button", { name: "Save and next" }).click();
  await v.waitForTimeout(1500);
  assert(await v.getByText("4 of 5 done").isVisible(), "counter at 4 of 5");

  // Call 5: opposition
  log("log call 5 - Voter Contacted, opposition");
  await v.getByRole("button", { name: "Voter Contacted", exact: true }).click();
  await v.getByRole("button", { name: "Unaware of Candidate", exact: true }).click();
  await v.getByRole("button", { name: "5-Strong Opposition", exact: true }).click();
  await v.getByRole("button", { name: "Won't Commit", exact: true }).click();
  await v.getByRole("button", { name: "Save and next" }).click();
  await v.waitForTimeout(1500);
  assert(await v.getByText("You finished this list.").isVisible(), "volunteer sees done screen");

  // ---------- EXPORT ----------
  log("admin export");
  await p.goto(`${BASE}/admin/${campaignId}/list/${listId}`);
  assert(
    await p.getByText("5 results not yet exported").isVisible(),
    "admin sees 5 pending export",
  );
  assert(await p.getByText("5/5 called").isVisible(), "per-volunteer stats show 5/5");
  assert(await p.getByText("2 reached").isVisible(), "per-volunteer stats show 2 reached");

  const dl = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("link", { name: "Download new results" }).click(),
  ]);
  const file = path.join(OUT, "export1.csv");
  await dl[0].saveAs(file);
  const csv = fs.readFileSync(file, "utf8");
  log("  saved", file, csv.length, "bytes");

  const Papa = require("papaparse");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const F = parsed.meta.fields;
  const rows = parsed.data;
  assert(F[0] === "Contact", "lookup column is first: " + F[0]);
  assert(F.length === 126, "126 columns (125 template + lookup)");
  assert(rows.length === 5, "5 result rows");
  assert(
    rows.every((r) => /^ghl-\d{4}$/.test(r["Contact"])),
    "every row carries a GHL Contact ID",
  );
  assert(
    rows.every((r) => r["Disposition"] === "Phone - " + r["Disposition (Phone)"]),
    "parent Disposition mirrors Disposition (Phone)",
  );
  assert(
    rows.every((r) => r["Contact Method"] === "Phone" && r["Canvassing For"] === "Primary"),
    "auto-filled metadata present on every row",
  );
  assert(
    rows.every((r) => /^Phone - .+ - \d{2}\/\d{2}\/\d{4}$/.test(r["Canvass Attempt Name"])),
    "Canvass Attempt Name generated on every row",
  );
  const contacted = rows.filter((r) => r["Disposition (Phone)"] === "Voter Contacted");
  const notContacted = rows.filter((r) => r["Disposition (Phone)"] !== "Voter Contacted");
  assert(contacted.length === 2, "2 contacted rows");
  assert(
    contacted.every((r) => r["Candidate Awareness"] && r["Current Support Level"] && r["Vote Plan"]),
    "contacted rows carry all three answers",
  );
  assert(
    notContacted.every(
      (r) => !r["Candidate Awareness"] && !r["Current Support Level"] && !r["Vote Plan"],
    ),
    "non-contacted rows have no canvass answers",
  );
  const withNotes = rows.filter((r) => r["Internal Notes"]);
  assert(withNotes.length === 1, "notes appear on exactly one row, no carry-over between calls");
  const wrong = rows.find((r) => r["Disposition (Phone)"] === "Wrong Number");
  assert(wrong["Phone \u2014 Correct?"] === "Incorrect", "wrong number flags phone as Incorrect");
  assert(wrong["\u2192 New Phone Number"] === "401-555-7788", "replacement number captured");
  const blank = F.filter((f) => rows.every((r) => !r[f]));
  assert(blank.length === 109, "109 template columns left blank (" + blank.length + ")");

  // second export should be empty (incremental)
  await p.reload();
  assert(
    await p.getByText("0 results not yet exported").isVisible(),
    "pending drops to 0 after export",
  );
  assert(await p.getByText("5 already exported").isVisible(), "5 marked exported");

  await browser.close();
  console.log("\nE2E PASSED");
})().catch((e) => {
  console.error("\nE2E FAILED:", e.message);
  process.exit(1);
});
