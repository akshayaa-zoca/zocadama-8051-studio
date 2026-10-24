// Run all tests from a terminal:  node tests/run-node.js
// (Optional. The same tests run in a browser by opening tests/run-tests.html.)

"use strict";
var fs = require("fs");
var path = require("path");
var base = path.join(__dirname, "..");

["engine/memory.js", "engine/instructions.js", "engine/cpu.js", "engine/hex.js", "engine/samples.js",
 "tests/test-helpers.js", "tests/cpu.test.js"].forEach(function (f) { require(path.join(base, f)); });

var T = globalThis.Z8051Test, Z = globalThis.Z8051;

// ---- Checks that only make sense with file access (Node only) ----
T.group("Project checks (Node only)");

T.test("engine files never touch the web page (no document/window/innerHTML/eval)", function () {
  ["memory", "instructions", "cpu", "hex", "samples"].forEach(function (name) {
    var src = fs.readFileSync(path.join(base, "engine", name + ".js"), "utf8")
      .replace(/\/\/.*$/gm, "");                                     // ignore comments
    ["document", "window.", "innerHTML", "eval(", "new Function", "XMLHttpRequest"].forEach(function (bad) {
      T.ok(src.indexOf(bad) < 0, "engine/" + name + ".js must not contain \"" + bad + "\"");
    });
    T.ok(!/\bfetch\(/.test(src), "engine/" + name + ".js must not call the network fetch()");
  });
});

T.test("docs/SIMULATOR.md lists exactly the implemented opcodes", function () {
  var md = fs.readFileSync(path.join(base, "docs", "SIMULATOR.md"), "utf8");
  var inDoc = {};
  md.split("\n").forEach(function (line) {
    var m = /^\|\s*0x([0-9A-F]{2})\s*\|/.exec(line);
    if (m) { inDoc[parseInt(m[1], 16)] = true; }
  });
  Object.keys(Z.OPCODES).forEach(function (k) { T.ok(inDoc[k], "opcode 0x" + parseInt(k, 10).toString(16) + " is implemented but missing from docs"); });
  Object.keys(inDoc).forEach(function (k) { T.ok(Z.OPCODES[k], "opcode 0x" + parseInt(k, 10).toString(16) + " is documented but not implemented"); });
});

// ---- Integration checks on the HTML pages (static: they read the files, they do not open a browser) ----
function read(rel) { return fs.readFileSync(path.join(base, rel), "utf8"); }
function plain(text) { return text.replace(/<[^>]+>/g, "").replace(/[*`]/g, ""); }
var PAGES = ["index.html", "simulator.html", "tests/run-tests.html", "tests/integration-tests.html"];

T.test("every local script, stylesheet and link in the HTML pages points to a file that exists (and every #anchor exists)", function () {
  PAGES.forEach(function (page) {
    var html = read(page), dir = path.dirname(path.join(base, page)), m;
    var re = /<(?:script[^>]*\ssrc|link[^>]*\shref|a[^>]*\shref)="([^"]+)"/g, count = 0;
    while ((m = re.exec(html)) !== null) {
      var ref = m[1];
      if (/^(https?:|mailto:)/.test(ref)) { continue; }
      count++;
      var parts = ref.split("#"), file = parts[0], frag = parts[1];
      var target = file === "" ? path.join(base, page) : path.join(dir, file);
      T.ok(fs.existsSync(target), page + " references a missing file: " + ref);
      if (frag && /\.html$/.test(target)) {
        T.ok(fs.readFileSync(target, "utf8").indexOf('id="' + frag + '"') >= 0, page + " links to #" + frag + " which does not exist in " + path.basename(target));
      }
    }
    T.ok(count >= 3, page + " should reference some local files");
  });
});

T.test("homepage keeps every original landmark (hero, chip explorer, pin info, pillars, roadmap, menu, footer year)", function () {
  var html = read("index.html");
  ["top", "explorer", "chip", "pin-info", "pillars", "roadmap", "nav-toggle", "site-nav", "year"].forEach(function (id) {
    T.ok(html.indexOf('id="' + id + '"') >= 0, "index.html lost id=\"" + id + "\"");
  });
  ["Learn.", "Simulate.", "Build.", "Explore the 8051 pins", "Phase 0", "Phase 3"].forEach(function (t) { T.includes(html, t); });
  T.ok(/<script src="main\.js"><\/script>/.test(html), "index.html must still load main.js");
  T.ok(html.indexOf("simulator.js") < 0 && html.indexOf("engine/") < 0, "the homepage should not load simulator scripts");
});

T.test("navigation: the homepage links to the simulator and the simulator links back to home, explorer and roadmap", function () {
  var home = read("index.html"), sim = read("simulator.html");
  T.ok(/<nav[^>]*>[\s\S]*href="simulator\.html"[\s\S]*<\/nav>/.test(home), "homepage nav must link to simulator.html");
  T.ok(/class="btn[^"]*"\s+href="simulator\.html"/.test(home), "homepage should have simulator buttons");
  T.ok(/<nav[^>]*>[\s\S]*href="index\.html"[\s\S]*href="index\.html#explorer"[\s\S]*href="index\.html#roadmap"[\s\S]*<\/nav>/.test(sim), "simulator nav must link back to home, explorer and roadmap");
  T.ok(/<a class="brand" href="index\.html"/.test(sim), "simulator logo links home");
  T.ok(/aria-current="page"/.test(sim), "simulator nav marks the current page");
});

T.test("simulator.html loads main.js and the engine files in dependency order, with the screen scripts last", function () {
  var html = read("simulator.html");
  var order = ["main.js", "engine/memory.js", "engine/instructions.js", "engine/cpu.js", "engine/hex.js", "engine/samples.js", "ui/simulator-ui.js", "ui/opcode-reference.js"];
  var last = -1;
  order.forEach(function (f) {
    var i = html.indexOf('<script src="' + f + '"');
    T.ok(i > last, f + " must be loaded after the previous script"); last = i;
  });
  ["simulator-root", "opcode-reference-root", "limits", "reference", "nav-toggle", "site-nav", "year"].forEach(function (id) {
    T.ok(html.indexOf('id="' + id + '"') >= 0, "simulator.html is missing id=\"" + id + "\"");
  });
  T.ok(html.indexOf('type="module"') < 0, "classic scripts only (modules do not work from file://)");
});

T.test("honest wording: pages and docs say it is not full compatibility and that assembly input is not available", function () {
  var sim = plain(read("simulator.html")), readme = plain(read("README.md")), docs = plain(read("docs/SIMULATOR.md"));
  T.ok(/not a full 8051/i.test(sim), "simulator.html must say it is not a full 8051 simulator");
  T.ok(/Assembly-language input is not available yet/i.test(sim), "simulator.html must say assembly input is not available");
  T.ok(/not full 8051 or AT89S52 compatibility/i.test(readme), "README must state the limitation");
  T.ok(/not a full 8051 or AT89S52 simulator/i.test(docs), "docs must state the limitation");
  [sim, readme, docs, plain(read("index.html"))].forEach(function (t) {
    T.ok(!/fully compatible|100% compatible|complete 8051|supports assembly/i.test(t), "no inflated compatibility claims");
  });
});

T.test("the test page is not named index.html (it would clash with the website's home page)", function () {
  T.ok(!fs.existsSync(path.join(base, "tests", "index.html")), "tests/index.html must not exist");
  T.ok(fs.existsSync(path.join(base, "tests", "run-tests.html")), "tests/run-tests.html should exist");
});

var out = T.run();
var group = "";
out.results.forEach(function (r) {
  if (r.group !== group) { group = r.group; console.log("\n" + group); }
  console.log("  " + (r.passed ? "PASS" : "FAIL") + "  " + r.name + (r.passed ? "" : "\n        -> " + r.error));
});
console.log("\n" + out.passed + " passed, " + out.failed + " failed, " + out.total + " total");
console.log("Opcodes implemented: " + Object.keys(Z.OPCODES).length);
process.exit(out.failed === 0 ? 0 : 1);
