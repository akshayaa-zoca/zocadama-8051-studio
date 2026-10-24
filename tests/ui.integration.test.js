// Zocadama 8051 Studio - tests/ui.integration.test.js
// Integration tests for the simulator SCREEN. Each test builds a fresh copy of the real
// simulator panel and uses it the way a person would: it types into the box and clicks
// the real buttons. Open tests/integration-tests.html to run them.

(function (root) {
  "use strict";
  var Z = root.Z8051, T = root.Z8051Test;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(cond, label, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < (ms || 5000)) { if (cond()) { return; } await wait(20); }
    throw new Error("timed out waiting for: " + label);
  }

  async function withSim(fn) {
    var host = document.createElement("div");
    document.getElementById("sandbox").appendChild(host);
    try {
      var sim = Z.mountSimulator(host);
      var h = {
        host: host, sim: sim,
        q: function (sel) { var n = host.querySelector(sel); if (!n) { throw new Error("element not found: " + sel); } return n; },
        btn: function (text) {
          var b = Array.prototype.filter.call(host.querySelectorAll("button"), function (x) { return x.textContent === text; })[0];
          if (!b) { throw new Error("button not found: " + text); }
          return b;
        },
        val: function (id) { return h.q("#" + id).textContent; },
        msg: function () { return h.q(".sim-message").textContent; },
        rows: function () { return host.querySelectorAll(".sim-listing tbody tr"); },
        ram: function (a) { return host.querySelectorAll("table.sim-mem td.mem")[a]; },
        setHex: function (text) {
          var ta = h.q("#sim-hex"); ta.value = text;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          h.btn("Load program").click();
        },
        fast: function () { var s = h.q("#sim-speed"); s.value = "2"; s.dispatchEvent(new Event("change", { bubbles: true })); },
        pick: function (id) { var s = h.q("#sim-sample"); s.value = id; s.dispatchEvent(new Event("change", { bubbles: true })); },
        changed: function (id) { return h.q("#" + id).parentElement.classList.contains("changed"); }
      };
      await fn(h);
    } finally { host.remove(); }
  }

  T.group("Simulator screen: start-up");

  T.test("builds every panel: 17 register boxes, 7 flags, 256 RAM cells, 5 examples + custom", async function () {
    await withSim(function (h) {
      T.eq(h.host.querySelectorAll(".reg").length, 17, "register boxes (9 + R0-R7)");
      T.eq(h.host.querySelectorAll(".flag").length, 7, "PSW flags");
      T.eq(h.host.querySelectorAll("table.sim-mem td.mem").length, 256, "RAM cells");
      T.eq(h.q("#sim-sample").options.length, 6, "examples + custom");
      ["Reset", "Step", "Run", "Pause", "Load program"].forEach(function (name) { h.btn(name); });
    });
  });

  T.test("starts with the first example loaded: PC 0x0000, four listing rows, ready", async function () {
    await withSim(function (h) {
      T.eq(h.val("rPC"), "0x0000"); T.eq(h.rows().length, 4);
      T.includes(h.q(".sim-state").textContent, "Ready");
      T.ok(!h.btn("Step").disabled, "Step enabled"); T.ok(h.btn("Pause").disabled, "Pause disabled when idle");
    });
  });

  T.test("the limitation banner is shown", async function () {
    await withSim(function (h) { T.includes(h.q(".sim-banner").textContent, "not full 8051 or AT89S52 compatibility"); });
  });

  T.group("Simulator screen: stepping and resetting");

  T.test("Step runs one instruction: A=0x25, PC=0x0002, change highlighted, last instruction listed", async function () {
    await withSim(function (h) {
      h.btn("Step").click();
      T.eq(h.val("rA"), "0x25"); T.eq(h.val("rPC"), "0x0002");
      T.ok(h.changed("rA"), "A highlighted"); T.ok(h.changed("rPC"), "PC highlighted"); T.ok(!h.changed("rB"), "B not highlighted");
      T.includes(h.q(".sim-last").textContent, "MOV A,#0x25");
      T.includes(h.q(".sim-changes").textContent, "ACC");
    });
  });

  T.test("RAM changes appear in the memory grid and are highlighted", async function () {
    await withSim(function (h) {
      for (var k = 0; k < 3; k++) { h.btn("Step").click(); }
      T.eq(h.ram(0x30).textContent, "3C"); T.ok(h.ram(0x30).classList.contains("changed"), "highlighted");
    });
  });

  T.test("Reset returns to the start state and clears highlights", async function () {
    await withSim(function (h) {
      h.btn("Step").click(); h.btn("Step").click();
      h.btn("Reset").click();
      T.eq(h.val("rA"), "0x00"); T.eq(h.val("rPC"), "0x0000"); T.eq(h.val("rSP"), "0x07");
      T.eq(h.host.querySelectorAll(".changed").length, 0, "no highlighted cells after Reset");
      T.includes(h.msg(), "Reset");
    });
  });

  T.test("stepping into the final jump-to-itself says the program has finished", async function () {
    await withSim(function (h) {
      for (var k = 0; k < 4; k++) { h.btn("Step").click(); }
      T.includes(h.msg(), "finished");
    });
  });

  T.test("flags light up: 0x7F + 1 sets OV and AC but not CY", async function () {
    await withSim(function (h) {
      h.pick("flags"); h.btn("Step").click(); h.btn("Step").click();
      var on = Array.prototype.map.call(h.host.querySelectorAll(".flag.on .flag-name"), function (n) { return n.textContent; });
      T.ok(on.indexOf("OV") >= 0 && on.indexOf("AC") >= 0 && on.indexOf("CY") < 0, "lit flags: " + on.join(","));
    });
  });

  T.test("the register-bank display follows PSW (bank 1: R0 is RAM 08h)", async function () {
    await withSim(function (h) {
      h.setHex("75 D0 08 78 AB 80 FE");
      h.btn("Step").click(); h.btn("Step").click();
      T.eq(h.val("rR0"), "0xAB"); T.eq(h.ram(8).textContent, "AB");
      T.includes(h.host.textContent, "register bank 1");
    });
  });

  T.group("Simulator screen: running");

  T.test("every example runs to its documented result", async function () {
    var expect = { add: "0x3C", count: "0x05", subroutine: "0x07", flags: "0x7F", "upper-ram": "0xA5" };
    for (var id in expect) {
      await withSim(async function (h) {
        h.pick(id); h.fast(); h.btn("Run").click();
        await waitFor(function () { return h.msg().indexOf("finished") >= 0; }, "example " + id + " to finish");
        T.eq(h.val("rA"), expect[id], "A at the end of example " + id);
      });
    }
  });

  T.test("Run stops BEFORE a breakpoint, and resuming runs that instruction", async function () {
    await withSim(async function (h) {
      h.rows()[2].querySelector("button.bp").click();
      h.fast(); h.btn("Run").click();
      await waitFor(function () { return h.msg().indexOf("breakpoint") >= 0; }, "breakpoint");
      T.eq(h.val("rPC"), "0x0004"); T.eq(h.ram(0x30).textContent, "00", "instruction at the breakpoint has not run");
      h.btn("Run").click();
      await waitFor(function () { return h.msg().indexOf("finished") >= 0; }, "finish after resuming");
      T.eq(h.ram(0x30).textContent, "3C");
    });
  });

  T.test("Pause stops an endless loop and the CPU really stops", async function () {
    await withSim(async function (h) {
      h.setHex("04 80 FD"); h.fast(); h.btn("Run").click();
      await wait(120);
      T.ok(!h.btn("Pause").disabled, "Pause enabled while running");
      h.btn("Pause").click();
      T.includes(h.msg(), "Paused");
      var a = h.val("rA"); await wait(150);
      T.eq(h.val("rA"), a, "A must not change after Pause");
    });
  });

  T.group("Simulator screen: program loading and errors");

  T.test("custom hexadecimal input loads and shows a listing", async function () {
    await withSim(function (h) {
      h.setHex("74 05 24 01 80 FE");
      T.eq(h.rows().length, 3); T.includes(h.msg(), "Loaded 6 bytes"); T.eq(h.q("#sim-sample").value, "");
    });
  });

  T.test("invalid hexadecimal shows an error and keeps the previous program", async function () {
    await withSim(function (h) {
      h.setHex("74 ZZ");
      T.includes(h.msg(), "not a hexadecimal"); T.ok(h.q(".sim-message").classList.contains("error"), "shown as an error");
      T.eq(h.rows().length, 4, "previous program still loaded");
    });
  });

  T.test("HTML or script text is rejected as plain text and never becomes page elements", async function () {
    await withSim(function (h) {
      root.__pwned = undefined;
      h.setHex("<img src=x onerror=window.__pwned=1>");
      T.includes(h.msg(), "not a hexadecimal");
      T.eq(h.host.querySelectorAll("img").length, 0, "no <img> created");
      T.eq(root.__pwned, undefined, "no script ran");
    });
  });

  T.test("a program larger than 8192 bytes is rejected", async function () {
    await withSim(function (h) {
      h.setHex(new Array(8193).fill("00").join(" "));
      T.includes(h.msg(), "longer than");
    });
  });

  T.test("an unimplemented opcode: warning on load, fault when reached, controls disabled, Reset recovers", async function () {
    await withSim(function (h) {
      h.setHex("74 01 84 80 FE");
      T.ok(h.q(".sim-message").classList.contains("warn"), "warning on load"); T.includes(h.msg(), "not implement");
      T.ok(h.rows()[1].classList.contains("unimpl"), "row marked unimplemented");
      h.btn("Step").click(); h.btn("Step").click();
      T.includes(h.msg(), "not implemented"); T.ok(h.q(".sim-state").classList.contains("error"), "state line is an error");
      T.ok(h.btn("Step").disabled && h.btn("Run").disabled, "Step and Run disabled after a fault");
      T.eq(h.val("rA"), "0x01", "state from before the failing instruction"); T.eq(h.val("rPC"), "0x0002");
      h.btn("Reset").click();
      T.ok(!h.btn("Step").disabled, "Reset recovers");
    });
  });

  T.test("touching an SFR that is not modelled names it in the fault message", async function () {
    await withSim(function (h) {
      h.setHex("E5 88 80 FE"); h.btn("Step").click();
      T.includes(h.msg(), "TCON"); T.includes(h.msg(), "not modelled");
    });
  });

  T.group("Instruction reference");

  T.test("the reference table is generated from the engine's opcode table", async function () {
    var host = document.createElement("div"); document.getElementById("sandbox").appendChild(host);
    try {
      var res = Z.mountOpcodeReference(host);
      T.eq(res.opcodes, Object.keys(Z.OPCODES).length, "opcode count");
      T.includes(host.textContent, "ADD A,#data"); T.includes(host.textContent, "MOV A,Rn"); T.includes(host.textContent, "DJNZ Rn,rel");
      T.includes(host.textContent, "104 opcodes are implemented");
    } finally { host.remove(); }
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
