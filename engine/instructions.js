// Zocadama 8051 Studio - engine/instructions.js
// The table of supported opcodes. One entry per opcode:
//   mnemonic : text template used by the disassembler
//   length   : instruction size in bytes (checked by the tests against a reference)
//   flags    : which PSW flags the instruction can change (documentation)
//   run      : the function that performs the instruction on a CPU
//
// Anything NOT in this table is not implemented; the CPU stops with a message.

(function (root) {
  "use strict";
  var Z = root.Z8051;
  var OPCODES = {};

  // ---- Flag arithmetic (the part most worth testing) ----------------------
  function addCore(c, b, useCarry) {
    var a = c.getA();
    var cin = (useCarry && c.getCarry()) ? 1 : 0;
    var sum = a + b + cin;
    var cy = sum > 0xFF ? 1 : 0;                              // carry out of bit 7
    var ac = ((a & 0x0F) + (b & 0x0F) + cin) > 0x0F ? 1 : 0;  // carry out of bit 3
    var c6 = ((a & 0x7F) + (b & 0x7F) + cin) > 0x7F ? 1 : 0;  // carry out of bit 6
    c.setA(sum & 0xFF);
    c.setFlags(cy, ac, c6 ^ cy);                               // OV = carry7 XOR carry6
  }

  function subbCore(c, b) {
    var a = c.getA();
    var cin = c.getCarry() ? 1 : 0;
    var diff = a - b - cin;
    var cy = diff < 0 ? 1 : 0;                                         // borrow into bit 7
    var ac = ((a & 0x0F) - (b & 0x0F) - cin) < 0 ? 1 : 0;              // borrow into bit 3
    var b6 = ((a & 0x7F) - (b & 0x7F) - cin) < 0 ? 1 : 0;              // borrow into bit 6
    c.setA(diff & 0xFF);
    c.setFlags(cy, ac, b6 ^ cy);                                       // OV = borrow7 XOR borrow6
  }

  function signed8(v) { return v > 127 ? v - 256 : v; }
  function jumpRel(c, i, rel) { c.jump((i.next + signed8(rel)) & 0xFFFF); }

  function def(opcode, mnemonic, length, flags, group, run, selfJump) {
    OPCODES[opcode] = {
      opcode: opcode, mnemonic: mnemonic, length: length,
      flags: flags, group: group, run: run, selfJump: selfJump === true
    };
  }

  var n;

  // ---- Moves ---------------------------------------------------------------
  def(0x00, "NOP", 1, "-", "Moves", function () {});
  def(0x74, "MOV A,{imm}", 2, "P", "Moves", function (c, i) { c.setA(i.b1); });
  def(0x75, "MOV {dir1},{imm2}", 3, "P if ACC/PSW", "Moves", function (c, i) { c.writeDirect(i.b1, i.b2); });
  def(0x90, "MOV DPTR,#data16", 3, "", "Moves", function (c, i) {
  c.writeDirect(0x83, i.b1);
  c.writeDirect(0x82, i.b2);
});
    def(0xA3, "INC DPTR", 1, "", "Moves", function (c) {
    var dptr = (c.readDirect(0x83) << 8) | c.readDirect(0x82);
    dptr = (dptr + 1) & 0xFFFF;
    c.writeDirect(0x83, (dptr >> 8) & 0xFF);
    c.writeDirect(0x82, dptr & 0xFF);
  });
  def(0xE5, "MOV A,{dir1}", 2, "P", "Moves", function (c, i) { c.setA(c.readDirect(i.b1)); });
  def(0xF5, "MOV {dir1},A", 2, "P if ACC/PSW", "Moves", function (c, i) { c.writeDirect(i.b1, c.getA()); });
  for (n = 0; n < 8; n++) {
    (function (r) {
      def(0xE8 + r, "MOV A,R" + r, 1, "P", "Moves", function (c) { c.setA(c.getReg(r)); });
      def(0xF8 + r, "MOV R" + r + ",A", 1, "-", "Moves", function (c) { c.setReg(r, c.getA()); });
      def(0x78 + r, "MOV R" + r + ",{imm}", 2, "-", "Moves", function (c, i) { c.setReg(r, i.b1); });
    })(n);
  }
  for (n = 0; n < 2; n++) {
    (function (r) {
      def(0xE6 + r, "MOV A,@R" + r, 1, "P", "Moves", function (c) { c.setA(c.readIndirect(c.getReg(r))); });
      def(0xF6 + r, "MOV @R" + r + ",A", 1, "-", "Moves", function (c) { c.writeIndirect(c.getReg(r), c.getA()); });
    })(n);
  }
  def(0xC0, "PUSH {dir1}", 2, "-", "Moves", function (c, i) {
    if (i.b1 === 0x81) { throw new Z.CpuFault("PUSH SP is not supported: its result is an edge case this simulator has not validated yet."); }
    c.push(c.readDirect(i.b1));
  });
  def(0xD0, "POP {dir1}", 2, "P if ACC/PSW", "Moves", function (c, i) {
    if (i.b1 === 0x81) { throw new Z.CpuFault("POP SP is not supported: its result is an edge case this simulator has not validated yet."); }
    c.writeDirect(i.b1, c.pop());
  });

  // ---- Arithmetic ------------------------------------------------------------
  def(0x24, "ADD A,{imm}", 2, "CY AC OV P", "Arithmetic", function (c, i) { addCore(c, i.b1, false); });
  def(0x25, "ADD A,{dir1}", 2, "CY AC OV P", "Arithmetic", function (c, i) { addCore(c, c.readDirect(i.b1), false); });
  def(0x34, "ADDC A,{imm}", 2, "CY AC OV P", "Arithmetic", function (c, i) { addCore(c, i.b1, true); });
  def(0x94, "SUBB A,{imm}", 2, "CY AC OV P", "Arithmetic", function (c, i) { subbCore(c, i.b1); });
  def(0x04, "INC A", 1, "P", "Arithmetic", function (c) { c.setA((c.getA() + 1) & 0xFF); });
  def(0x14, "DEC A", 1, "P", "Arithmetic", function (c) { c.setA((c.getA() - 1) & 0xFF); });
  for (n = 0; n < 8; n++) {
    (function (r) {
      def(0x28 + r, "ADD A,R" + r, 1, "CY AC OV P", "Arithmetic", function (c) { addCore(c, c.getReg(r), false); });
      def(0x38 + r, "ADDC A,R" + r, 1, "CY AC OV P", "Arithmetic", function (c) { addCore(c, c.getReg(r), true); });
      def(0x98 + r, "SUBB A,R" + r, 1, "CY AC OV P", "Arithmetic", function (c) { subbCore(c, c.getReg(r)); });
      def(0x08 + r, "INC R" + r, 1, "-", "Arithmetic", function (c) { c.setReg(r, (c.getReg(r) + 1) & 0xFF); });
      def(0x18 + r, "DEC R" + r, 1, "-", "Arithmetic", function (c) { c.setReg(r, (c.getReg(r) - 1) & 0xFF); });
    })(n);
  }

  // ---- Logic and carry ---------------------------------------------------------
  def(0x54, "ANL A,{imm}", 2, "P", "Logic and carry", function (c, i) { c.setA(c.getA() & i.b1); });
  def(0x44, "ORL A,{imm}", 2, "P", "Logic and carry", function (c, i) { c.setA(c.getA() | i.b1); });
  def(0x64, "XRL A,{imm}", 2, "P", "Logic and carry", function (c, i) { c.setA(c.getA() ^ i.b1); });
  def(0xE4, "CLR A", 1, "P", "Logic and carry", function (c) { c.setA(0); });
  def(0xF4, "CPL A", 1, "P", "Logic and carry", function (c) { c.setA((~c.getA()) & 0xFF); });
  def(0xC3, "CLR C", 1, "CY", "Logic and carry", function (c) { c.setCarry(0); });
  def(0xC2, "CLR bit", 2, "", "Logic and carry", function (c, i) {
  var bitAddr = i.b1;
  var byteAddr = bitAddr < 0x80
    ? (0x20 + Math.floor(bitAddr / 8))
    : (bitAddr & 0xF8);
  var bitMask = 1 << (bitAddr & 0x07);
  c.writeDirect(byteAddr, c.readDirect(byteAddr) & ~bitMask);
});
  def(0xD3, "SETB C", 1, "CY", "Logic and carry", function (c) { c.setCarry(1); });
  def(0xD2, "SETB bit", 2, "", "Logic and carry", function (c, i) {
    var bitAddr = i.b1;
    var byteAddr = bitAddr < 0x80
      ? (0x20 + Math.floor(bitAddr / 8))
      : (bitAddr & 0xF8);
    var bitMask = 1 << (bitAddr & 0x07);
    c.writeDirect(byteAddr, c.readDirect(byteAddr) | bitMask);
  });

  // ---- Jumps and calls -----------------------------------------------------------
  def(0x80, "SJMP {rel1}", 2, "-", "Jumps and calls", function (c, i) { jumpRel(c, i, i.b1); }, true);
  def(0x02, "LJMP {addr}", 3, "-", "Jumps and calls", function (c, i) { c.jump((i.b1 << 8) | i.b2); }, true);
  def(0x60, "JZ {rel1}", 2, "-", "Jumps and calls", function (c, i) { if (c.getA() === 0) { jumpRel(c, i, i.b1); } });
  def(0x70, "JNZ {rel1}", 2, "-", "Jumps and calls", function (c, i) { if (c.getA() !== 0) { jumpRel(c, i, i.b1); } });
  def(0x40, "JC {rel1}", 2, "-", "Jumps and calls", function (c, i) { if (c.getCarry()) { jumpRel(c, i, i.b1); } });
  def(0x50, "JNC {rel1}", 2, "-", "Jumps and calls", function (c, i) { if (!c.getCarry()) { jumpRel(c, i, i.b1); } });
  for (n = 0; n < 8; n++) {
    (function (r) {
      def(0xD8 + r, "DJNZ R" + r + ",{rel1}", 2, "-", "Jumps and calls", function (c, i) {
        var v = (c.getReg(r) - 1) & 0xFF;
        c.setReg(r, v);
        if (v !== 0) { jumpRel(c, i, i.b1); }
      });
    })(n);
  }
  def(0x12, "LCALL {addr}", 3, "-", "Jumps and calls", function (c, i) {
    c.push(i.next & 0xFF);          // return address, low byte first
    c.push((i.next >> 8) & 0xFF);   // then high byte
    c.jump((i.b1 << 8) | i.b2);
  });
  def(0x22, "RET", 1, "-", "Jumps and calls", function (c) {
    var hi = c.pop();
    var lo = c.pop();
    c.jump((hi << 8) | lo);
  });

  // ---- Disassembler ------------------------------------------------------------------
  function directText(addr) {
    if (addr >= 0x80) {
      var name = Z.sfrName(addr);
      if (name) { return name; }
    }
    return "0x" + Z.hex2(addr);
  }

  // Turn the bytes at `addr` into text. Never executes anything.
  function disassemble(code, addr, limit) {
    var op = code[addr];
    var d = OPCODES[op];
    if (!d) {
      return { text: "(not implemented) 0x" + Z.hex2(op), length: 1, implemented: false, bytes: [op] };
    }
    var bytes = [op];
    for (var k = 1; k < d.length; k++) { bytes.push((addr + k < limit) ? code[addr + k] : 0); }
    var b1 = bytes[1], b2 = bytes[2];
    var next = (addr + d.length) & 0xFFFF;
    var text = d.mnemonic
      .replace("{imm2}", "#0x" + Z.hex2(b2 === undefined ? 0 : b2))
      .replace("{imm}", "#0x" + Z.hex2(b1 === undefined ? 0 : b1))
      .replace("{dir1}", directText(b1))
      .replace("{rel1}", "0x" + Z.hex4((next + signed8(b1)) & 0xFFFF))
      .replace("{addr}", "0x" + Z.hex4(((b1 << 8) | b2) & 0xFFFF));
    return { text: text, length: d.length, implemented: true, bytes: bytes };
  }

  Z.OPCODES = OPCODES;
  Z.disassemble = disassemble;
})(typeof globalThis !== "undefined" ? globalThis : this);
