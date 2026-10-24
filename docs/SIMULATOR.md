# Zocadama 8051 Studio: CPU simulator notes

> **Status: early engine. This is NOT a full 8051 or AT89S52 simulator.**
> It runs a small, tested subset of instructions (listed below) and stops with a
> clear message on anything else. Nothing here claims hardware compatibility beyond what is listed.

## What it models

A simplified core in the style of the **Atmel AT89S52** (an 8052-family chip):

| Part | What the simulator does |
| --- | --- |
| Program memory | 8 KB (0000h-1FFFh), like the AT89S52's on-chip flash. Fetching from 2000h or above stops the CPU: external program memory is not modelled. |
| Internal RAM | 256 bytes. 00h-7Fh is reachable by direct and indirect addressing. 80h-FFh ("upper RAM") is reachable by **indirect addressing only** (`@R0`, `@R1`, and the stack). |
| SFR space | Addresses 80h-FFh by **direct addressing only**. These addresses are separate from upper RAM: `MOV 90h,#data` writes the P1 register, while `MOV @R0,A` with R0=90h writes upper RAM. |
| Registers | A, B, PC, SP, PSW, DPL, DPH, ports P0-P3 (as stored values), four register banks R0-R7 in RAM 00h-1Fh. |

Modelled SFRs: P0 (80h), SP (81h), DPL (82h), DPH (83h), P1 (90h), P2 (A0h), P3 (B0h), PSW (D0h), ACC (E0h), B (F0h).

AT89S52 SFRs that exist on the chip but are **not modelled** (touching one stops the CPU with a message): DP1L, DP1H, PCON, TCON, TMOD, TL0, TL1, TH0, TH1, AUXR, SCON, SBUF, AUXR1, WDTRST, IE, IP, T2CON, T2MOD, RCAP2L, RCAP2H, TL2, TH2. Any other address in 80h-FFh has no SFR and also stops the CPU.

## Start-up (reset) state

PC = 0000h, SP = 07h, A = B = PSW = 00h, DPL = DPH = 00h, P0-P3 = FFh. RAM is cleared to 00h (real RAM contents are undefined at power-up; the simulator picks 00h so results are repeatable).

## Implemented instructions (104 opcodes)

Only these opcodes run. Every other opcode stops the CPU with "not implemented" and changes nothing.
The "Flags it can change" column uses CY (carry), AC (auxiliary carry), OV (overflow) and P (parity of A, recomputed whenever A changes). "P if ACC/PSW" means the instruction can change A or PSW when its direct address is ACC (E0h) or PSW (D0h).
A test checks that this table matches the engine's opcode table exactly.

**Moves**

| Opcode | Instruction | Bytes | Flags it can change |
| --- | --- | --- | --- |
| 0x00 | NOP | 1 | - |
| 0x74 | MOV A,#data | 2 | P |
| 0x75 | MOV direct,#data | 3 | P if ACC/PSW |
| 0x78 | MOV R0,#data | 2 | - |
| 0x79 | MOV R1,#data | 2 | - |
| 0x7A | MOV R2,#data | 2 | - |
| 0x7B | MOV R3,#data | 2 | - |
| 0x7C | MOV R4,#data | 2 | - |
| 0x7D | MOV R5,#data | 2 | - |
| 0x7E | MOV R6,#data | 2 | - |
| 0x7F | MOV R7,#data | 2 | - |
| 0xC0 | PUSH direct | 2 | - |
| 0xD0 | POP direct | 2 | P if ACC/PSW |
| 0xE5 | MOV A,direct | 2 | P |
| 0xE6 | MOV A,@R0 | 1 | P |
| 0xE7 | MOV A,@R1 | 1 | P |
| 0xE8 | MOV A,R0 | 1 | P |
| 0xE9 | MOV A,R1 | 1 | P |
| 0xEA | MOV A,R2 | 1 | P |
| 0xEB | MOV A,R3 | 1 | P |
| 0xEC | MOV A,R4 | 1 | P |
| 0xED | MOV A,R5 | 1 | P |
| 0xEE | MOV A,R6 | 1 | P |
| 0xEF | MOV A,R7 | 1 | P |
| 0xF5 | MOV direct,A | 2 | P if ACC/PSW |
| 0xF6 | MOV @R0,A | 1 | - |
| 0xF7 | MOV @R1,A | 1 | - |
| 0xF8 | MOV R0,A | 1 | - |
| 0xF9 | MOV R1,A | 1 | - |
| 0xFA | MOV R2,A | 1 | - |
| 0xFB | MOV R3,A | 1 | - |
| 0xFC | MOV R4,A | 1 | - |
| 0xFD | MOV R5,A | 1 | - |
| 0xFE | MOV R6,A | 1 | - |
| 0xFF | MOV R7,A | 1 | - |

