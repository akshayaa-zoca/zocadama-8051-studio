// Zocadama 8051 Studio - engine/cpu.js
// The CPU. It holds the chip's state and runs ONE instruction at a time.
// It knows nothing about web pages, so it can be tested on its own.
//
// Key ideas for beginners:
//  * Every change to RAM or a register goes through _write(), which writes it
//    to a "journal" first. If an instruction has to stop part-way (a fault),
//    the journal lets us undo everything, so a failed instruction changes nothing.
//  * After a good instruction, the journal becomes the "changes" list shown on screen.

(function (root) {
  "use strict";
  var Z = root.Z8051;

  var SFR_SP = 0x81, SFR_PSW = 0xD0, SFR_ACC = 0xE0, SFR_B = 0xF0;

  function Cpu() {
    this.iram = new Uint8Array(Z.IRAM_SIZE);   // 256 bytes internal RAM (upper half = indirect only)
    this.sfr = new Uint8Array(256);            // only addresses 80h-FFh are used
    this.code = new Uint8Array(Z.CODE_SIZE);   // 8 KB program memory
    this.programEnd = 0;                       // number of program bytes loaded
    this.pc = 0;
    this.fault = null;
    this.instructionCount = 0;
    this._journal = null;
    this._nextPc = 0;
    this.code.fill(0xFF);                      // erased flash reads as FFh
    this.reset();
  }

  // ---- Program loading and reset ------------------------------------------
  Cpu.prototype.loadProgram = function (bytes) {
    if (!bytes || typeof bytes.length !== "number") { return { ok: false, error: "No program bytes were given." }; }
    if (bytes.length === 0) { return { ok: false, error: "The program is empty." }; }
    if (bytes.length > Z.CODE_SIZE) {
      return { ok: false, error: "The program is " + bytes.length + " bytes, but program memory holds only " + Z.CODE_SIZE + "." };
    }
    for (var k = 0; k < bytes.length; k++) {
      var v = bytes[k];
      if (typeof v !== "number" || v !== Math.floor(v) || v < 0 || v > 255) {
        return { ok: false, error: "Program byte " + k + " is not a whole number from 0 to 255." };
      }
    }
    this.code.fill(0xFF);
    for (var j = 0; j < bytes.length; j++) { this.code[j] = bytes[j]; }
    this.programEnd = bytes.length;
    this.reset();
    return { ok: true, length: bytes.length };
  };

  // Reset puts the CPU in its start-up state. The program stays loaded.
  // Note: real RAM contents are undefined at power-up; the simulator clears it to 00 for clarity.
  Cpu.prototype.reset = function () {
    this.iram.fill(0);
    this.sfr.fill(0);
    this.sfr[SFR_SP] = 0x07;
    this.sfr[0x80] = 0xFF; this.sfr[0x90] = 0xFF; this.sfr[0xA0] = 0xFF; this.sfr[0xB0] = 0xFF;
    this.pc = 0;
    this.fault = null;
    this.instructionCount = 0;
    this._journal = null;
  };

  // ---- Reading state (no side effects) ----------------------------------------
  Cpu.prototype.getA = function () { return this.sfr[SFR_ACC]; };
  Cpu.prototype.getB = function () { return this.sfr[SFR_B]; };
  Cpu.prototype.getSP = function () { return this.sfr[SFR_SP]; };
  // PSW as the program sees it: bit 0 (P) is always the parity of A.
  Cpu.prototype.getPSW = function () { return (this.sfr[SFR_PSW] & 0xFE) | Z.parity8(this.sfr[SFR_ACC]); };
  Cpu.prototype.getCarry = function () { return (this.sfr[SFR_PSW] >> 7) & 1; };
  Cpu.prototype.getBank = function () { return (this.sfr[SFR_PSW] >> 3) & 3; };
  Cpu.prototype.getReg = function (n) { return this.iram[this.getBank() * 8 + n]; };

  Cpu.prototype.snapshot = function () {
    var psw = this.getPSW();
    return {
      pc: this.pc, a: this.getA(), b: this.getB(), sp: this.getSP(), psw: psw,
      dpl: this.sfr[0x82], dph: this.sfr[0x83],
      p0: this.sfr[0x80], p1: this.sfr[0x90], p2: this.sfr[0xA0], p3: this.sfr[0xB0],
      bank: this.getBank(),
      flags: {
        CY: (psw >> 7) & 1, AC: (psw >> 6) & 1, F0: (psw >> 5) & 1,
        RS1: (psw >> 4) & 1, RS0: (psw >> 3) & 1, OV: (psw >> 2) & 1, P: psw & 1
      },
      regs: [0, 1, 2, 3, 4, 5, 6, 7].map(function (r) { return this.getReg(r); }, this),
      iram: Array.prototype.slice.call(this.iram),
      instructionCount: this.instructionCount
    };
  };

  // ---- Writing state (everything goes through the journal) ---------------------
  Cpu.prototype._write = function (space, addr, value) {
    var arr = space === "iram" ? this.iram : this.sfr;
    if (this._journal) { this._journal.push({ space: space, addr: addr, before: arr[addr], after: value }); }
    arr[addr] = value;
  };

  Cpu.prototype._rollback = function () {
    var j = this._journal || [];
    for (var k = j.length - 1; k >= 0; k--) {
      var e = j[k];
      (e.space === "iram" ? this.iram : this.sfr)[e.addr] = e.before;
    }
    this._journal = null;
  };

  Cpu.prototype.setA = function (v) { this._write("sfr", SFR_ACC, v & 0xFF); };
  Cpu.prototype.setReg = function (n, v) { this._write("iram", this.getBank() * 8 + n, v & 0xFF); };
  Cpu.prototype.setCarry = function (bit) {
    this._write("sfr", SFR_PSW, (this.sfr[SFR_PSW] & 0x7F) | ((bit ? 1 : 0) << 7));
  };
  Cpu.prototype.setFlags = function (cy, ac, ov) {
    var psw = this.sfr[SFR_PSW] & ~(0x80 | 0x40 | 0x04);
    this._write("sfr", SFR_PSW, psw | (cy << 7) | (ac << 6) | (ov << 2));
  };

  // Indirect addressing (@R0/@R1 and the stack): all 256 bytes of RAM.
  Cpu.prototype.readIndirect = function (addr) { return this.iram[addr & 0xFF]; };
  Cpu.prototype.writeIndirect = function (addr, v) { this._write("iram", addr & 0xFF, v & 0xFF); };

  // Direct addressing: 00h-7Fh is RAM, 80h-FFh is the SFR space.
  Cpu.prototype._sfrCheck = function (addr, verb) {
    if (Z.isModelledSfr(addr)) { return; }
    var name = Z.sfrName(addr);
    var hex = "0x" + Z.hex2(addr);
    if (name) {
      throw new Z.CpuFault("Cannot " + verb + " SFR " + name + " (" + hex + "): it exists on the AT89S52 but is not modelled yet.");
    }
    throw new Z.CpuFault("Cannot " + verb + " " + hex + ": no SFR is defined at that address on the AT89S52, so the result would be undefined.");
  };

  Cpu.prototype.readDirect = function (addr) {
    addr &= 0xFF;
    if (addr < 0x80) { return this.iram[addr]; }
    this._sfrCheck(addr, "read");
    return addr === SFR_PSW ? this.getPSW() : this.sfr[addr];
  };

  Cpu.prototype.writeDirect = function (addr, v) {
    addr &= 0xFF; v &= 0xFF;
    if (addr < 0x80) { this._write("iram", addr, v); return; }
    this._sfrCheck(addr, "write");
    // PSW bit 0 (P) is read-only hardware parity, so writes to it are ignored.
    this._write("sfr", addr, addr === SFR_PSW ? (v & 0xFE) : v);
  };

  // Stack: SP goes up before a push; SP goes down after a pop. SP wraps at 8 bits.
  Cpu.prototype.push = function (v) {
    var sp = (this.sfr[SFR_SP] + 1) & 0xFF;
    this._write("sfr", SFR_SP, sp);
    this._write("iram", sp, v & 0xFF);
  };
  Cpu.prototype.pop = function () {
    var sp = this.sfr[SFR_SP];
    var v = this.iram[sp];
    this._write("sfr", SFR_SP, (sp - 1) & 0xFF);
    return v;
  };

  Cpu.prototype.jump = function (target) { this._nextPc = target & 0xFFFF; };

  // ---- Fetching program bytes ----------------------------------------------------
  Cpu.prototype._fetch = function (addr) {
    if (addr >= Z.CODE_SIZE) {
      throw new Z.CpuFault("Program counter 0x" + Z.hex4(addr) + " is beyond the 8 KB of on-chip flash. External program memory is not modelled.");
    }
    if (this.programEnd === 0) { throw new Z.CpuFault("No program is loaded."); }
    if (addr >= this.programEnd) {
      throw new Z.CpuFault("Reached the end of the loaded program at 0x" + Z.hex4(addr) + ". (Real erased flash would hold 0xFF here; the simulator stops instead.)");
    }
    return this.code[addr];
  };

  // ---- Running one instruction -------------------------------------------------------
  Cpu.prototype.step = function () {
    if (this.fault) { return { ok: false, fault: this.fault, alreadyFaulted: true }; }

    var startPc = this.pc;
    var pswBefore = this.getPSW();
    var opcode = null, def = null, bytes = [], idle = false;
    this._journal = [];

    try {
      opcode = this._fetch(startPc);
      def = Z.OPCODES[opcode];
      if (!def) {
        throw new Z.CpuFault("Opcode 0x" + Z.hex2(opcode) + " at 0x" + Z.hex4(startPc) + " is not implemented in this simulator.");
      }
      bytes = [opcode];
      for (var k = 1; k < def.length; k++) { bytes.push(this._fetch(startPc + k)); }
      var next = (startPc + def.length) & 0xFFFF;
      this._nextPc = next;
      def.run(this, { pc: startPc, b1: bytes[1], b2: bytes[2], next: next });
      idle = def.selfJump && this._nextPc === startPc;
    } catch (e) {
      this._rollback();
      if (e instanceof Z.CpuFault) {
        this.fault = { message: e.message, pc: startPc, opcode: opcode };
        return { ok: false, fault: this.fault };
      }
      throw e;
    }

    var changes = this._collectChanges(startPc, this._nextPc, pswBefore);
    this._journal = null;
    this.pc = this._nextPc;
    this.instructionCount++;
    return {
      ok: true, pcBefore: startPc, pcAfter: this.pc, opcode: opcode, bytes: bytes,
      text: Z.disassemble(this.code, startPc, this.programEnd).text,
      changes: changes, idle: idle
    };
  };

  // Turn the journal into a tidy list of net changes.
  Cpu.prototype._collectChanges = function (pcBefore, pcAfter, pswBefore) {
    var first = {}, last = {}, order = [];
    this._journal.forEach(function (e) {
      if (e.space === "sfr" && e.addr === SFR_PSW) { return; }   // PSW is reported separately below
      var key = e.space + ":" + e.addr;
      if (!(key in first)) { first[key] = e.before; order.push(e); }
      last[key] = e.after;
    });
    var changes = [];
    if (pcBefore !== pcAfter) { changes.push({ kind: "pc", name: "PC", before: pcBefore, after: pcAfter }); }
    var pswAfter = this.getPSW();
    if (pswBefore !== pswAfter) { changes.push({ kind: "sfr", address: SFR_PSW, name: "PSW", before: pswBefore, after: pswAfter }); }
    order.forEach(function (e) {
      var key = e.space + ":" + e.addr;
      if (first[key] === last[key]) { return; }
      changes.push({
        kind: e.space, address: e.addr,
        name: e.space === "sfr" ? Z.sfrName(e.addr) : Z.ramLabel(e.addr),
        before: first[key], after: last[key]
      });
    });
    return changes;
  };

  // ---- Running many instructions -----------------------------------------------------
  // Stops on: fault, idle (jump-to-self), breakpoint, or after maxSteps.
  // A breakpoint stops BEFORE its instruction runs. The first instruction of each
  // run() call always executes, so you can continue past a breakpoint.
  Cpu.prototype.run = function (options) {
    options = options || {};
    var maxSteps = options.maxSteps > 0 ? options.maxSteps : 100000;
    var bps = new Set(options.breakpoints || []);
    var steps = 0, last = null;
    while (steps < maxSteps) {
      if (steps > 0 && bps.has(this.pc)) { return { stopReason: "breakpoint", steps: steps, lastResult: last }; }
      last = this.step();
      if (!last.ok) { return { stopReason: "fault", steps: steps, lastResult: last }; }
      steps++;
      if (last.idle) { return { stopReason: "idle", steps: steps, lastResult: last }; }
    }
    return { stopReason: "max-steps", steps: steps, lastResult: last };
  };

  // Disassembly of the loaded program, for display.
  Cpu.prototype.listing = function () {
    var rows = [], addr = 0;
    while (addr < this.programEnd) {
      var d = Z.disassemble(this.code, addr, this.programEnd);
      rows.push({ address: addr, bytes: d.bytes, text: d.text, implemented: d.implemented });
      addr += d.length;
    }
    return rows;
  };

  Z.Cpu = Cpu;
  Z.createCpu = function () { return new Cpu(); };
})(typeof globalThis !== "undefined" ? globalThis : this);
