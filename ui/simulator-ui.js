// Zocadama 8051 Studio - ui/simulator-ui.js
// The screen layer. It builds the simulator panel and talks to the CPU engine.
// All text from the engine is shown with textContent (never innerHTML), and
// nothing the user types is ever run as code.
//
// To use it, a page needs <div id="simulator-root"></div> and the engine scripts.

(function (root) {
  "use strict";
  var Z = root.Z8051;
  if (!Z || !Z.createCpu || !Z.SAMPLES || !Z.parseHexBytes) {
    // The engine files did not load. The page itself explains which ones are missing.
    if (root.console) { root.console.error("Zocadama 8051 Studio: the engine scripts are not loaded, so the simulator cannot start."); }
    return;
  }

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") { el.textContent = attrs[k]; }
        else if (k === "class") { el.className = attrs[k]; }
        else { el.setAttribute(k, attrs[k]); }
      });
    }
    (kids || []).forEach(function (kid) { if (kid) { el.appendChild(kid); } });
    return el;
  }
  function hex2(n) { return Z.hex2(n); }
  function bin8(n) { return ("00000000" + (n & 0xFF).toString(2)).slice(-8); }

  var SPEEDS = [
    { label: "Slow (3 steps per second)", interval: 330, steps: 1 },
    { label: "Medium (20 steps per second)", interval: 50, steps: 1 },
    { label: "Fast (as quick as possible)", interval: 16, steps: 2000 }
  ];

  function mount(host) {
    var cpu = Z.createCpu();
    var breakpoints = new Set();
    var running = false, timer = null, prev = null, ranTotal = 0;
    var listingRows = {};      // address -> <tr>
    var el = {};               // named elements we update later

    // ---------- Build the page parts ----------
    var banner = h("p", { "class": "sim-banner", text:
      "Early engine: runs a small, tested subset of AT89S52-style 8051 instructions. " +
      "Anything else stops the CPU with a message. This is not full 8051 or AT89S52 compatibility." });

    // Program loader
    el.sample = h("select", { id: "sim-sample", "aria-label": "Example program" });
    el.sample.appendChild(h("option", { value: "", text: "Custom (type your own bytes)" }));
    Z.SAMPLES.forEach(function (s) { el.sample.appendChild(h("option", { value: s.id, text: s.title })); });
    el.about = h("p", { "class": "sim-about" });
    el.text = h("textarea", { id: "sim-hex", rows: "8", spellcheck: "false", "aria-label": "Program as hexadecimal bytes" });
    el.load = h("button", { type: "button", "class": "btn btn-primary", text: "Load program" });
    el.message = h("p", { "class": "sim-message", role: "status", "aria-live": "polite" });

    var loader = h("div", { "class": "sim-card" }, [
      h("h3", { text: "1. Program" }),
      h("label", { "for": "sim-sample", text: "Example: " }), el.sample,
      el.about,
      h("label", { "for": "sim-hex", "class": "sim-label", text: "Program bytes (hexadecimal; ; starts a comment)" }),
      el.text,
      h("div", { "class": "sim-row" }, [el.load]),
      el.message
    ]);

    // Controls
    el.reset = h("button", { type: "button", "class": "btn btn-ghost-dark", text: "Reset" });
    el.step = h("button", { type: "button", "class": "btn btn-ghost-dark", text: "Step" });
    el.run = h("button", { type: "button", "class": "btn btn-primary", text: "Run" });
    el.pause = h("button", { type: "button", "class": "btn btn-ghost-dark", text: "Pause" });
    el.speed = h("select", { id: "sim-speed", "aria-label": "Run speed" });
    SPEEDS.forEach(function (s, i) { el.speed.appendChild(h("option", { value: String(i), text: s.label })); });
    el.speed.value = "1";
    el.state = h("p", { "class": "sim-state", role: "status", "aria-live": "polite" });
    var controls = h("div", { "class": "sim-card" }, [
      h("h3", { text: "2. Controls" }),
      h("div", { "class": "sim-row" }, [el.reset, el.step, el.run, el.pause]),
      h("div", { "class": "sim-row" }, [h("label", { "for": "sim-speed", text: "Run speed: " }), el.speed]),
      el.state
    ]);

    // Listing
    el.listBody = h("tbody");
    el.listWrap = h("div", { "class": "sim-listing", tabindex: "0", role: "region", "aria-label": "Program listing" }, [
      h("table", {}, [
        h("thead", {}, [h("tr", {}, [h("th", { text: "BP" }), h("th", { text: "Address" }), h("th", { text: "Bytes" }), h("th", { text: "Instruction" })])]),
        el.listBody
      ])
    ]);
    var listing = h("div", { "class": "sim-card" }, [
      h("h3", { text: "3. Program listing" }),
      h("p", { "class": "sim-hint", text: "Click a dot to set or clear a breakpoint. Run stops before that instruction." }),
      el.listWrap
    ]);

    // Registers
    function regCell(label, id) {
      var value = h("span", { "class": "reg-value", id: id }), extra = h("span", { "class": "reg-extra" });
      var wrap = h("div", { "class": "reg" }, [h("span", { "class": "reg-name", text: label }), value, extra]);
      el[id] = { wrap: wrap, value: value, extra: extra };
      return wrap;
    }
    var flagNames = ["CY", "AC", "F0", "RS1", "RS0", "OV", "P"];
    el.flags = {};
    var flagRow = h("div", { "class": "flags", role: "group", "aria-label": "PSW flags" });
    flagNames.forEach(function (f) {
      var b = h("span", { "class": "flag" }, [h("span", { "class": "flag-name", text: f }), h("span", { "class": "flag-bit", text: "0" })]);
      el.flags[f] = b; flagRow.appendChild(b);
    });
    var regGrid = h("div", { "class": "reg-grid" }, [
      regCell("A (ACC)", "rA"), regCell("B", "rB"), regCell("PC", "rPC"), regCell("SP", "rSP"), regCell("PSW", "rPSW"),
      regCell("P0", "rP0"), regCell("P1", "rP1"), regCell("P2", "rP2"), regCell("P3", "rP3")
    ]);
    el.bankTitle = h("h4", { text: "R0-R7 (register bank 0)" });
    var rnGrid = h("div", { "class": "reg-grid" });
    for (var r = 0; r < 8; r++) { rnGrid.appendChild(regCell("R" + r, "rR" + r)); }
    var registers = h("div", { "class": "sim-card" }, [
      h("h3", { text: "4. Registers" }), regGrid, h("h4", { text: "PSW flags" }), flagRow, el.bankTitle, rnGrid
    ]);

    // Last instruction
    el.last = h("p", { "class": "sim-last", text: "No instruction has run yet." });
    el.changes = h("ul", { "class": "sim-changes", "aria-live": "polite" });
    var lastCard = h("div", { "class": "sim-card" }, [h("h3", { text: "5. Last instruction" }), el.last, el.changes]);

    // Memory grid (256 bytes)
    el.cells = [];
    var memBody = h("tbody");
    for (var row = 0; row < 16; row++) {
      var tr = h("tr", {}, [h("th", { scope: "row", text: hex2(row * 16) })]);
      for (var col = 0; col < 16; col++) {
        var addr = row * 16 + col;
        var cls = "mem " + (addr < 0x20 ? "mem-bank" : addr < 0x30 ? "mem-bit" : addr < 0x80 ? "mem-gen" : "mem-upper");
        var td = h("td", { "class": cls, title: Z.ramLabel(addr), text: "00" });
        el.cells.push(td); tr.appendChild(td);
      }
      memBody.appendChild(tr);
    }
    var memHead = h("tr", {}, [h("th", { text: "" })]);
    for (var c = 0; c < 16; c++) { memHead.appendChild(h("th", { scope: "col", text: c.toString(16).toUpperCase() })); }
    var memory = h("div", { "class": "sim-card sim-wide" }, [
      h("h3", { text: "6. Internal RAM (256 bytes)" }),
      h("ul", { "class": "mem-legend" }, [
        h("li", { "class": "mem-bank", text: "00-1F register banks" }), h("li", { "class": "mem-bit", text: "20-2F bit-addressable" }),
        h("li", { "class": "mem-gen", text: "30-7F general" }), h("li", { "class": "mem-upper", text: "80-FF upper RAM (indirect only)" }),
        h("li", { "class": "mem-sp", text: "outlined = SP" })
      ]),
      h("div", { "class": "sim-memwrap" }, [h("table", { "class": "sim-mem" }, [h("thead", {}, [memHead]), memBody])]),
      h("p", { "class": "sim-hint", text: "Highlighted values changed during the last step. Special function registers (P0-P3, A, B, SP, PSW) are shown in the register panel, not here." })
    ]);

    var layout = h("div", { "class": "sim-layout" }, [
      h("div", { "class": "sim-col" }, [loader, controls, listing]),
      h("div", { "class": "sim-col" }, [registers, lastCard]),
      memory
    ]);
    host.textContent = "";
    host.appendChild(banner);
    host.appendChild(layout);

    // ---------- Showing state ----------
    function setText(node, value, changed) {
      if (node.textContent !== value) { node.textContent = value; }
    }
    function mark(wrap, changed) { wrap.classList.toggle("changed", !!changed); }

    function render(highlight) {
      var s = cpu.snapshot(), p = highlight ? prev : null;
      function ch(key) { return p && p[key] !== s[key]; }

      el.rA.value.textContent = "0x" + hex2(s.a); el.rA.extra.textContent = s.a + " | " + bin8(s.a); mark(el.rA.wrap, ch("a"));
      el.rB.value.textContent = "0x" + hex2(s.b); el.rB.extra.textContent = s.b + " | " + bin8(s.b); mark(el.rB.wrap, ch("b"));
      el.rPC.value.textContent = "0x" + Z.hex4(s.pc); el.rPC.extra.textContent = ""; mark(el.rPC.wrap, ch("pc"));
      el.rSP.value.textContent = "0x" + hex2(s.sp); el.rSP.extra.textContent = ""; mark(el.rSP.wrap, ch("sp"));
      el.rPSW.value.textContent = "0x" + hex2(s.psw); el.rPSW.extra.textContent = bin8(s.psw); mark(el.rPSW.wrap, ch("psw"));
      ["p0", "p1", "p2", "p3"].forEach(function (k, i) {
        var cell = el["rP" + i];
        cell.value.textContent = "0x" + hex2(s[k]); cell.extra.textContent = bin8(s[k]); mark(cell.wrap, ch(k));
      });
      flagNames.forEach(function (f) {
        var node = el.flags[f];
        node.lastChild.textContent = String(s.flags[f]);
        node.classList.toggle("on", s.flags[f] === 1);
        node.classList.toggle("changed", !!(p && p.flags[f] !== s.flags[f]));
      });
      el.bankTitle.textContent = "R0-R7 (register bank " + s.bank + ")";
      for (var r = 0; r < 8; r++) {
        var cell = el["rR" + r];
        cell.value.textContent = "0x" + hex2(s.regs[r]); cell.extra.textContent = "";
        mark(cell.wrap, p && (p.regs[r] !== s.regs[r] || p.bank !== s.bank));
      }
      for (var a = 0; a < 256; a++) {
        var td = el.cells[a];
        td.textContent = hex2(s.iram[a]);
        td.classList.toggle("changed", !!(p && p.iram[a] !== s.iram[a]));
        td.classList.toggle("mem-sp", a === s.sp);
      }
      // listing: highlight the current instruction
      Object.keys(listingRows).forEach(function (k) { listingRows[k].classList.remove("is-pc"); });
      var cur = listingRows[s.pc];
      if (cur) {
        cur.classList.add("is-pc");
        var top = cur.offsetTop - el.listWrap.clientHeight / 2 + cur.offsetHeight / 2;
        el.listWrap.scrollTop = Math.max(0, top);
      }
      prev = s;
      updateControls();
    }

    function say(text, kind) {
      el.message.textContent = text;
      el.message.className = "sim-message" + (kind ? " " + kind : "");
    }

    function showResult(r) {
      el.changes.textContent = "";
      if (!r) { return; }
      if (!r.ok) {
        el.last.textContent = "The CPU stopped: " + r.fault.message;
        return;
      }
      var bytes = r.bytes.map(hex2).join(" ");
      el.last.textContent = "0x" + Z.hex4(r.pcBefore) + ":  " + r.text + "   [" + bytes + "]";
      r.changes.forEach(function (c) {
        var fmt = c.kind === "pc" ? function (v) { return "0x" + Z.hex4(v); } : function (v) { return "0x" + hex2(v); };
        el.changes.appendChild(h("li", { text: c.name + ":  " + fmt(c.before) + "  ->  " + fmt(c.after) }));
      });
      if (r.changes.length === 0) { el.changes.appendChild(h("li", { text: "(nothing changed)" })); }
    }

    function updateControls() {
      var loaded = cpu.programEnd > 0, faulted = !!cpu.fault;
      el.step.disabled = running || !loaded || faulted;
      el.run.disabled = running || !loaded || faulted;
      el.pause.disabled = !running;
      el.reset.disabled = !loaded;
      el.load.disabled = running;
      el.sample.disabled = running;
      el.text.disabled = running;
      var state = !loaded ? "No program loaded." :
        faulted ? "Stopped by a fault. Press Reset to start again." :
        running ? "Running..." : "Ready. " + cpu.instructionCount + " instruction" + (cpu.instructionCount === 1 ? "" : "s") + " executed.";
      el.state.textContent = state;
      el.state.className = "sim-state" + (faulted ? " error" : "");
    }

    // ---------- Listing ----------
    function buildListing() {
      el.listBody.textContent = "";
      listingRows = {};
      cpu.listing().forEach(function (row) {
        var btn = h("button", { type: "button", "class": "bp", "aria-label": "Toggle breakpoint at 0x" + Z.hex4(row.address), "aria-pressed": "false" });
        btn.addEventListener("click", function () {
          var on = !breakpoints.has(row.address);
          if (on) { breakpoints.add(row.address); } else { breakpoints.delete(row.address); }
          btn.setAttribute("aria-pressed", String(on));
          btn.parentNode.parentNode.classList.toggle("has-bp", on);
        });
        var tr = h("tr", { "class": row.implemented ? "" : "unimpl" }, [
          h("td", {}, [btn]), h("td", { text: Z.hex4(row.address) }),
          h("td", { text: row.bytes.map(hex2).join(" ") }), h("td", { text: row.text })
        ]);
        listingRows[row.address] = tr;
        el.listBody.appendChild(tr);
      });
    }

    // ---------- Actions ----------
    function stopRun() {
      running = false;
      if (timer !== null) { clearTimeout(timer); timer = null; }
    }

    function loadFromText() {
      stopRun();
      var parsed = Z.parseHexBytes(el.text.value);
      if (!parsed.ok) { say(parsed.error, "error"); updateControls(); return; }
      var res = cpu.loadProgram(parsed.bytes);
      if (!res.ok) { say(res.error, "error"); updateControls(); return; }
      breakpoints.clear(); prev = null;
      buildListing();
      showResult(null);
      el.last.textContent = "No instruction has run yet.";
      var unimpl = cpu.listing().filter(function (r) { return !r.implemented; }).length;
      say("Loaded " + res.length + " bytes." + (unimpl ? " Warning: " + unimpl + " instruction(s) use opcodes this simulator does not implement; the CPU will stop there." : ""), unimpl ? "warn" : "ok");
      render(false);
    }

    function doReset() {
      stopRun(); cpu.reset(); prev = null; ranTotal = 0;
      el.last.textContent = "No instruction has run yet."; el.changes.textContent = "";
      say("Reset. The program is still loaded.", "ok");
      render(false);
    }

    function doStep() {
      if (running) { return; }
      var r = cpu.step();
      showResult(r);
      if (!r.ok) { say(r.fault.message, "error"); }
      else if (r.idle) { say("The program is jumping to itself: it has finished (idle).", "ok"); }
      else { say("", ""); }
      render(true);
    }

    function tick() {
      timer = null;
      if (!running) { return; }
      var sp = SPEEDS[parseInt(el.speed.value, 10)];
      var res = cpu.run({ maxSteps: sp.steps, breakpoints: Array.from(breakpoints) });
      ranTotal += res.steps;
      if (res.lastResult) { showResult(res.lastResult); }
      if (res.stopReason === "fault") { running = false; say(res.lastResult.fault.message, "error"); }
      else if (res.stopReason === "breakpoint") { running = false; say("Stopped at breakpoint 0x" + Z.hex4(cpu.pc) + " (before running it).", "ok"); }
      else if (res.stopReason === "idle") { running = false; say("The program is jumping to itself: it has finished (idle).", "ok"); }
      render(true);
      if (running) { timer = setTimeout(tick, sp.interval); }
    }

    function doRun() {
      if (running || cpu.fault || cpu.programEnd === 0) { return; }
      running = true; say("", "");
      updateControls();
      timer = setTimeout(tick, 0);
    }

    function doPause() {
      if (!running) { return; }
      stopRun(); say("Paused.", "ok"); render(true);
    }

    el.load.addEventListener("click", loadFromText);
    el.reset.addEventListener("click", doReset);
    el.step.addEventListener("click", doStep);
    el.run.addEventListener("click", doRun);
    el.pause.addEventListener("click", doPause);
    el.sample.addEventListener("change", function () {
      var s = Z.SAMPLES.filter(function (x) { return x.id === el.sample.value; })[0];
      if (s) { el.text.value = s.hex; el.about.textContent = s.about; loadFromText(); }
      else { el.about.textContent = ""; }
    });
    el.text.addEventListener("input", function () { el.sample.value = ""; el.about.textContent = ""; });

    // Start with the first sample loaded so the page is never empty.
    el.sample.value = Z.SAMPLES[0].id;
    el.text.value = Z.SAMPLES[0].hex;
    el.about.textContent = Z.SAMPLES[0].about;
    loadFromText();

    return { cpu: cpu };
  }

  Z.mountSimulator = mount;

  function auto() {
    var host = document.getElementById("simulator-root");
    if (!host) { return; }
    try {
      Z.simulator = mount(host);
    } catch (e) {
      host.textContent = "The simulator could not start: " + (e && e.message ? e.message : String(e));
      host.setAttribute("role", "alert");
      if (root.console) { root.console.error(e); }
    }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", auto); } else { auto(); }
})(typeof globalThis !== "undefined" ? globalThis : this);