**Arithmetic**

| Opcode | Instruction | Bytes | Flags it can change |
| --- | --- | --- | --- |
| 0x04 | INC A | 1 | P |
| 0x08 | INC R0 | 1 | - |
| 0x09 | INC R1 | 1 | - |
| 0x0A | INC R2 | 1 | - |
| 0x0B | INC R3 | 1 | - |
| 0x0C | INC R4 | 1 | - |
| 0x0D | INC R5 | 1 | - |
| 0x0E | INC R6 | 1 | - |
| 0x0F | INC R7 | 1 | - |
| 0x14 | DEC A | 1 | P |
| 0x18 | DEC R0 | 1 | - |
| 0x19 | DEC R1 | 1 | - |
| 0x1A | DEC R2 | 1 | - |
| 0x1B | DEC R3 | 1 | - |
| 0x1C | DEC R4 | 1 | - |
| 0x1D | DEC R5 | 1 | - |
| 0x1E | DEC R6 | 1 | - |
| 0x1F | DEC R7 | 1 | - |
| 0x24 | ADD A,#data | 2 | CY AC OV P |
| 0x25 | ADD A,direct | 2 | CY AC OV P |
| 0x28 | ADD A,R0 | 1 | CY AC OV P |
| 0x29 | ADD A,R1 | 1 | CY AC OV P |
| 0x2A | ADD A,R2 | 1 | CY AC OV P |
| 0x2B | ADD A,R3 | 1 | CY AC OV P |
| 0x2C | ADD A,R4 | 1 | CY AC OV P |
| 0x2D | ADD A,R5 | 1 | CY AC OV P |
| 0x2E | ADD A,R6 | 1 | CY AC OV P |
| 0x2F | ADD A,R7 | 1 | CY AC OV P |
| 0x34 | ADDC A,#data | 2 | CY AC OV P |
| 0x38 | ADDC A,R0 | 1 | CY AC OV P |
| 0x39 | ADDC A,R1 | 1 | CY AC OV P |
| 0x3A | ADDC A,R2 | 1 | CY AC OV P |
| 0x3B | ADDC A,R3 | 1 | CY AC OV P |
| 0x3C | ADDC A,R4 | 1 | CY AC OV P |
| 0x3D | ADDC A,R5 | 1 | CY AC OV P |
| 0x3E | ADDC A,R6 | 1 | CY AC OV P |
| 0x3F | ADDC A,R7 | 1 | CY AC OV P |
| 0x94 | SUBB A,#data | 2 | CY AC OV P |
| 0x98 | SUBB A,R0 | 1 | CY AC OV P |
| 0x99 | SUBB A,R1 | 1 | CY AC OV P |
| 0x9A | SUBB A,R2 | 1 | CY AC OV P |
| 0x9B | SUBB A,R3 | 1 | CY AC OV P |
| 0x9C | SUBB A,R4 | 1 | CY AC OV P |
| 0x9D | SUBB A,R5 | 1 | CY AC OV P |
| 0x9E | SUBB A,R6 | 1 | CY AC OV P |
| 0x9F | SUBB A,R7 | 1 | CY AC OV P |

**Logic and carry**

| Opcode | Instruction | Bytes | Flags it can change |
| --- | --- | --- | --- |
| 0x44 | ORL A,#data | 2 | P |
| 0x54 | ANL A,#data | 2 | P |
| 0x64 | XRL A,#data | 2 | P |
| 0xC3 | CLR C | 1 | CY |
| 0xD3 | SETB C | 1 | CY |
| 0xE4 | CLR A | 1 | P |
| 0xF4 | CPL A | 1 | P |

**Jumps and calls**

| Opcode | Instruction | Bytes | Flags it can change |
| --- | --- | --- | --- |
| 0x02 | LJMP addr16 | 3 | - |
| 0x12 | LCALL addr16 | 3 | - |
| 0x22 | RET | 1 | - |
| 0x40 | JC rel | 2 | - |
| 0x50 | JNC rel | 2 | - |
| 0x60 | JZ rel | 2 | - |
| 0x70 | JNZ rel | 2 | - |
| 0x80 | SJMP rel | 2 | - |
| 0xD8 | DJNZ R0,rel | 2 | - |
| 0xD9 | DJNZ R1,rel | 2 | - |
| 0xDA | DJNZ R2,rel | 2 | - |
| 0xDB | DJNZ R3,rel | 2 | - |
| 0xDC | DJNZ R4,rel | 2 | - |
| 0xDD | DJNZ R5,rel | 2 | - |
| 0xDE | DJNZ R6,rel | 2 | - |
| 0xDF | DJNZ R7,rel | 2 | - |

## Behaviour rules the tests check

