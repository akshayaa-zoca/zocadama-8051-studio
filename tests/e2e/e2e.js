// OPTIONAL full-browser test (for people with Node.js). Not needed to use the website.
// It opens the real pages in a real browser, clicks the real links and buttons, and reports.
//
// One-time setup (in a terminal inside this folder):
//   npm install playwright
//   npx playwright install chromium
// Run:
//   node tests/e2e/e2e.js

"use strict";
var path = require("path");
var url = require("url");
var pw;
try { pw = require("playwright"); } catch (e) {
  console.error("Playwright is not installed. See the setup lines at the top of this file."); process.exit(2);
}

var root = path.resolve(__dirname, "..", "..");
function page(rel) { return url.pathToFileURL(path.join(root, rel)).href; }

var failures = [], passes = 0;
function ok(cond, label) {
  if (cond) { passes++; console.log("  ok    " + label); }
  else { failures.push(label); console.log("  FAIL  " + label); }
}

(async function () {
  var browser = await pw.chromium.launch();
  var ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  var p = await ctx.newPage();
  var errors = [];
  p.on("pageerror", function (e) { errors.push("pageerror: " + e.message); });
  p.on("console", function (m) { if (m.type() === "error") { errors.push("console: " + m.text()); } });
  var val = function (id) { return p.textContent("#" + id); };
  var msg = function () { return p.textContent(".sim-message"); };

  console.log("1) Homepage: original features");
  await p.goto(page("index.html"));
  ok(/Learn\.\s*Simulate\.\s*Build\./.test(await p.textContent(".hero h1")), "hero shows Learn. Simulate. Build.");
  ok(await p.locator("#chip svg").count() === 1, "chip diagram is drawn");
  ok(await p.locator("#chip .pin").count() === 40, "all 40 pins exist");
  await p.locator("#chip .pin[aria-label^='Pin 10,'] rect").click();
  ok(/P3\.0/.test(await p.textContent("#pin-info")) && /Pin 10/.test(await p.textContent("#pin-info")), "clicking pin 10 shows P3.0 info");
  await p.locator("#chip .pin[aria-label^='Pin 40,'] rect").click();
  ok(/VCC/.test(await p.textContent("#pin-info")) && /Pin 40/.test(await p.textContent("#pin-info")), "clicking pin 40 shows VCC info");
  await p.locator("#chip .pin[aria-label^='Pin 21,'] rect").click();
  ok(/P2\.0/.test(await p.textContent("#pin-info")), "clicking pin 21 shows P2.0 info");
  ok(await p.isVisible("#roadmap") && /Phase 2/.test(await p.textContent("#roadmap")), "roadmap is present");
  ok(await p.locator("#pillars .card").count() === 3, "three Learn / Simulate / Build cards");
  ok((await p.textContent("#year")).length === 4, "footer year is filled in");
  ok(await p.locator("#site-nav a[href='simulator.html']").count() === 1, "navigation has a Simulator link");

  console.log("2) Navigation between pages");
  await p.click("#site-nav a[href='simulator.html']");
  ok(/simulator\.html$/.test(p.url()), "Simulator link opens simulator.html");
  await p.waitForSelector("#simulator-root .sim-layout");
  ok(true, "simulator panel is built");
  await p.click("#site-nav a:has-text('Chip explorer')");
  ok(/index\.html#explorer$/.test(p.url()) && await p.isVisible("#chip"), "Chip explorer link returns to the homepage explorer");
  await p.click("#pillars .card-sim a.btn");
  ok(/simulator\.html$/.test(p.url()), "Simulate card button opens the simulator");
  await p.click("a.brand");
  ok(/index\.html$/.test(p.url()) && await p.isVisible(".hero"), "logo returns to the homepage");
  await p.click(".hero a:has-text('Try the simulator')");
  ok(/simulator\.html$/.test(p.url()), "hero button opens the simulator");
  await p.click("#site-nav a:has-text('Roadmap')");
  ok(/index\.html#roadmap$/.test(p.url()) && await p.isVisible("#roadmap"), "Roadmap link goes to the homepage roadmap");

  console.log("3) Simulator page");
  await p.goto(page("simulator.html"));
  await p.waitForSelector("#simulator-root .sim-layout");
  ok(await val("rPC") === "0x0000", "PC starts at 0x0000");
  ok(await p.locator("#sim-sample option").count() === 6, "five examples plus custom");
  await p.click("button:has-text('Step')");
  ok(await val("rA") === "0x25" && await val("rPC") === "0x0002", "Step runs one instruction (A=0x25)");
  await p.click("button:has-text('Reset')");
  ok(await val("rA") === "0x00" && await val("rPC") === "0x0000", "Reset restores the start state");
  await p.selectOption("#sim-speed", "2");
  await p.click("button:has-text('Run')");
  await p.waitForFunction(function () { return /finished/.test(document.querySelector(".sim-message").textContent); }, null, { timeout: 10000 });
  ok(await val("rA") === "0x3C", "Run finishes the example (A=0x3C)");
  await p.fill("#sim-hex", "74 ZZ"); await p.click("button:has-text('Load program')");
  ok(/not a hexadecimal/.test(await msg()), "invalid hexadecimal gives a clear error");
  await p.fill("#sim-hex", "74 01 84 80 FE"); await p.click("button:has-text('Load program')");
  await p.click("button:has-text('Step')"); await p.click("button:has-text('Step')");
  ok(/not implemented/.test(await msg()) && await p.locator("button:has-text('Step')").isDisabled(), "unsupported opcode stops the CPU with a message");
  await p.click("summary:has-text('Show the instruction table')");
  ok(await p.locator(".sim-ref tbody tr").count() > 40, "instruction reference table is filled in");
  ok(/not available yet/.test(await p.textContent(".sim-hero")), "page says assembly input is not available yet");

  console.log("4) Phone width");
  await p.setViewportSize({ width: 390, height: 844 });
  for (var rel of ["index.html", "simulator.html"]) {
    await p.goto(page(rel));
    var overflow = await p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
    ok(!overflow, rel + " has no sideways scrolling at 390px wide");
  }
  await p.goto(page("simulator.html"));
  await p.click("#nav-toggle");
  ok(await p.isVisible("#site-nav a[href='index.html']"), "mobile menu opens on the simulator page");
  await p.click("#site-nav a[href='index.html']");
  ok(/index\.html$/.test(p.url()), "mobile menu link goes home");
  await p.setViewportSize({ width: 1280, height: 900 });

  console.log("5) In-browser test pages (real browser, file://)");
  await p.goto(page("tests/run-tests.html"));
  await p.waitForFunction(function () { return window.__testsDone; }, null, { timeout: 120000 });
  var s1 = await p.textContent("#summary");
  ok(/ 0 failed, /.test(s1), "tests/run-tests.html: " + s1);
  await p.goto(page("tests/integration-tests.html"));
  await p.waitForFunction(function () { return window.__testsDone; }, null, { timeout: 120000 });
  var s2 = await p.textContent("#summary");
  ok(/ 0 failed, /.test(s2), "tests/integration-tests.html: " + s2);

  ok(errors.length === 0, "no console or page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await browser.close();
  console.log("\n" + passes + " checks passed, " + failures.length + " failed");
  process.exit(failures.length ? 1 : 0);
})().catch(function (e) { console.error("SCRIPT ERROR", e); process.exit(2); });
