// Zocadama 8051 Studio - engine/hex.js
// Turns pasted text such as "74 55 24 01 80 FE" into a list of bytes.
// It ONLY reads hexadecimal numbers. Nothing typed here is ever run as code.

(function (root) {
  "use strict";
  var Z = root.Z8051;

  // Accepted: bytes separated by spaces, commas or new lines; "0x" prefix allowed;
  // several bytes may be joined ("7455"); ";" starts a comment to the end of the line.
  function parseHexBytes(text, maxBytes) {
    maxBytes = maxBytes || Z.CODE_SIZE;
    if (typeof text !== "string") { return { ok: false, error: "Program text must be a string." }; }

    var cleaned = text.split(/\r?\n/).map(function (line) {
      var semi = line.indexOf(";");
      return semi >= 0 ? line.slice(0, semi) : line;
    }).join(" ");

    var tokens = cleaned.split(/[\s,]+/).filter(function (t) { return t.length > 0; });
    if (tokens.length === 0) { return { ok: false, error: "There are no program bytes. Type or paste hexadecimal bytes such as 74 55 80 FE." }; }

    var bytes = [];
    for (var t = 0; t < tokens.length; t++) {
      var m = /^(?:0x)?([0-9a-fA-F]+)$/.exec(tokens[t]);
      if (!m) { return { ok: false, error: "\"" + tokens[t] + "\" is not a hexadecimal value. Use digits 0-9 and letters A-F only." }; }
      if (m[1].length % 2 !== 0) { return { ok: false, error: "\"" + tokens[t] + "\" has an odd number of digits. Write each byte as two digits, for example 05." }; }
      for (var k = 0; k < m[1].length; k += 2) {
        bytes.push(parseInt(m[1].substr(k, 2), 16));
        if (bytes.length > maxBytes) {
          return { ok: false, error: "The program is longer than " + maxBytes + " bytes, which is all the program memory holds." };
        }
      }
    }
    return { ok: true, bytes: bytes };
  }

  Z.parseHexBytes = parseHexBytes;
})(typeof globalThis !== "undefined" ? globalThis : this);