- **Direct vs indirect addressing:** see the memory table above. Stack operations are indirect, so the stack may use upper RAM.
- **Flags:** `ADD`/`ADDC`: CY = carry out of bit 7, AC = carry out of bit 3, OV = carry out of bit 7 XOR carry out of bit 6. `SUBB` (A - operand - CY): CY = borrow into bit 7, AC = borrow into bit 3, OV = borrow into bit 7 XOR borrow into bit 6. `INC`, `DEC`, logic instructions and jumps do not change CY, AC or OV. `CLR C` / `SETB C` change only CY.
- **Parity:** PSW bit 0 always equals the parity of A (1 when A has an odd number of 1-bits). It is read-only: writes to it are ignored.
- **Register banks:** PSW.RS1/RS0 (bits 4 and 3) choose which RAM block R0-R7 use: 00h, 08h, 10h or 18h.
- **Stack:** `PUSH` and `LCALL` increase SP first and then write; `POP` and `RET` read first and then decrease SP. `LCALL` pushes the return address low byte first, then the high byte. SP wraps at 8 bits (FFh to 00h), as on the hardware.
- **Branches:** the offset is a signed byte measured from the address of the **next** instruction (range -128 to +127). The target wraps within 16 bits.
- **Faulted instructions change nothing:** every write goes through a journal that is undone if the instruction has to stop.

## Simulator choices that differ from the real chip

- Running past the end of the loaded program stops the CPU with a message. A real chip would fetch 0FFh from erased flash.
- A jump to itself (`SJMP $`, `LJMP $`) pauses the run with an "idle" note instead of looping forever.
- `PUSH SP` and `POP SP` are refused. Their exact result is an edge case not yet validated.
- Reading a port through a direct address returns the port latch value, since no circuit is connected to the pins.
- The disassembler shows an unimplemented opcode as one byte. Bytes after a multi-byte unimplemented instruction may be mislabelled.

## Not implemented yet

Machine-cycle counting and real time; timers 0, 1 and 2; interrupts; the serial port; the watchdog; power modes; external memory (`MOVX`, external code); `MOVC`; `DPTR` instructions (`MOV DPTR`, `INC DPTR`, `JMP @A+DPTR`) and the second data pointer; `MUL AB`, `DIV AB`, `DA A`, `SWAP`, rotates, `XCH`, `XCHD`; all bit-addressable instructions except `CLR C` and `SETB C`; `AJMP`, `ACALL`, `CJNE`, `JB`, `JNB`, `JBC`, `RETI`; most addressing-mode variants of the instructions listed above (for example `ADD A,@Ri`, `INC direct`); electrical behaviour of port pins (open-drain Port 0, pull-ups, external drive).

## Controls (on `simulator.html`)

- **Load program:** reads pasted hexadecimal bytes. Nothing typed there is ever run as JavaScript.
- **Reset:** back to the start-up state; the program stays loaded.
- **Step:** run one instruction; breakpoints are ignored.
- **Run:** run until a breakpoint, a fault, an idle loop, or **Pause**. The first instruction always runs, so you can continue from a breakpoint.
- **Breakpoints:** click the dot beside an address in the listing. Run stops *before* that instruction.

## Running the tests

- Engine tests, in a browser: open `tests/run-tests.html` (double-click it).
- Simulator-screen tests, in a browser: open `tests/integration-tests.html`. They use the real simulator panel and its real buttons.
- Optional, in a terminal with Node installed: `node tests/run-node.js` runs the engine tests again and also checks the pages' links, navigation and wording.

The engine tests include an exhaustive check of `ADD`, `ADDC` and `SUBB` (all 256 x 256 operand pairs, with and without carry) against an independent integer-arithmetic model, a check that every opcode in the table matches a published opcode table (length and mnemonic), a check that every implemented opcode is executed by at least one test, and a check that unimplemented opcodes stop the CPU without changing state.

## References used

- AT89S52 datasheet, "Memory Organization": 256 bytes of on-chip RAM; the upper 128 bytes share addresses with the SFRs; direct addressing reaches the SFRs, indirect addressing reaches upper RAM; the stack is indirect so it can use upper RAM.
- AT89S52 datasheet SFR map: AUXR at 8Eh, AUXR1 at A2h, WDTRST at A6h, DP0 at 82h-83h, DP1 at 84h-85h.
- A published 8051 opcode table (opcode, byte length, mnemonic), used as the independent reference for the opcode checks in the tests.
- The standard definitions of the 8051 flag rules, validated in the tests against a separate integer-arithmetic model rather than the engine's own bit operations.

Limits of that validation: the complete official instruction-set PDFs could not be read in full during development, so the instruction semantics (stack order, branch base address, flag rules) rest on the standard definitions plus the independent tests above, not on a line-by-line comparison with a vendor manual. Treat them as tested against a reference model, not certified.
