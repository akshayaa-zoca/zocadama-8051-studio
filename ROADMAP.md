# Roadmap

A step is only marked Done after it has been tested.

## Phase 0 – Project setup
- [x] Files saved in GitHub
- [x] `index.html` opens and looks right on desktop and phone width
- [x] Clicking every pin in the explorer shows information

## Phase 1 – Learning content
- [ ] Glossary of 8051 terms
- [ ] Lesson: what a microcontroller is
- [ ] Lesson: memory (internal RAM, special function registers, program memory)
- [ ] Lesson: ports and pins

## Phase 2 – Simulator core (first version done, more to come)
- [x] Registers A, B, R0-R7 (four banks), PSW with flags, SP and PC as data (DPL/DPH are stored; DPTR instructions are not implemented yet)
- [x] 256 bytes internal RAM, AT89S52 style (direct vs indirect addressing, upper RAM, special function registers)
- [x] First instructions with tests: 104 opcodes (MOV, PUSH/POP, ADD/ADDC/SUBB, INC/DEC, ANL/ORL/XRL, CLR/CPL, CLR C/SETB C, SJMP/LJMP, JZ/JNZ/JC/JNC, DJNZ, LCALL/RET)
- [x] Step, Run, Pause, Reset, breakpoints and register/flag/RAM display, as a web page
- [ ] DPTR, MOVC, MUL/DIV, bit instructions, CJNE and the remaining instruction set
- [ ] Machine-cycle counting

## Phase 3 – Assembler and full instruction set
- [ ] Parse simple assembly
- [ ] Remaining instructions, tested against known programs
- [ ] Timers, interrupts, serial

## Phase 4 – Circuit designer
- [ ] LED and switch on a port
- [ ] Component library
- [ ] Wiring editor
