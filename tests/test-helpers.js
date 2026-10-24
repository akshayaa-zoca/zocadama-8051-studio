// Zocadama 8051 Studio - tests/test-helpers.js
// A tiny test framework (no downloads needed). It works in a browser and in Node.
//   T.group("name")        starts a group of tests
//   T.test("name", fn)     registers one test; fn throws if something is wrong
//   T.eq(actual, expected) checks two values are exactly equal
//   T.run()                runs everything and returns the results

(function (root) {
  "use strict";
  var T = (root.Z8051Test = { tests: [], group_: "", executed: {} });

  T.group = function (name) { T.group_ = name; };
  T.test = function (name, fn) { T.tests.push({ group: T.group_, name: name, fn: fn }); };

  function show(v) {
    if (typeof v === "number") { return v + " (0x" + v.toString(16).toUpperCase() + ")"; }
    return JSON.stringify(v);
  }
  T.eq = function (actual, expected, label) {
    if (actual !== expected) {
      throw new Error((label ? label + ": " : "") + "expected " + show(expected) + " but got " + show(actual));
    }
  };
  T.ok = function (cond, label) { if (!cond) { throw new Error(label || "condition was false"); } };
  T.same = function (actual, expected, label) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { throw new Error((label ? label + ": " : "") + "expected " + e + " but got " + a); }
  };
  T.includes = function (text, part, label) {
    if (String(text).indexOf(part) < 0) { throw new Error((label ? label + ": " : "") + "expected text to contain \"" + part + "\" but it was \"" + text + "\""); }
  };

  // A fresh CPU with a program loaded. Every opcode it executes is recorded,
  // so the final test can prove each advertised instruction was really run.
  T.newCpu = function (bytes) {
    var cpu = root.Z8051.createCpu();
    var r = cpu.loadProgram(bytes);
    if (!r.ok) { throw new Error("test program failed to load: " + r.error); }
    var realStep = cpu.step;
    cpu.step = function () {
      var res = realStep.call(cpu);
      if (res.ok) { T.executed[res.opcode] = true; }
      return res;
    };
    return cpu;
  };

  // A CPU whose first instruction sits at `addr` (earlier bytes are NOPs).
  T.cpuAt = function (addr, bytes) {
    var p = [];
    for (var k = 0; k < addr; k++) { p.push(0x00); }
    var cpu = T.newCpu(p.concat(bytes));
    cpu.pc = addr;
    return cpu;
  };

  // Run a program to completion; "SJMP to itself" is appended automatically.
  T.runProg = function (bytes, maxSteps) {
    var cpu = T.newCpu(bytes.concat([0x80, 0xFE]));
    var res = cpu.run({ maxSteps: maxSteps || 100000 });
    return { cpu: cpu, res: res };
  };

  T.stepN = function (cpu, n) {
    var last = null;
    for (var k = 0; k < n; k++) {
      last = cpu.step();
      if (!last.ok) { throw new Error("step " + (k + 1) + " faulted: " + last.fault.message); }
    }
    return last;
  };

  T.flags = function (cpu) {
    var p = cpu.getPSW();
    return { cy: (p >> 7) & 1, ac: (p >> 6) & 1, ov: (p >> 2) & 1, p: p & 1 };
  };

  // Same as run(), but waits for tests that return a promise (used by the screen tests).
  T.runAsync = async function () {
    var results = [];
    for (var i = 0; i < T.tests.length; i++) {
      var t = T.tests[i];
      var r = { group: t.group, name: t.name, passed: true, error: null };
      try { await t.fn(); } catch (e) { r.passed = false; r.error = e && e.message ? e.message : String(e); }
      results.push(r);
    }
    var passed = results.filter(function (r) { return r.passed; }).length;
    return { total: results.length, passed: passed, failed: results.length - passed, results: results };
  };

  T.run = function () {
    var results = [];
    T.tests.forEach(function (t) {
      var r = { group: t.group, name: t.name, passed: true, error: null };
      try { t.fn(); } catch (e) { r.passed = false; r.error = e && e.message ? e.message : String(e); }
      results.push(r);
    });
    var passed = results.filter(function (r) { return r.passed; }).length;
    return { total: results.length, passed: passed, failed: results.length - passed, results: results };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
