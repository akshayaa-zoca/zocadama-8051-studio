// Runs the tests when tests/run-tests.html is opened in a browser and shows the results.
// run-tests.html calls window.runBrowserTests() only after checking every file loaded.
(function () {
  "use strict";
  window.runBrowserTests = function () {
    var out = window.Z8051Test.run();
    var summary = document.getElementById("summary");
    summary.textContent = out.passed + " passed, " + out.failed + " failed, " + out.total + " total";
    summary.className = out.failed === 0 ? "pass" : "fail";

    var holder = document.getElementById("results"), group = "", list = null;
    out.results.forEach(function (r) {
      if (r.group !== group) {
        group = r.group;
        var h = document.createElement("h2"); h.textContent = group; holder.appendChild(h);
        list = document.createElement("ul"); holder.appendChild(list);
      }
      var li = document.createElement("li");
      li.className = r.passed ? "pass" : "fail";
      li.appendChild(document.createTextNode(r.name));
      if (!r.passed) {
        var e = document.createElement("span"); e.className = "err"; e.textContent = r.error; li.appendChild(e);
      }
      list.appendChild(li);
    });
    window.__testsDone = out;
  };
})();
