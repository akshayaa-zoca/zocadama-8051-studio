// Zocadama 8051 Studio – main.js
// 1) mobile menu  2) footer year  3) the 8051 pin explorer (a reference diagram only)

(function () {
  "use strict";

  // ---------- 1. Mobile menu ----------
  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---------- 2. Footer year ----------
  var yearEl = document.getElementById("year");
  if (yearEl) { yearEl.textContent = new Date().getFullYear(); }

  // ---------- 3. Pin data (classic 40-pin DIP 8051) ----------
  var GROUP_NOTES = {
    p0: "Port 0: 8-bit port with open-drain outputs, so it needs external pull-up resistors to drive a high level. With external memory it carries the low address byte and the data.",
    p1: "Port 1: 8-bit general-purpose I/O port with internal pull-ups.",
    p2: "Port 2: 8-bit I/O port with internal pull-ups. With external memory it carries the high address byte.",
    p3: "Port 3: 8-bit I/O port with internal pull-ups. Each pin also has a special function (serial, interrupts, timers, memory strobes).",
    ctrl: "Power, clock and control pins."
  };

  var P3_NAMES = [
    ["RXD", "Serial port receive (input)."],
    ["TXD", "Serial port transmit (output)."],
    ["/INT0", "External interrupt 0 input."],
    ["/INT1", "External interrupt 1 input."],
    ["T0", "Timer 0 external input."],
    ["T1", "Timer 1 external input."],
    ["/WR", "Write strobe for external data memory."],
    ["/RD", "Read strobe for external data memory."]
  ];

  // Build a list of 40 pins, numbered 1..40.
  var pins = {};
  var i;

  for (i = 0; i < 8; i++) {
    pins[1 + i] = { name: "P1." + i, group: "p1", desc: "General-purpose I/O, bit " + i + " of Port 1." };
  }
  pins[9] = { name: "RST", group: "ctrl", desc: "Reset input. Holding it high while the oscillator is running resets the CPU." };
  for (i = 0; i < 8; i++) {
    pins[10 + i] = { name: "P3." + i + " " + P3_NAMES[i][0], group: "p3", desc: "Bit " + i + " of Port 3. Special function: " + P3_NAMES[i][1] + " It can also be used as ordinary I/O." };
  }
  pins[18] = { name: "XTAL2", group: "ctrl", desc: "Crystal oscillator connection (output of the inverting amplifier)." };
  pins[19] = { name: "XTAL1", group: "ctrl", desc: "Crystal oscillator connection (input of the inverting amplifier)." };
  pins[20] = { name: "GND", group: "ctrl", desc: "Ground (0 V)." };

  for (i = 0; i < 8; i++) {
    pins[21 + i] = { name: "P2." + i, group: "p2", desc: "Bit " + i + " of Port 2. I/O pin, or high address byte with external memory." };
  }
  pins[29] = { name: "/PSEN", group: "ctrl", desc: "Program Store Enable. Read strobe for external program memory." };
  pins[30] = { name: "ALE", group: "ctrl", desc: "Address Latch Enable. Used to latch the low address byte from Port 0 when using external memory." };
  pins[31] = { name: "/EA", group: "ctrl", desc: "External Access. Tied high to run from internal program memory, tied low to run only from external memory." };
  for (i = 0; i < 8; i++) {
    pins[39 - i] = { name: "P0." + i, group: "p0", desc: "Bit " + i + " of Port 0. Open-drain I/O, or multiplexed low address and data with external memory." };
  }
  pins[40] = { name: "VCC", group: "ctrl", desc: "Power supply, normally +5 V on the classic 8051." };

  // ---------- Draw the chip as SVG ----------
  var NS = "http://www.w3.org/2000/svg";
  var holder = document.getElementById("chip");
  var info = document.getElementById("pin-info");
  var selected = null;

  function el(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs) { node.setAttribute(k, attrs[k]); }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function showPin(n, node) {
    if (selected) { selected.classList.remove("selected"); }
    selected = node;
    node.classList.add("selected");

    var p = pins[n];
    info.className = "pin-info g-" + p.group;
    info.innerHTML = "";
    var h = document.createElement("h3");
    h.textContent = p.name;
    var meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = "Pin " + n + " of 40";
    var d = document.createElement("p");
    d.textContent = p.desc;
    var g = document.createElement("p");
    g.className = "group-note";
    g.textContent = GROUP_NOTES[p.group];
    info.appendChild(h);
    info.appendChild(meta);
    info.appendChild(d);
    info.appendChild(g);
  }

  function drawPin(svg, n, side, row) {
    var p = pins[n];
    var y = 56 + row * 24;
    var g = el("g", {
      "class": "pin",
      tabindex: "0",
      role: "button",
      "aria-label": "Pin " + n + ", " + p.name
    });

    if (side === "left") {
      g.appendChild(el("rect", { x: 128, y: y - 7, width: 32, height: 14, rx: 3, "class": "g-" + p.group }));
      g.appendChild(el("text", { x: 120, y: y + 4, "text-anchor": "end", "class": "pin-label" }, p.name));
      g.appendChild(el("text", { x: 166, y: y + 3.5, "class": "pin-num" }, String(n)));
    } else {
      g.appendChild(el("rect", { x: 360, y: y - 7, width: 32, height: 14, rx: 3, "class": "g-" + p.group }));
      g.appendChild(el("text", { x: 400, y: y + 4, "text-anchor": "start", "class": "pin-label" }, p.name));
      g.appendChild(el("text", { x: 354, y: y + 3.5, "text-anchor": "end", "class": "pin-num" }, String(n)));
    }

    g.addEventListener("click", function () { showPin(n, g); });
    g.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showPin(n, g); }
    });
    svg.appendChild(g);
  }

  if (holder && info) {
    var svg = el("svg", { viewBox: "0 0 520 580", role: "img", "aria-label": "8051 chip, 40-pin DIP" });

    // chip body
    svg.appendChild(el("rect", { x: 160, y: 30, width: 200, height: 516, rx: 10, "class": "body" }));
    svg.appendChild(el("path", { d: "M 240 30 A 20 20 0 0 0 280 30 Z", "class": "notch" }));
    svg.appendChild(el("text", { x: 260, y: 280, "class": "chip-title" }, "8051"));
    svg.appendChild(el("text", { x: 260, y: 304, "class": "chip-sub" }, "40-pin DIP"));
    svg.appendChild(el("text", { x: 260, y: 324, "class": "chip-sub" }, "reference diagram"));

    // left side: pins 1..20 top to bottom
    for (i = 1; i <= 20; i++) { drawPin(svg, i, "left", i - 1); }
    // right side: pins 40..21 top to bottom
    for (i = 40; i >= 21; i--) { drawPin(svg, i, "right", 40 - i); }

    holder.appendChild(svg);
  }
})();