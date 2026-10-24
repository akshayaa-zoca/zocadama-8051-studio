// Zocadama 8051 Studio - engine/memory.js
// Memory layout and small helpers for an AT89S52-style 8051 core.
// This file knows NOTHING about web pages. It only defines numbers and names.
//
// Everything is attached to one shared object called Z8051, so the files work
// when you double-click index.html (no modules needed) and also under Node.

(function (root) {
  "use strict";
  var Z = (root.Z8051 = root.Z8051 || {});

  // ---- Sizes (AT89S52) --------------------------------------------------
  var IRAM_SIZE = 256;     // 256 bytes of on-chip RAM (00h-FFh)
  var CODE_SIZE = 0x2000;  // 8 KB of on-chip flash (0000h-1FFFh)

  // ---- Special Function Registers (SFRs) --------------------------------
  // SFRs live at addresses 80h-FFh and are reached ONLY by direct addressing.
  // Indirect addressing (@R0/@R1, and the stack) at 80h-FFh reaches the
  // separate "upper RAM" instead. That is real AT89S52 behaviour.

  // SFRs this simulator models (they behave like real registers):
  var MODELLED_SFRS = {
    0x80: "P0", 0x81: "SP", 0x82: "DPL", 0x83: "DPH",
    0x90: "P1", 0xA0: "P2", 0xB0: "P3",
    0xD0: "PSW", 0xE0: "ACC", 0xF0: "B"
  };

  // SFRs that exist on the AT89S52 but are NOT modelled yet.
  // Touching one stops the simulator with a clear message.
  var UNMODELLED_SFRS = {
    0x84: "DP1L", 0x85: "DP1H", 0x87: "PCON",
    0x88: "TCON", 0x89: "TMOD", 0x8A: "TL0", 0x8B: "TL1", 0x8C: "TH0", 0x8D: "TH1",
    0x8E: "AUXR", 0x98: "SCON", 0x99: "SBUF", 0xA2: "AUXR1", 0xA6: "WDTRST",
    0xA8: "IE", 0xB8: "IP", 0xC8: "T2CON", 0xC9: "T2MOD",
    0xCA: "RCAP2L", 0xCB: "RCAP2H", 0xCC: "TL2", 0xCD: "TH2"
  };

  // ---- Small helpers ------------------------------------------------------
  function hex2(n) { return ("0" + (n & 0xFF).toString(16).toUpperCase()).slice(-2); }
  function hex4(n) { return ("000" + (n & 0xFFFF).toString(16).toUpperCase()).slice(-4); }

  // Parity bit as the 8051 defines it: 1 when the number of 1-bits in A is odd.
  function parity8(v) {
    v &= 0xFF;
    v ^= v >> 4; v ^= v >> 2; v ^= v >> 1;
    return v & 1;
  }

  function isModelledSfr(addr) { return Object.prototype.hasOwnProperty.call(MODELLED_SFRS, addr); }

  // Name of an SFR address, or null if none is defined there in this simulator.
  function sfrName(addr) {
    if (isModelledSfr(addr)) { return MODELLED_SFRS[addr]; }
    if (Object.prototype.hasOwnProperty.call(UNMODELLED_SFRS, addr)) { return UNMODELLED_SFRS[addr]; }
    return null;
  }

  // Human-friendly label for an internal RAM address.
  function ramLabel(addr) {
    var label = "RAM 0x" + hex2(addr);
    if (addr < 0x20) { label += " (R" + (addr & 7) + ", bank " + (addr >> 3) + ")"; }
    else if (addr < 0x30) { label += " (bit-addressable area)"; }
    else if (addr < 0x80) { label += " (general RAM)"; }
    else { label += " (upper RAM)"; }
    return label;
  }

  // The error type used when the simulator must stop (unsupported opcode, etc.).
  function CpuFault(message) {
    this.name = "CpuFault";
    this.message = message;
  }
  CpuFault.prototype = Object.create(Error.prototype);
  CpuFault.prototype.constructor = CpuFault;

  Z.IRAM_SIZE = IRAM_SIZE;
  Z.CODE_SIZE = CODE_SIZE;
  Z.MODELLED_SFRS = MODELLED_SFRS;
  Z.UNMODELLED_SFRS = UNMODELLED_SFRS;
  Z.hex2 = hex2;
  Z.hex4 = hex4;
  Z.parity8 = parity8;
  Z.isModelledSfr = isModelledSfr;
  Z.sfrName = sfrName;
  Z.ramLabel = ramLabel;
  Z.CpuFault = CpuFault;
})(typeof globalThis !== "undefined" ? globalThis : this);
