// Zocadama 8051 Studio - tests/cpu.test.js
// Automated tests for the CPU engine. Open tests/run-tests.html to run them in a browser,
// or run "node tests/run-node.js". Expected values come from the 8051 reference
// tables and datasheet rules, NOT from reading this engine's own code.

(function (root) {
  "use strict";
  var Z = root.Z8051, T = root.Z8051Test;
  var NOP_SJMP = [0x80, 0xFE];

  function popcountParity(v) { return (v.toString(2).split("1").length - 1) % 2; }
  function signed(v) { return v > 127 ? v - 256 : v; }

  // Independent reference models for the arithmetic flags (plain integer maths).
  function refAdd(a, b, c) {
    var u = a + b + c, s = signed(a) + signed(b) + c;
    return { res: u & 255, cy: u > 255 ? 1 : 0, ac: ((a % 16) + (b % 16) + c) > 15 ? 1 : 0, ov: (s < -128 || s > 127) ? 1 : 0 };
  }
  function refSub(a, b, c) {
    var u = a - b - c, s = signed(a) - signed(b) - c;
    return { res: ((u % 256) + 256) % 256, cy: u < 0 ? 1 : 0, ac: ((a % 16) - (b % 16) - c) < 0 ? 1 : 0, ov: (s < -128 || s > 127) ? 1 : 0 };
  }

  // Run one instruction with chosen A and carry-in; check against the reference.
  function checkArith(cpu, a, b, c, ref, label) {
    cpu.reset();
    cpu.sfr[0xE0] = a;
    cpu.sfr[0xD0] = (c << 7) | 0x30;           // carry-in, F0=1, RS1=1 (must be preserved)
    var r = cpu.step();
    var f = T.flags(cpu);
    var raw = cpu.sfr[0xD0];
    if (!r.ok || cpu.getA() !== ref.res || f.cy !== ref.cy || f.ac !== ref.ac || f.ov !== ref.ov ||
        f.p !== popcountParity(ref.res) || (raw & 0x38) !== 0x30) {
      throw new Error(label + " a=0x" + a.toString(16) + " b=0x" + b.toString(16) + " cin=" + c +
        ": expected " + JSON.stringify(ref) + " but got A=" + cpu.getA() + " " + JSON.stringify(f) + " rawPSW=0x" + raw.toString(16));
    }
  }

  // ===================== Reset and loading =====================
  T.group("Reset and loading");

  T.test("reset values match the 8051 data sheet (PC=0, SP=07, A=B=PSW=0, ports=FF)", function () {
    var s = T.newCpu([0x00]).snapshot();
    T.eq(s.pc, 0, "PC"); T.eq(s.a, 0, "A"); T.eq(s.b, 0, "B"); T.eq(s.sp, 7, "SP"); T.eq(s.psw, 0, "PSW");
    T.eq(s.p0, 0xFF, "P0"); T.eq(s.p1, 0xFF, "P1"); T.eq(s.p2, 0xFF, "P2"); T.eq(s.p3, 0xFF, "P3");
    T.eq(s.iram.length, 256, "RAM size");
    T.ok(s.iram.every(function (v) { return v === 0; }), "RAM should be cleared");
  });

  T.test("MOV DPTR,#data16 loads DPH and DPL", function () {
    var cpu = T.newCpu([0x90, 0x12, 0x34]);
    var r = cpu.step();
    T.ok(r.ok, "instruction should execute successfully");
    var s = cpu.snapshot();
    T.eq(s.dph, 0x12, "DPH high byte");
    T.eq(s.dpl, 0x34, "DPL low byte");
    T.eq(s.pc, 3, "PC advances by three bytes");
  });
  
    T.test("INC DPTR increments the 16-bit data pointer", function () {
    var cpu = T.newCpu([0x90, 0x12, 0x34, 0xA3]);
    cpu.step(); // MOV DPTR,#1234
    var r = cpu.step(); // INC DPTR
    T.ok(r.ok, "INC DPTR should execute successfully");
    var s = cpu.snapshot();
    T.eq(s.dph, 0x12, "DPH remains 0x12");
    T.eq(s.dpl, 0x35, "DPL increments to 0x35");
    T.eq(s.pc, 4, "PC advances to byte 4");
  });

  T.test("INC DPTR wraps from 0xFFFF to 0x0000", function () {
    var cpu = T.newCpu([0x90, 0xFF, 0xFF, 0xA3]);
    cpu.step(); // MOV DPTR,#FFFF
    var r = cpu.step(); // INC DPTR
    T.ok(r.ok, "INC DPTR should execute successfully");
    var s = cpu.snapshot();
    T.eq(s.dph, 0x00, "DPH wraps to 0x00");
    T.eq(s.dpl, 0x00, "DPL wraps to 0x00");
  });
  
  T.test("CLR bit clears a bit in bit-addressable RAM and preserves other bits", function () {
    var cpu = T.newCpu([0xC2, 0x03]); // CLR bit 03h
    cpu.iram[0x20] = 0xFF;
    var r = cpu.step();
    T.ok(r.ok, "CLR bit should execute successfully");
    T.eq(cpu.iram[0x20], 0xF7, "only bit 3 should be cleared");
    T.eq(cpu.pc, 2, "PC advances by two bytes");
  });

  T.test("CLR bit clears a bit in the bit-addressable P1 SFR", function () {
    var cpu = T.newCpu([0xC2, 0x90]); // CLR P1.0
    cpu.sfr[0x90] = 0xFF;
    var r = cpu.step();
    T.ok(r.ok, "CLR bit should execute successfully");
    T.eq(cpu.sfr[0x90], 0xFE, "P1.0 should be cleared");
    T.eq(cpu.pc, 2, "PC advances by two bytes");
  });

  T.test("reset restores the start state but keeps the program loaded", function () {
    var cpu = T.newCpu([0x74, 0x05, 0x80, 0xFE]);
    cpu.run({});
    T.eq(cpu.getA(), 5);
    cpu.reset();
    T.eq(cpu.getA(), 0); T.eq(cpu.pc, 0); T.eq(cpu.instructionCount, 0);
    cpu.run({});
    T.eq(cpu.getA(), 5, "program should still run after reset");
  });

  T.test("reset clears a fault", function () {
    var cpu = T.newCpu([0x84]);
    T.ok(!cpu.step().ok); T.ok(cpu.fault !== null);
    cpu.reset();
    T.eq(cpu.fault, null);
  });

  T.test("program memory is 8 KB: 8192 bytes load, 8193 are rejected", function () {
    var cpu = Z.createCpu();
    T.ok(cpu.loadProgram(new Array(8192).fill(0)).ok, "8192 bytes");
    T.ok(!cpu.loadProgram(new Array(8193).fill(0)).ok, "8193 bytes");
  });

  T.test("empty programs and non-byte values are rejected", function () {
    var cpu = Z.createCpu();
    T.ok(!cpu.loadProgram([]).ok); T.ok(!cpu.loadProgram([256]).ok); T.ok(!cpu.loadProgram([-1]).ok);
    T.ok(!cpu.loadProgram([1.5]).ok); T.ok(!cpu.loadProgram(["7"]).ok);
  });

  // ===================== Addressing modes =====================
  T.group("Addressing: direct, indirect, upper RAM, SFRs");

  T.test("direct addressing reaches low RAM (MOV 30h,#AB then MOV A,30h)", function () {
    var o = T.runProg([0x75, 0x30, 0xAB, 0xE5, 0x30]);
    T.eq(o.cpu.iram[0x30], 0xAB); T.eq(o.cpu.getA(), 0xAB);
  });

  T.test("indirect addressing reaches low RAM the same way", function () {
    var o = T.runProg([0x74, 0x3C, 0x78, 0x30, 0xF6, 0x79, 0x30, 0xE7]);
    T.eq(o.cpu.iram[0x30], 0x3C); T.eq(o.cpu.getA(), 0x3C);
  });

  T.test("address 90h: indirect = upper RAM, direct = P1 register (datasheet rule)", function () {
    var cpu = T.newCpu([0x74, 0x5A, 0x78, 0x90, 0xF6, 0x75, 0x90, 0xA5, 0xE6, 0xE5, 0x90]);
    T.stepN(cpu, 3);
    T.eq(cpu.iram[0x90], 0x5A, "upper RAM written");
    T.eq(cpu.sfr[0x90], 0xFF, "P1 untouched by the indirect write");
    T.stepN(cpu, 1);
    T.eq(cpu.sfr[0x90], 0xA5, "P1 written by the direct write");
    T.eq(cpu.iram[0x90], 0x5A, "upper RAM untouched by the direct write");
    T.stepN(cpu, 1); T.eq(cpu.getA(), 0x5A, "MOV A,@R0 reads upper RAM");
    T.stepN(cpu, 1); T.eq(cpu.getA(), 0xA5, "MOV A,P1 reads the register");
  });

  T.test("indirect writes reach every upper-RAM byte (80h-FFh) and never touch an SFR", function () {
    var cpu = T.newCpu([0xF6]);                                   // MOV @R0,A
    for (var addr = 0x80; addr <= 0xFF; addr++) {
      cpu.reset();
      cpu.iram[0] = addr;                                         // R0 (bank 0) points at addr
      cpu.sfr[0xE0] = (addr ^ 0x5A) & 0xFF;
      var sfrBefore = Array.prototype.slice.call(cpu.sfr);
      cpu.step();
      T.eq(cpu.iram[addr], (addr ^ 0x5A) & 0xFF, "upper RAM at 0x" + addr.toString(16));
      T.same(Array.prototype.slice.call(cpu.sfr), sfrBefore, "SFRs untouched at 0x" + addr.toString(16));
    }
  });

  T.test("indirect reads come from every upper-RAM byte (80h-FFh), not from the SFR of the same address", function () {
    var cpu = T.newCpu([0xE6]);                                   // MOV A,@R0
    for (var addr = 0x80; addr <= 0xFF; addr++) {
      cpu.reset();
      cpu.iram[0] = addr; cpu.iram[addr] = (addr * 3) & 0xFF;
      cpu.step();
      T.eq(cpu.getA(), (addr * 3) & 0xFF, "upper RAM at 0x" + addr.toString(16));
    }
  });

  T.test("P0-P3, B, ACC, SP, DPL, DPH are readable and writable by direct addressing", function () {
    var o = T.runProg([
      0x75, 0x80, 0x11, 0x75, 0x90, 0x22, 0x75, 0xA0, 0x33, 0x75, 0xB0, 0x44,
      0x75, 0xF0, 0x55, 0x75, 0xE0, 0x66, 0x75, 0x82, 0x77, 0x75, 0x83, 0x88,
      0xE5, 0xF0]);
    var c = o.cpu;
    T.eq(c.sfr[0x80], 0x11, "P0"); T.eq(c.sfr[0x90], 0x22, "P1"); T.eq(c.sfr[0xA0], 0x33, "P2"); T.eq(c.sfr[0xB0], 0x44, "P3");
    T.eq(c.getB(), 0x55, "B"); T.eq(c.sfr[0x82], 0x77, "DPL"); T.eq(c.sfr[0x83], 0x88, "DPH");
    T.eq(c.getA(), 0x55, "MOV A,B read back through direct addressing (final instruction)");
  });

  T.test("writing ACC directly changes A; writing SP directly changes SP", function () {
    var o = T.runProg([0x75, 0xE0, 0x42, 0x75, 0x81, 0x30]);
    T.eq(o.cpu.getA(), 0x42); T.eq(o.cpu.getSP(), 0x30);
  });

  T.test("PSW bit 0 is read-only parity: writes to it are ignored", function () {
    var c = T.runProg([0x74, 0x01, 0x75, 0xD0, 0x00]).cpu;      // A=01 has odd parity
    T.eq(c.sfr[0xD0], 0x00, "stored PSW"); T.eq(c.getPSW(), 0x01, "PSW as read");
    var d = T.runProg([0x75, 0xD0, 0xFF]).cpu;                  // A=00 has even parity
    T.eq(d.sfr[0xD0], 0xFE, "stored PSW has bit 0 cleared"); T.eq(d.getPSW(), 0xFE, "PSW as read");
  });

  T.test("reading PSW through MOV A,PSW includes the parity bit", function () {
    var c = T.runProg([0x75, 0xD0, 0x80, 0x74, 0x07, 0xE5, 0xD0]).cpu;   // CY=1, A=07 (parity 1)
    T.eq(c.getA(), 0x81);
  });

  T.test("reading an SFR that exists on the AT89S52 but is not modelled stops with a clear message", function () {
    var cpu = T.newCpu([0xE5, 0x88]);
    var before = JSON.stringify(cpu.snapshot());
    var r = cpu.step();
    T.ok(!r.ok); T.includes(r.fault.message, "TCON"); T.includes(r.fault.message, "not modelled");
    T.eq(JSON.stringify(cpu.snapshot()), before, "state must be unchanged");
  });

  T.test("every unmodelled AT89S52 SFR address stops the CPU on read and on write", function () {
    Object.keys(Z.UNMODELLED_SFRS).forEach(function (k) {
      var addr = parseInt(k, 10);
      var rd = T.newCpu([0xE5, addr]).step();
      T.ok(!rd.ok, "read 0x" + addr.toString(16));
      var wr = T.newCpu([0x75, addr, 0x01]).step();
      T.ok(!wr.ok, "write 0x" + addr.toString(16));
    });
  });

  T.test("an address with no SFR at all (0x95) stops the CPU", function () {
    var r = T.newCpu([0xE5, 0x95]).step();
    T.ok(!r.ok); T.includes(r.fault.message, "no SFR is defined");
  });

  T.test("a failed write to an unmodelled SFR leaves everything unchanged", function () {
    var cpu = T.newCpu([0x74, 0x01, 0xF5, 0x88]);
    T.stepN(cpu, 1);
    var before = JSON.stringify(cpu.snapshot());
    T.ok(!cpu.step().ok);
    T.eq(JSON.stringify(cpu.snapshot()), before);
  });

  // ===================== Register banks =====================
  T.group("Register banks");

  T.test("R0-R7 map to RAM 00h-1Fh according to PSW.RS1/RS0, for all four banks", function () {
    for (var bank = 0; bank < 4; bank++) {
      for (var r = 0; r < 8; r++) {
        var c = T.runProg([0x75, 0xD0, bank << 3, 0x78 + r, 0x40 + r]).cpu;
        T.eq(c.getBank(), bank, "bank");
        T.eq(c.iram[bank * 8 + r], 0x40 + r, "bank " + bank + " R" + r);
      }
    }
  });

  T.test("banks do not overwrite each other", function () {
    var c = T.runProg([0x7A, 0xAA, 0x75, 0xD0, 0x08, 0x7A, 0xBB, 0x75, 0xD0, 0x10, 0x7A, 0xCC]).cpu;
    T.eq(c.iram[0x02], 0xAA); T.eq(c.iram[0x0A], 0xBB); T.eq(c.iram[0x12], 0xCC);
  });

  T.test("registers are real RAM: MOV 00h,#5C is visible as R0 in bank 0", function () {
    var c = T.runProg([0x75, 0x00, 0x5C, 0xE8]).cpu;
    T.eq(c.getA(), 0x5C);
  });

  T.test("MOV Rn,#data, MOV A,Rn and MOV Rn,A work for every register R0-R7", function () {
    for (var r = 0; r < 8; r++) {
      var c = T.runProg([0x78 + r, 0x10 + r, 0xE8 + r, 0x04, 0xF8 + r]).cpu;    // R=v; A=R; A++; R=A
      T.eq(c.iram[r], 0x11 + r, "R" + r);
    }
  });

  T.test("MOV A,@Ri and MOV @Ri,A use R0 and R1 of the selected bank", function () {
    var c = T.runProg([0x75, 0xD0, 0x08, 0x79, 0x50, 0x74, 0x77, 0xF7, 0x74, 0x00, 0xE7]).cpu;   // bank 1, R1=50h
    T.eq(c.iram[0x50], 0x77); T.eq(c.getA(), 0x77);
    T.eq(c.iram[0x09], 0x50, "R1 of bank 1 is RAM 09h");
  });

  // ===================== Parity =====================
  T.group("Parity flag");

  T.test("P equals the parity of A for all 256 values of A", function () {
    var cpu = T.newCpu([0x74, 0x00]);
    for (var v = 0; v < 256; v++) {
      cpu.reset(); cpu.code[1] = v; cpu.step();
      T.eq(cpu.getPSW() & 1, popcountParity(v), "A=0x" + v.toString(16));
    }
  });

  T.test("known parity examples: A=07 -> P=1, A=55 -> P=0, A=01 -> P=1, A=FF -> P=0", function () {
    [[0x07, 1], [0x55, 0], [0x01, 1], [0xFF, 0], [0x00, 0], [0x80, 1]].forEach(function (p) {
      var c = T.runProg([0x74, p[0]]).cpu;
      T.eq(c.getPSW() & 1, p[1], "A=0x" + p[0].toString(16));
    });
  });

  // ===================== Arithmetic =====================
  T.group("ADD, ADDC, SUBB and flags");

  T.test("ADD spot checks from the reference rules", function () {
    [
      [0x7F, 0x01, 0x80, 0, 1, 1], [0xFF, 0x01, 0x00, 1, 1, 0], [0x80, 0x80, 0x00, 1, 0, 1],
      [0x0F, 0x01, 0x10, 0, 1, 0], [0x00, 0x00, 0x00, 0, 0, 0], [0x7F, 0x7F, 0xFE, 0, 1, 1],
      [0xFF, 0xFF, 0xFE, 1, 1, 0], [0x40, 0x40, 0x80, 0, 0, 1]
    ].forEach(function (t) {
      var c = T.runProg([0x74, t[0], 0x24, t[1]]).cpu;
      var f = T.flags(c);
      var label = "0x" + t[0].toString(16) + "+0x" + t[1].toString(16);
      T.eq(c.getA(), t[2], label + " result"); T.eq(f.cy, t[3], label + " CY"); T.eq(f.ac, t[4], label + " AC"); T.eq(f.ov, t[5], label + " OV");
    });
  });

  T.test("ADDC adds the carry flag (SETB C first)", function () {
    [[0xFF, 0x00, 0x00, 1, 1, 0], [0x7F, 0x00, 0x80, 0, 1, 1], [0x0E, 0x01, 0x10, 0, 1, 0]].forEach(function (t) {
      var c = T.runProg([0xD3, 0x74, t[0], 0x34, t[1]]).cpu;
      var f = T.flags(c);
      T.eq(c.getA(), t[2]); T.eq(f.cy, t[3], "CY"); T.eq(f.ac, t[4], "AC"); T.eq(f.ov, t[5], "OV");
    });
  });

  T.test("SUBB spot checks (carry clear)", function () {
    [
      [0x10, 0x01, 0x0F, 0, 1, 0], [0x00, 0x01, 0xFF, 1, 1, 0], [0x80, 0x01, 0x7F, 0, 1, 1],
      [0x7F, 0xFF, 0x80, 1, 0, 1], [0x05, 0x05, 0x00, 0, 0, 0]
    ].forEach(function (t) {
      var c = T.runProg([0xC3, 0x74, t[0], 0x94, t[1]]).cpu;
      var f = T.flags(c);
      var label = "0x" + t[0].toString(16) + "-0x" + t[1].toString(16);
      T.eq(c.getA(), t[2], label + " result"); T.eq(f.cy, t[3], label + " CY"); T.eq(f.ac, t[4], label + " AC"); T.eq(f.ov, t[5], label + " OV");
    });
  });

  T.test("SUBB spot checks (carry set = borrow in)", function () {
    [[0x05, 0x05, 0xFF, 1, 1, 0], [0x00, 0x00, 0xFF, 1, 1, 0], [0x80, 0x00, 0x7F, 0, 1, 1]].forEach(function (t) {
      var c = T.runProg([0xD3, 0x74, t[0], 0x94, t[1]]).cpu;
      var f = T.flags(c);
      T.eq(c.getA(), t[2]); T.eq(f.cy, t[3], "CY"); T.eq(f.ac, t[4], "AC"); T.eq(f.ov, t[5], "OV");
    });
  });

  T.test("ADD A,#data matches an independent reference for all 65,536 inputs", function () {
    var cpu = T.newCpu([0x24, 0x00]);
    for (var a = 0; a < 256; a++) { for (var b = 0; b < 256; b++) {
      cpu.code[1] = b; checkArith(cpu, a, b, 0, refAdd(a, b, 0), "ADD");
    } }
  });

  T.test("ADDC A,#data matches an independent reference for all 131,072 inputs (carry in 0 and 1)", function () {
    var cpu = T.newCpu([0x34, 0x00]);
    for (var c = 0; c < 2; c++) { for (var a = 0; a < 256; a++) { for (var b = 0; b < 256; b++) {
      cpu.code[1] = b; checkArith(cpu, a, b, c, refAdd(a, b, c), "ADDC");
    } } }
  });

  T.test("SUBB A,#data matches an independent reference for all 131,072 inputs (borrow in 0 and 1)", function () {
    var cpu = T.newCpu([0x94, 0x00]);
    for (var c = 0; c < 2; c++) { for (var a = 0; a < 256; a++) { for (var b = 0; b < 256; b++) {
      cpu.code[1] = b; checkArith(cpu, a, b, c, refSub(a, b, c), "SUBB");
    } } }
  });

  T.test("register forms ADD/ADDC/SUBB A,Rn (all R0-R7) match the reference on a grid of values", function () {
    var vals = [0, 1, 7, 8, 0x0F, 0x10, 0x3F, 0x40, 0x7F, 0x80, 0x81, 0xC0, 0xF0, 0xFE, 0xFF];
    for (var r = 0; r < 8; r++) {
      var cpu = T.newCpu([0x28 + r, 0x38 + r, 0x98 + r]);
      vals.forEach(function (a) { vals.forEach(function (b) { [0, 1].forEach(function (c) {
        cpu.reset(); cpu.iram[r] = b; cpu.sfr[0xE0] = a; cpu.sfr[0xD0] = c << 7; cpu.pc = 0;
        cpu.step(); T.eq(cpu.getA(), refAdd(a, b, 0).res, "ADD R" + r); T.eq(T.flags(cpu).cy, refAdd(a, b, 0).cy, "ADD CY");
        cpu.reset(); cpu.iram[r] = b; cpu.sfr[0xE0] = a; cpu.sfr[0xD0] = c << 7; cpu.pc = 1;
        cpu.step(); T.eq(cpu.getA(), refAdd(a, b, c).res, "ADDC R" + r); T.eq(T.flags(cpu).ov, refAdd(a, b, c).ov, "ADDC OV");
        cpu.reset(); cpu.iram[r] = b; cpu.sfr[0xE0] = a; cpu.sfr[0xD0] = c << 7; cpu.pc = 2;
        cpu.step(); T.eq(cpu.getA(), refSub(a, b, c).res, "SUBB R" + r); T.eq(T.flags(cpu).ac, refSub(a, b, c).ac, "SUBB AC");
      }); }); });
    }
  });

  T.test("ADD A,direct reads low RAM and SFRs (B register)", function () {
    var c = T.runProg([0x75, 0x30, 0x20, 0x74, 0x15, 0x25, 0x30]).cpu;
    T.eq(c.getA(), 0x35);
    var d = T.runProg([0x75, 0xF0, 0x7F, 0x74, 0x01, 0x25, 0xF0]).cpu;
    T.eq(d.getA(), 0x80); T.eq(T.flags(d).ov, 1);
  });

  T.test("INC A and DEC A wrap and leave CY, AC, OV alone", function () {
    var cpu = T.newCpu([0x04, 0x14]);
    cpu.sfr[0xE0] = 0xFF; cpu.sfr[0xD0] = 0xC4;               // CY=1 AC=1 OV=1
    cpu.step(); T.eq(cpu.getA(), 0x00, "INC wraps"); T.eq(cpu.sfr[0xD0], 0xC4, "flags untouched");
    cpu.step(); T.eq(cpu.getA(), 0xFF, "DEC wraps"); T.eq(cpu.sfr[0xD0], 0xC4, "flags untouched");
  });

  T.test("INC Rn and DEC Rn wrap, work on every register, and leave flags alone", function () {
    for (var r = 0; r < 8; r++) {
      var cpu = T.newCpu([0x08 + r, 0x18 + r, 0x18 + r]);
      cpu.iram[r] = 0xFF; cpu.sfr[0xD0] = 0x84;
      cpu.step(); T.eq(cpu.iram[r], 0x00, "INC R" + r);
      cpu.step(); T.eq(cpu.iram[r], 0xFF, "DEC R" + r);
      cpu.step(); T.eq(cpu.iram[r], 0xFE, "DEC R" + r);
      T.eq(cpu.sfr[0xD0], 0x84, "flags untouched");
    }
  });

  // ===================== Logic and carry =====================
  T.group("Logic and carry instructions");

  T.test("ANL, ORL, XRL A,#data match JavaScript's own bit operators for all A and several data values", function () {
    var datas = [0x00, 0x0F, 0x55, 0xAA, 0xF0, 0xFF];
    var cpu = T.newCpu([0x54, 0x00, 0x44, 0x00, 0x64, 0x00]);
    for (var a = 0; a < 256; a++) { datas.forEach(function (d) {
      [[0, a & d], [2, a | d], [4, a ^ d]].forEach(function (t) {
        cpu.reset(); cpu.code[t[0] + 1] = d; cpu.pc = t[0]; cpu.sfr[0xE0] = a; cpu.sfr[0xD0] = 0xA0;
        cpu.step();
        T.eq(cpu.getA(), t[1], "opcode at " + t[0] + " a=" + a + " d=" + d);
        T.eq(cpu.sfr[0xD0], 0xA0, "flags untouched");
      });
    }); }
  });

  T.test("CLR A and CPL A", function () {
    var cpu = T.newCpu([0xF4, 0xE4]);
    cpu.sfr[0xE0] = 0x5A; cpu.sfr[0xD0] = 0x80;
    cpu.step(); T.eq(cpu.getA(), 0xA5, "CPL"); T.eq(cpu.sfr[0xD0], 0x80, "CY untouched");
    cpu.step(); T.eq(cpu.getA(), 0x00, "CLR"); T.eq(cpu.getPSW() & 1, 0, "parity of zero");
  });

  T.test("CLR C and SETB C change only the carry flag", function () {
    var cpu = T.newCpu([0xD3, 0xC3]);
    cpu.sfr[0xD0] = 0x3C;                                     // F0, RS1, RS0, OV set
    cpu.step(); T.eq(cpu.sfr[0xD0], 0xBC, "SETB C");
    cpu.step(); T.eq(cpu.sfr[0xD0], 0x3C, "CLR C");
  });

  // ===================== Jumps, branches, calls =====================
  T.group("Jumps, branch offsets, calls");

  T.test("SJMP: forward, backward and offset 0 (target = address of next instruction)", function () {
    var c = T.cpuAt(0, [0x80, 0x02]); c.step(); T.eq(c.pc, 4, "forward");
    c = T.cpuAt(4, [0x80, 0xFA]); c.step(); T.eq(c.pc, 0, "backward");
    c = T.cpuAt(0, [0x80, 0x00]); var r = c.step(); T.eq(c.pc, 2, "zero offset"); T.ok(!r.idle, "not an idle loop");
  });

  T.test("relative offset limits: +127 and -128 are measured from the NEXT instruction", function () {
    var c = T.cpuAt(0x100, [0x80, 0x7F]); c.step(); T.eq(c.pc, 0x102 + 127);
    c = T.cpuAt(0x100, [0x80, 0x80]); c.step(); T.eq(c.pc, 0x102 - 128);
    c = T.cpuAt(0x100, [0x80, 0xFF]); c.step(); T.eq(c.pc, 0x101);
  });

  T.test("a jump below address 0 wraps to the top of the 16-bit space, then stops (not on-chip flash)", function () {
    var c = T.cpuAt(0, [0x80, 0x80]);
    T.ok(c.step().ok); T.eq(c.pc, 0xFF82);
    var r = c.step(); T.ok(!r.ok); T.includes(r.fault.message, "beyond the 8 KB");
  });

  T.test("JZ / JNZ take the jump only when A is zero / non-zero (and change no flags)", function () {
    var c = T.cpuAt(0, [0x60, 0x05]); c.sfr[0xE0] = 0; c.sfr[0xD0] = 0xA0; c.step(); T.eq(c.pc, 7, "JZ taken"); T.eq(c.sfr[0xD0], 0xA0);
    c = T.cpuAt(0, [0x60, 0x05]); c.sfr[0xE0] = 1; c.step(); T.eq(c.pc, 2, "JZ not taken");
    c = T.cpuAt(0, [0x70, 0x05]); c.sfr[0xE0] = 1; c.step(); T.eq(c.pc, 7, "JNZ taken");
    c = T.cpuAt(0, [0x70, 0x05]); c.sfr[0xE0] = 0; c.step(); T.eq(c.pc, 2, "JNZ not taken");
  });

  T.test("JC / JNC follow the carry flag", function () {
    var c = T.cpuAt(0, [0x40, 0x05]); c.sfr[0xD0] = 0x80; c.step(); T.eq(c.pc, 7, "JC taken");
    c = T.cpuAt(0, [0x40, 0x05]); c.sfr[0xD0] = 0x00; c.step(); T.eq(c.pc, 2, "JC not taken");
    c = T.cpuAt(0, [0x50, 0x05]); c.sfr[0xD0] = 0x00; c.step(); T.eq(c.pc, 7, "JNC taken");
    c = T.cpuAt(0, [0x50, 0x05]); c.sfr[0xD0] = 0x80; c.step(); T.eq(c.pc, 2, "JNC not taken");
  });

  T.test("DJNZ Rn: decrements, jumps while non-zero, works for R0-R7, wraps 00 -> FF, changes no flags", function () {
    for (var r = 0; r < 8; r++) {
      var c = T.cpuAt(0, [0xD8 + r, 0xFE]); c.iram[r] = 1; c.sfr[0xD0] = 0xA5;
      c.step(); T.eq(c.iram[r], 0, "R" + r + " counted down"); T.eq(c.pc, 2, "falls through at zero"); T.eq(c.sfr[0xD0], 0xA5, "flags");
      c = T.cpuAt(0, [0xD8 + r, 0xFE]); c.iram[r] = 2;
      c.step(); T.eq(c.iram[r], 1); T.eq(c.pc, 0, "jumps back to itself");
      c = T.cpuAt(0, [0xD8 + r, 0xFE]); c.iram[r] = 0;
      c.step(); T.eq(c.iram[r], 0xFF, "wrap"); T.eq(c.pc, 0, "taken after wrap");
    }
  });

  T.test("DJNZ uses the selected register bank", function () {
    var c = T.cpuAt(0, [0xD8, 0xFE]); c.sfr[0xD0] = 0x08; c.iram[8] = 3; c.iram[0] = 9;
    c.step(); T.eq(c.iram[8], 2, "bank 1 R0"); T.eq(c.iram[0], 9, "bank 0 R0 untouched");
  });

  T.test("a counting loop with DJNZ runs exactly the right number of times", function () {
    var o = T.runProg([0x78, 0x05, 0x74, 0x00, 0x04, 0xD8, 0xFD]);
    T.eq(o.cpu.getA(), 5); T.eq(o.cpu.iram[0], 0);
    T.eq(o.cpu.instructionCount, 2 + 5 * 2 + 1, "2 setup + 5 loops of 2 + final SJMP");
  });

  T.test("LJMP jumps to a 16-bit address (high byte first); targets outside the program stop the CPU", function () {
    var c = T.cpuAt(0, [0x02, 0x01, 0x23]); c.step(); T.eq(c.pc, 0x0123);
    var r = c.step(); T.ok(!r.ok); T.includes(r.fault.message, "end of the loaded program");
    var d = T.cpuAt(0, [0x02, 0x20, 0x00]); d.step(); T.eq(d.pc, 0x2000);
    r = d.step(); T.ok(!r.ok); T.includes(r.fault.message, "beyond the 8 KB");
  });

  T.test("LCALL pushes the return address (low byte, then high byte) and RET restores it", function () {
    var c = T.newCpu([0x12, 0x00, 0x06, 0x80, 0xFE, 0x00, 0x22]);
    c.step();
    T.eq(c.pc, 6, "jumped"); T.eq(c.getSP(), 9, "SP"); T.eq(c.iram[8], 0x03, "return address low"); T.eq(c.iram[9], 0x00, "return address high");
    c.step();
    T.eq(c.pc, 3, "returned"); T.eq(c.getSP(), 7, "SP restored");
  });

  T.test("RET restores a return address whose high byte is not zero", function () {
    var program = new Array(0x0301).fill(0x00);
    program[0x0200] = 0x12; program[0x0201] = 0x03; program[0x0202] = 0x00; program[0x0300] = 0x22;   // LCALL 0x0300 ... RET
    var c = T.newCpu(program); c.pc = 0x0200;
    c.step(); T.eq(c.iram[8], 0x03, "return address low"); T.eq(c.iram[9], 0x02, "return address high"); T.eq(c.pc, 0x0300);
    c.step(); T.eq(c.pc, 0x0203);
  });

  T.test("nested calls: two LCALLs then two RETs unwind correctly", function () {
    var c = T.newCpu([0x12, 0x00, 0x06, 0x80, 0xFE, 0x00, 0x12, 0x00, 0x0B, 0x22, 0x00, 0x22]);
    c.step(); c.step();
    T.eq(c.getSP(), 0x0B); T.eq(c.iram[0x0A], 0x09, "inner return low"); T.eq(c.iram[0x0B], 0x00, "inner return high");
    c.step(); T.eq(c.pc, 9); T.eq(c.getSP(), 9);
    c.step(); T.eq(c.pc, 3); T.eq(c.getSP(), 7);
    var r = c.step(); T.ok(r.idle, "then SJMP to itself");
  });

  // ===================== Stack =====================
  T.group("Stack");

  T.test("first PUSH goes to RAM 08h and SP becomes 08; POP restores SP", function () {
    var c = T.newCpu([0x74, 0x99, 0xC0, 0xE0, 0xD0, 0x30]);
    T.stepN(c, 2); T.eq(c.iram[8], 0x99); T.eq(c.getSP(), 8);
    T.stepN(c, 1); T.eq(c.iram[0x30], 0x99); T.eq(c.getSP(), 7);
  });

  T.test("the stack is last-in, first-out", function () {
    var c = T.runProg([0x75, 0x30, 0x11, 0x75, 0x31, 0x22, 0xC0, 0x30, 0xC0, 0x31, 0xD0, 0x40, 0xD0, 0x41]).cpu;
    T.eq(c.iram[0x40], 0x22); T.eq(c.iram[0x41], 0x11); T.eq(c.getSP(), 7);
  });

  T.test("PUSH can read an SFR (P1) and POP can write one (B)", function () {
    var c = T.runProg([0xC0, 0x90, 0xD0, 0xF0]).cpu;
    T.eq(c.iram[8], 0xFF, "pushed P1"); T.eq(c.getB(), 0xFF, "popped into B");
  });

  T.test("the stack can live in the upper RAM; address 80h is RAM here, not port P0", function () {
    var c = T.newCpu([0x74, 0x5A, 0xC0, 0xE0]);
    c.sfr[0x81] = 0x7F; c.step(); c.step();
    T.eq(c.getSP(), 0x80); T.eq(c.iram[0x80], 0x5A, "upper RAM"); T.eq(c.sfr[0x80], 0xFF, "P0 untouched");
  });

  T.test("SP wraps at 8 bits like the hardware: push at SP=FF writes RAM 00h", function () {
    var c = T.newCpu([0x74, 0x5A, 0xC0, 0xE0]);
    c.sfr[0x81] = 0xFF; c.step(); c.step();
    T.eq(c.getSP(), 0x00); T.eq(c.iram[0x00], 0x5A);
  });

  T.test("POP at SP=00 reads RAM 00h and SP wraps to FF", function () {
    var c = T.newCpu([0xD0, 0x30]);
    c.sfr[0x81] = 0x00; c.iram[0] = 0x77; c.step();
    T.eq(c.iram[0x30], 0x77); T.eq(c.getSP(), 0xFF);
  });

  T.test("PUSH SP and POP SP are refused (edge cases not validated) and change nothing", function () {
    [[0xC0, 0x81], [0xD0, 0x81]].forEach(function (b) {
      var c = T.newCpu(b); var before = JSON.stringify(c.snapshot());
      var r = c.step(); T.ok(!r.ok); T.includes(r.fault.message, "SP");
      T.eq(JSON.stringify(c.snapshot()), before);
    });
  });

  // ===================== Faults =====================
  T.group("Faults and atomic instructions");

  T.test("exactly the documented opcodes are implemented; every other opcode stops the CPU and changes nothing", function () {
    var implemented = 0;
    for (var op = 0; op < 256; op++) {
      if (Z.OPCODES[op]) { implemented++; continue; }
      var c = T.newCpu([op, 0x00, 0x00, 0x00]); var before = JSON.stringify(c.snapshot());
      var r = c.step();
      T.ok(!r.ok, "opcode 0x" + op.toString(16) + " should fault");
      T.includes(r.fault.message, "not implemented");
      T.eq(JSON.stringify(c.snapshot()), before, "state after opcode 0x" + op.toString(16));
    }
    T.eq(implemented, Object.keys(Z.OPCODES).length);
  });

  T.test("a faulted CPU stays faulted until reset and does not count the instruction", function () {
    var c = T.newCpu([0x84]);
    var r1 = c.step(), r2 = c.step();
    T.ok(!r1.ok && !r2.ok); T.ok(r2.alreadyFaulted); T.eq(c.instructionCount, 0); T.eq(c.pc, 0);
  });

  T.test("running past the end of the program stops with a message", function () {
    var c = T.newCpu([0x00]);
    T.ok(c.step().ok);
    var r = c.step(); T.ok(!r.ok); T.includes(r.fault.message, "end of the loaded program");
  });

  T.test("an instruction cut off by the end of the program stops the CPU", function () {
    var r = T.newCpu([0x74]).step(); T.ok(!r.ok); T.includes(r.fault.message, "end of the loaded program");
  });

  T.test("stepping with no program loaded stops with a message", function () {
    var r = Z.createCpu().step(); T.ok(!r.ok); T.includes(r.fault.message, "No program");
  });

  T.test("a fault half-way through an instruction undoes every change (POP into an unmodelled SFR)", function () {
    var c = T.newCpu([0x74, 0x11, 0xC0, 0xE0, 0xD0, 0x88]);
    T.stepN(c, 2);
    var before = JSON.stringify(c.snapshot());
    var r = c.step();
    T.ok(!r.ok); T.eq(JSON.stringify(c.snapshot()), before, "SP and RAM must be exactly as before the POP");
    T.eq(c.getSP(), 8);
  });

  // ===================== Step results, run, breakpoints =====================
  T.group("Step results, run, breakpoints");

  T.test("step() reports what changed: MOV A,#55 changes PC and ACC (parity stays 0)", function () {
    var r = T.newCpu([0x74, 0x55]).step();
    T.same(r.changes.map(function (c) { return [c.name, c.before, c.after]; }), [["PC", 0, 2], ["ACC", 0, 0x55]]);
    T.eq(r.text, "MOV A,#0x55");
  });

  T.test("step() includes PSW in the changes when only the parity bit changes", function () {
    var r = T.newCpu([0x74, 0x01]).step();
    var psw = r.changes.filter(function (c) { return c.name === "PSW"; })[0];
    T.ok(psw, "PSW change reported"); T.eq(psw.before, 0); T.eq(psw.after, 1);
  });

  T.test("step() reports RAM changes with readable names, and omits writes that change nothing", function () {
    var c = T.newCpu([0x74, 0x00, 0xF8, 0x75, 0x25, 0x00]);   // A=0 (no change), R0=0 (no change)
    T.stepN(c, 1);
    var r = c.step(); T.same(r.changes.map(function (x) { return x.name; }), ["PC"], "R0 stays 00: only PC changes");
    r = c.step(); T.same(r.changes.map(function (x) { return x.name; }), ["PC"]);
    var d = T.newCpu([0x78, 0x07]).step();
    T.includes(d.changes[1].name, "R0, bank 0");
  });

  T.test("run() stops when the program reaches a jump-to-itself (idle)", function () {
    var c = T.newCpu([0x74, 0x05, 0x80, 0xFE]);
    var r = c.run({});
    T.eq(r.stopReason, "idle"); T.eq(r.steps, 2); T.eq(c.pc, 2, "PC stays on the SJMP");
  });

  T.test("LJMP to itself is also detected as idle; JZ to itself is not", function () {
    T.eq(T.newCpu([0x02, 0x00, 0x00]).run({}).stopReason, "idle");
    var c = T.newCpu([0x60, 0xFE]);                               // JZ $ with A=0 loops forever, but may exit, so not "idle"
    T.eq(c.run({ maxSteps: 50 }).stopReason, "max-steps");
  });

  T.test("run() stops after maxSteps and can be continued", function () {
    var c = T.newCpu([0x04, 0x80, 0xFD]);                         // INC A ; SJMP back: endless
    var r = c.run({ maxSteps: 10 });
    T.eq(r.stopReason, "max-steps"); T.eq(r.steps, 10); T.eq(c.instructionCount, 10);
    r = c.run({ maxSteps: 10 }); T.eq(c.instructionCount, 20);
  });

  T.test("run() reports a fault and keeps the state from before the failing instruction", function () {
    var c = T.newCpu([0x74, 0x09, 0x84]);
    var r = c.run({});
    T.eq(r.stopReason, "fault"); T.eq(r.steps, 1); T.eq(c.getA(), 9); T.eq(c.pc, 2);
  });

  T.test("breakpoint: run stops BEFORE the instruction, resuming executes it", function () {
    var c = T.newCpu([0x74, 0x01, 0x24, 0x01, 0x24, 0x01, 0x80, 0xFE]);
    var r = c.run({ breakpoints: [4] });
    T.eq(r.stopReason, "breakpoint"); T.eq(c.pc, 4); T.eq(c.getA(), 2, "instruction at 4 not yet run"); T.eq(r.steps, 2);
    r = c.run({ breakpoints: [4] });
    T.eq(r.stopReason, "idle"); T.eq(c.getA(), 3, "instruction at 4 ran when resumed");
  });

  T.test("a breakpoint on the very first instruction does not block the first run, and step ignores breakpoints", function () {
    var c = T.newCpu([0x74, 0x01, 0x24, 0x01, 0x80, 0xFE]);
    var r = c.run({ breakpoints: [0, 2] });
    T.eq(r.stopReason, "breakpoint"); T.eq(c.pc, 2); T.eq(r.steps, 1);
    c.step(); T.eq(c.pc, 4, "step() moved past the breakpoint at 2");
  });

  T.test("breakpoints on addresses that are never executed do nothing", function () {
    var c = T.newCpu([0x74, 0x01, 0x80, 0xFE]);
    T.eq(c.run({ breakpoints: [1, 3, 0x1000] }).stopReason, "idle");
  });

  // ===================== Hex loader =====================
  T.group("Hex program loader");

  T.test("accepts spaces, commas, newlines, 0x prefixes, joined bytes, lowercase and ; comments", function () {
    var good = [
      ["74 55 80 FE", [0x74, 0x55, 0x80, 0xFE]], ["7455 80fe", [0x74, 0x55, 0x80, 0xFE]],
      ["0x74,0x55\n80 FE", [0x74, 0x55, 0x80, 0xFE]], ["74 55 ; load A\n80 FE ; done", [0x74, 0x55, 0x80, 0xFE]],
      ["  \t74\r\n55  ", [0x74, 0x55]]
    ];
    good.forEach(function (g) { var r = Z.parseHexBytes(g[0]); T.ok(r.ok, g[0]); T.same(r.bytes, g[1], g[0]); });
  });

  T.test("rejects bad characters, odd digit counts, empty input and comment-only input with a clear message", function () {
    var r = Z.parseHexBytes("74 5G"); T.ok(!r.ok); T.includes(r.error, "5G");
    r = Z.parseHexBytes("745"); T.ok(!r.ok); T.includes(r.error, "odd number");
    r = Z.parseHexBytes("0x7"); T.ok(!r.ok);
    r = Z.parseHexBytes("55h"); T.ok(!r.ok);
    r = Z.parseHexBytes(""); T.ok(!r.ok); r = Z.parseHexBytes("   "); T.ok(!r.ok); r = Z.parseHexBytes("; just a comment"); T.ok(!r.ok);
    r = Z.parseHexBytes("alert(1)"); T.ok(!r.ok, "code is never accepted");
    r = Z.parseHexBytes(null); T.ok(!r.ok);
  });

  T.test("rejects more than 8192 bytes", function () {
    T.ok(Z.parseHexBytes(new Array(8192).fill("00").join(" ")).ok);
    var r = Z.parseHexBytes(new Array(8193).fill("00").join(" ")); T.ok(!r.ok); T.includes(r.error, "8192");
  });

  // ===================== Disassembler and opcode table =====================
  T.group("Opcode table vs reference");

  // Independent reference (from published 8051 opcode tables): [first opcode, last opcode, length, text must start with]
  var REF = [
    [0x00, 0x00, 1, "NOP"], [0x02, 0x02, 3, "LJMP"], [0x04, 0x04, 1, "INC A"], [0x08, 0x0F, 1, "INC R"],
    [0x12, 0x12, 3, "LCALL"], [0x14, 0x14, 1, "DEC A"], [0x18, 0x1F, 1, "DEC R"], [0x22, 0x22, 1, "RET"],
    [0x24, 0x24, 2, "ADD A,#"], [0x25, 0x25, 2, "ADD A,"], [0x28, 0x2F, 1, "ADD A,R"],
    [0x34, 0x34, 2, "ADDC A,#"], [0x38, 0x3F, 1, "ADDC A,R"], [0x40, 0x40, 2, "JC"],
    [0x44, 0x44, 2, "ORL A,#"], [0x50, 0x50, 2, "JNC"], [0x54, 0x54, 2, "ANL A,#"],
    [0x60, 0x60, 2, "JZ"], [0x64, 0x64, 2, "XRL A,#"], [0x70, 0x70, 2, "JNZ"],
    [0x74, 0x74, 2, "MOV A,#"], [0x75, 0x75, 3, "MOV "], [0x78, 0x7F, 2, "MOV R"], [0x80, 0x80, 2, "SJMP"],
    [0x90, 0x90, 3, "MOV DPTR"],
    [0xA3, 0xA3, 1, "INC DPTR"],
    [0x94, 0x94, 2, "SUBB A,#"], [0x98, 0x9F, 1, "SUBB A,R"],
    [0xC0, 0xC0, 2, "PUSH"], [0xC2, 0xC2, 2, "CLR bit"], [0xC3, 0xC3, 1, "CLR C"], [0xD0, 0xD0, 2, "POP"], [0xD3, 0xD3, 1, "SETB C"],
    [0xD8, 0xDF, 2, "DJNZ R"], [0xE4, 0xE4, 1, "CLR A"], [0xE5, 0xE5, 2, "MOV A,"], [0xE6, 0xE7, 1, "MOV A,@R"],
    [0xE8, 0xEF, 1, "MOV A,R"], [0xF4, 0xF4, 1, "CPL A"], [0xF5, 0xF5, 2, "MOV "], [0xF6, 0xF7, 1, "MOV @R"], [0xF8, 0xFF, 1, "MOV R"]
  ];
  var refSet = {};
  REF.forEach(function (row) { for (var op = row[0]; op <= row[1]; op++) { refSet[op] = row; } });

  T.test("every reference opcode is in the table with the right length and mnemonic", function () {
    Object.keys(refSet).forEach(function (k) {
      var op = parseInt(k, 10), row = refSet[k];
      T.ok(Z.OPCODES[op], "opcode 0x" + op.toString(16) + " missing from table");
      T.eq(Z.OPCODES[op].length, row[2], "length of 0x" + op.toString(16));
      var d = Z.disassemble([op, 0x12, 0x34], 0, 3);
      T.ok(d.text.indexOf(row[3]) === 0, "0x" + op.toString(16) + " text \"" + d.text + "\" should start with \"" + row[3] + "\"");
      if (row[1] - row[0] >= 1 && /R$/.test(row[3])) {
        T.includes(d.text, "R" + (op - row[0]), "register number of 0x" + op.toString(16));
      }
    });
  });

  T.test("the table advertises NO opcode that is missing from the reference list", function () {
    Object.keys(Z.OPCODES).forEach(function (k) { T.ok(refSet[k], "opcode 0x" + parseInt(k, 10).toString(16) + " is in the table but not in the reference list"); });
    T.eq(Object.keys(Z.OPCODES).length, Object.keys(refSet).length, "count");
  });

  T.test("disassembler text for sample instructions", function () {
    T.same(Z.disassemble([0x74, 0x55], 0, 2).text, "MOV A,#0x55");
    T.same(Z.disassemble([0x78, 0x05], 0, 2).text, "MOV R0,#0x05");
    T.same(Z.disassemble([0x75, 0x90, 0xA5], 0, 3).text, "MOV P1,#0xA5");
    T.same(Z.disassemble([0x75, 0x30, 0x01], 0, 3).text, "MOV 0x30,#0x01");
    T.same(Z.disassemble([0x80, 0xFE], 0, 2).text, "SJMP 0x0000");
    T.same(Z.disassemble([0, 0, 0, 0, 0, 0xD8, 0xFD], 5, 7).text, "DJNZ R0,0x0004");
    T.same(Z.disassemble([0x12, 0x00, 0x08], 0, 3).text, "LCALL 0x0008");
    T.same(Z.disassemble([0xE5, 0x88], 0, 2).text, "MOV A,TCON");
    T.same(Z.disassemble([0xC0, 0xE0], 0, 2).text, "PUSH ACC");
    var u = Z.disassemble([0x84], 0, 1); T.ok(!u.implemented); T.eq(u.length, 1); T.includes(u.text, "not implemented");
  });

  T.test("listing() walks the loaded program instruction by instruction", function () {
    var rows = T.newCpu([0x74, 0x05, 0x24, 0x01, 0x80, 0xFE]).listing();
    T.same(rows.map(function (r) { return r.address + ":" + r.text; }), ["0:MOV A,#0x05", "2:ADD A,#0x01", "4:SJMP 0x0004"]);
  });

  // ===================== Sample programs =====================
  T.group("Sample programs");

  function runSample(id) {
    var s = Z.SAMPLES.filter(function (x) { return x.id === id; })[0];
    T.ok(s, "sample " + id);
    var p = Z.parseHexBytes(s.hex); T.ok(p.ok, "sample hex parses: " + (p.error || ""));
    var c = T.newCpu(p.bytes); var res = c.run({});
    T.eq(res.stopReason, "idle", "sample " + id + " should finish");
    return c;
  }
  T.test("sample 'add': A=3C, RAM 30h=3C, no flags", function () {
    var c = runSample("add"); T.eq(c.getA(), 0x3C); T.eq(c.iram[0x30], 0x3C);
    var f = T.flags(c); T.eq(f.cy, 0); T.eq(f.ac, 0); T.eq(f.ov, 0);
  });
  T.test("sample 'count': A=5, R0=0", function () { var c = runSample("count"); T.eq(c.getA(), 5); T.eq(c.iram[0], 0); });
  T.test("sample 'subroutine': A=7, SP back to 07, return address left in RAM", function () {
    var c = runSample("subroutine"); T.eq(c.getA(), 7); T.eq(c.getSP(), 7); T.eq(c.iram[8], 5); T.eq(c.iram[9], 0);
  });
  T.test("sample 'flags': final A=7F with OV=1, AC=1, CY=0", function () {
    var c = runSample("flags"); var f = T.flags(c); T.eq(c.getA(), 0x7F); T.eq(f.ov, 1); T.eq(f.ac, 1); T.eq(f.cy, 0);
  });
  T.test("sample 'upper-ram': upper RAM 90h=5A, P1=A5, A=A5", function () {
    var c = runSample("upper-ram"); T.eq(c.iram[0x90], 0x5A); T.eq(c.sfr[0x90], 0xA5); T.eq(c.getA(), 0xA5);
  });

  // ===================== Coverage (must stay LAST) =====================
  T.group("Coverage");

  T.test("every implemented opcode was executed by at least one test above", function () {
    var missing = Object.keys(Z.OPCODES).filter(function (k) { return !T.executed[k]; })
      .map(function (k) { return "0x" + parseInt(k, 10).toString(16).toUpperCase(); });
    T.eq(missing.join(" "), "", "opcodes never executed by any test");
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
