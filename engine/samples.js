// Zocadama 8051 Studio - engine/samples.js
// Small example programs, as hexadecimal bytes. Each one ends with 80 FE
// (SJMP to itself), the usual way to say "finished". The tests run every sample.

(function (root) {
  "use strict";
  var Z = root.Z8051;

  Z.SAMPLES = [
    {
      id: "add",
      title: "Add two numbers",
      hex: "74 25   ; MOV A,#0x25\n24 17   ; ADD A,#0x17\nF5 30   ; MOV 0x30,A\n80 FE   ; SJMP to itself (done)",
      about: "Adds 0x25 and 0x17. A becomes 0x3C and the result is copied to RAM address 0x30."
    },
    {
      id: "count",
      title: "Count with DJNZ",
      hex: "78 05   ; MOV R0,#5\n74 00   ; MOV A,#0\n04      ; INC A      (loop start, address 4)\nD8 FD   ; DJNZ R0,loop\n80 FE   ; done",
      about: "Loops five times. A ends at 5 and R0 ends at 0."
    },
    {
      id: "subroutine",
      title: "Subroutine and stack",
      hex: "74 03     ; MOV A,#3\n12 00 08  ; LCALL 0x0008\n80 FE     ; done (address 5)\n00        ; NOP (padding)\n24 04     ; ADD A,#4  (address 8)\n22        ; RET",
      about: "Calls a subroutine that adds 4. Watch the return address go onto the stack in RAM 08h-09h."
    },
    {
      id: "flags",
      title: "Flags: overflow and borrow",
      hex: "74 7F   ; MOV A,#0x7F\n24 01   ; ADD A,#1   -> 0x80, OV=1 AC=1\n94 01   ; SUBB A,#1  -> 0x7F, OV=1\n80 FE   ; done",
      about: "Shows the overflow (OV) and auxiliary carry (AC) flags changing."
    },
    {
      id: "upper-ram",
      title: "Upper RAM vs SFR",
      hex: "74 5A      ; MOV A,#0x5A\n78 90      ; MOV R0,#0x90\nF6         ; MOV @R0,A    -> upper RAM at 0x90\n75 90 A5   ; MOV P1,#0xA5 -> the P1 register (also address 0x90)\nE6         ; MOV A,@R0    -> reads upper RAM: 0x5A\nE5 90      ; MOV A,P1     -> reads the register: 0xA5\n80 FE      ; done",
      about: "Address 0x90 means two different places: indirect access reaches upper RAM, direct access reaches the P1 register."
    }
  ];
})(typeof globalThis !== "undefined" ? globalThis : this);
