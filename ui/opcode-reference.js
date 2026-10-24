// Zocadama 8051 Studio - ui/opcode-reference.js
// Builds the "Instruction reference" table from the engine's own opcode table,
// so the table can never disagree with what the simulator really runs.
// Registers R0-R7 (or @R0/@R1) that share a pattern are shown as one row.

(function (root) {
  "use strict";
  var Z = root.Z8051;
  if (!Z || !Z.OPCODES) { return; }

  function pretty(m) {
    return m.replace("{imm2}", "#data").replace("{imm}", "#data").replace("{dir1}", "direct")
            .replace("{rel1}", "rel").replace("{addr}", "addr16");
  }
  function familyKey(m) { return m.replace(/@R[01]/g, "@Ri").replace(/\bR[0-7]\b/g, "Rn"); }

  function build() {
    var groups = [];                       // [{group, rows: [{ops:[...], text, bytes, flags}]}]
    Object.keys(Z.OPCODES).map(Number).sort(function (a, b) { return a - b; }).forEach(function (op) {
      var d = Z.OPCODES[op];
      var g = groups.filter(function (x) { return x.group === d.group; })[0];
      if (!g) { g = { group: d.group, rows: [] }; groups.push(g); }
      var key = familyKey(d.mnemonic);
      var row = g.rows.filter(function (r) { return r.key === key; })[0];
      if (row) { row.ops.push(op); }
      else { g.rows.push({ key: key, ops: [op], text: pretty(key), bytes: d.length, flags: d.flags }); }
    });
    return groups;
  }

  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined) { n.textContent = text; }
    if (cls) { n.className = cls; }
    return n;
  }

  function mount(host) {
    host.textContent = "";
    var intro = el("p", "Example: MOV A,#data with data = 0x25 is written as the two bytes 74 25. " +
      "In a row with Rn, n is 0-7 and is added to the first opcode (MOV A,R3 is E8 + 3 = EB). " +
      "Flags: CY carry, AC auxiliary carry, OV overflow, P parity of A (changes whenever A changes).", "sim-hint");
    host.appendChild(intro);
    var wrap = el("div", undefined, "sim-memwrap");
    var table = el("table", undefined, "sim-ref");
    var head = el("tr");
    ["Opcode", "Instruction", "Bytes", "Flags it can change"].forEach(function (t) { head.appendChild(el("th", t)); });
    table.appendChild(el("thead")).appendChild(head);
    var body = el("tbody");
    var count = 0;
    build().forEach(function (g) {
      var gr = el("tr", undefined, "sim-ref-group");
      var cell = el("th", g.group); cell.colSpan = 4; gr.appendChild(cell); body.appendChild(gr);
      g.rows.forEach(function (r) {
        var first = r.ops[0], last = r.ops[r.ops.length - 1];
        var opText = "0x" + Z.hex2(first) + (r.ops.length > 1 ? "-0x" + Z.hex2(last) : "");
        var tr = el("tr");
        tr.appendChild(el("td", opText)); tr.appendChild(el("td", r.text));
        tr.appendChild(el("td", String(r.bytes))); tr.appendChild(el("td", r.flags));
        body.appendChild(tr); count += r.ops.length;
      });
    });
    table.appendChild(body); wrap.appendChild(table); host.appendChild(wrap);
    host.appendChild(el("p", count + " opcodes are implemented.", "sim-hint"));
    return { opcodes: count };
  }

  Z.mountOpcodeReference = mount;
  function auto() {
    var host = document.getElementById("opcode-reference-root");
    if (host) { mount(host); }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", auto); } else { auto(); }
})(typeof globalThis !== "undefined" ? globalThis : this);
