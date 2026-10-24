# Zocadama 8051 Studio

**Learn. Simulate. Build.**

A website for learning the 8051 microcontroller: an interactive pin diagram, an early CPU simulator, and (planned) lessons and a circuit builder.

## Current status

| Part | Status |
| --- | --- |
| Website, styling, roadmap | Built and tested |
| 8051 pin explorer (reference diagram) | Built and tested |
| CPU simulator | **Early version**: a small, tested subset, machine-code input only |
| Assembler (assembly-language input) | Not started |
| Lessons | Not started |
| Circuit designer | Not started |

This is **not** full 8051 or AT89S52 compatibility. The simulator runs 104 documented opcodes and stops with a clear message on anything else. See `docs/SIMULATOR.md` for exactly what is and is not implemented.

## How to run it

Double-click `index.html`. It opens in your browser. No install, no internet and no server needed.
Use the **Simulator** link in the menu to open `simulator.html`.

## Files and folders (keep them exactly like this)

- `index.html` – the learning homepage
- `simulator.html` – the simulator page
- `styles.css` – colours and layout (shared by both pages)
- `main.js` – mobile menu and the pin explorer
- `engine/` – the CPU engine: memory, instruction table, CPU, hex loader, examples (no page code)
- `ui/` – the simulator screen: panels, controls, instruction reference, its stylesheet
- `tests/` – automated tests (see below)
- `docs/` – simulator notes, and how to test and publish this project
- `ROADMAP.md` – the plan

## Tests

Double-click these files in the project folder:

- `tests/run-tests.html` – CPU engine tests
- `tests/integration-tests.html` – simulator screen tests (uses the real buttons)

Optional, for people with Node.js installed: `node tests/run-node.js` also checks the pages' links and navigation.
`docs/INTEGRATION.md` explains everything, including an optional full browser test.

## Rules for this project

- Never commit passwords, API keys or tokens.
- A feature is only marked Done after it has been tested.
- Do not claim more instruction support than the tests prove.
