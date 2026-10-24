# Integration notes: simulator added to the website (v1)

This project is your original website plus the milestone-1 CPU simulator.
The simulator lives on its own page, `simulator.html`, so the learning homepage stays focused.

## What changed compared with your original six files

| File | Status | What changed |
| --- | --- | --- |
| `styles.css` | **Unchanged** | Both pages use it as it was. |
| `main.js` | **Unchanged** | Provides the mobile menu and footer year on both pages. |
| `.gitignore` | **Unchanged** | |
| `index.html` | Small edits | New "Simulator" menu link; hero badge no longer says the simulator is not built; new "Try the simulator" button; the Simulate card says "Early version" and links to the simulator; roadmap badges for Phase 0 ("Done") and Phase 2 ("In progress"). Chip explorer, pin diagram, hero, other cards and the rest of the roadmap are untouched. |
| `README.md` | Rewritten | Honest status, folder map, how to run and test. |
| `ROADMAP.md` | Updated | Phase 0 and the first Phase 2 items ticked; remaining Phase 2 items and Phases 1, 3, 4 still open. |

New files and folders: `simulator.html`, `engine/` (5 files), `ui/` (3 files), `tests/` (9 files), `docs/` (this file and `SIMULATOR.md`).
The engine files and `ui/simulator-ui.js` are exactly the milestone-1 versions that were already tested.

## What works

- Simulator page with the same header, footer, colours and menu as the homepage, and links in both directions.
- Hexadecimal machine-code input (comments with `;` allowed) and five examples.
- Step, Run, Pause, Reset, three run speeds, and breakpoints (click the dot in the listing).
- Registers A, B, PC, SP, PSW and R0-R7; the CY, AC, F0, RS1, RS0, OV and parity flags; program listing; last instruction with every change; all 256 bytes of internal RAM with changes highlighted.
- Clear messages for bad input, unimplemented opcodes, unmodelled registers, and running off the end of the program.
- An instruction reference table built from the engine's own opcode table.
- 104 documented opcodes (see `docs/SIMULATOR.md`).

## What does not work yet

- No assembler: programs must be entered as hexadecimal bytes. The page says so.
- Not full 8051 or AT89S52 compatibility: no timers, interrupts, serial port, DPTR/MOVC/MOVX, MUL/DIV, most bit instructions, machine-cycle timing, port pins or external memory. Anything not implemented stops the CPU with a message and changes nothing.

## Tests

Three kinds, each a file you can open:

| How to run | What it checks |
| --- | --- |
| Double-click `tests/run-tests.html` | The CPU engine on its own (87 tests). |
| Double-click `tests/integration-tests.html` | The simulator screen, using the real buttons: start-up, loading, stepping, resetting, running, breakpoints, pausing, bad input, unsupported opcodes, the instruction table (19 tests). |
| `node tests/run-node.js` (optional, needs Node.js) | The engine tests again plus the pages' links, anchors, navigation, script order, original homepage landmarks and honest wording (95 checks). |
| `node tests/e2e/e2e.js` (optional, needs Node.js and Playwright) | Opens the real pages in a real browser: homepage features, navigation both ways, simulator use, phone-width layout, mobile menu, and both in-browser test pages (33 checks). |

Results of the last run (made by Claude in a Linux sandbox with Node 22 and headless Chromium, opening pages from `file://`):
engine tests 87 passed, 0 failed; screen tests 19 passed, 0 failed; Node 95 passed, 0 failed; end-to-end 33 passed, 0 failed.

Not tested: desktop Chrome on Windows (that is your check), Edge, Firefox, Safari, real phones, screen readers, and the GitHub publishing steps below.

## Test it on Windows (without touching your real project)

1. Delete any older simulator test folder you made.
2. Right-click `zocadama-8051-studio-integrated-v1.zip` and choose **Extract All...**, then pick a **new empty folder**, for example `Desktop\zocadama-test`.
3. Open the extracted folder. If you see one more folder inside, open it. You should see `index.html`, `simulator.html`, `styles.css`, `main.js`, and the folders `engine`, `ui`, `tests`, `docs`.
4. Double-click `index.html`. Check the hero, the pin diagram (click a few pins), the roadmap and the menu.
5. Click **Simulator** in the menu. Press **Step** a few times, then **Run**. Try a breakpoint dot, **Reset**, and a bad program such as `74 ZZ`.
6. Use the menu on the simulator page to get back to the homepage.
7. Double-click `tests\run-tests.html` (expect 87 passed, 0 failed) and `tests\integration-tests.html` (expect 19 passed, 0 failed).
8. If any page shows a red "Setup problem" box, it lists the missing files. Extract the ZIP again and keep all folders together.

## Publish to your private GitHub repository safely

Do this only after the checks above look right. Nothing here overwrites `main` until you choose to merge.

1. Open your repository `zocadama-8051-studio` on github.com.
2. Click the branch button (it says `main`), type `integrate-simulator`, and choose **Create branch: integrate-simulator**. You are now working on a copy.
3. Click **Add file > Upload files**.
4. From your **extracted** folder (not the ZIP, which GitHub would store as one file), select everything **except** `.gitignore` and drag it into the page: `index.html`, `simulator.html`, `README.md`, `ROADMAP.md`, `styles.css`, `main.js`, and the folders `engine`, `ui`, `tests`, `docs`. Dragging folders keeps their structure.
5. At the bottom choose **Commit directly to the `integrate-simulator` branch**, write a message such as `Add simulator page`, and click **Commit changes**.
6. Click **Compare & pull request**, then **Create pull request**. Open **Files changed** and review it. `styles.css`, `main.js` and `.gitignore` should not appear as changed. `index.html`, `README.md` and `ROADMAP.md` should show only the small edits described above.
7. If you made your own edits to your original files that are not in this review, stop and tell Claude before merging.
8. When you are happy, click **Merge pull request**. If something is wrong later, GitHub's history lets you revert.

Never upload passwords, tokens or API keys. GitHub Pages for private repositories may need a paid plan, so hosting is not part of this step; opening the files from your computer works without it.
