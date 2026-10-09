/* ==========================================================================
   Red JANO · Monitoreo satelital
   1. "La temporada en un solo cuadro": puntos por jardín y mediana de la red
   2. Relato mes a mes con mapa fijo (textos en data/relato_ndvi.json)
   3. Serie completa por jardín
   Datos: data/ndvi.json (meses + series por id de EEA)
   ========================================================================== */
(function () {
  "use strict";
  var J = window.JANO, U = J.u, esc = U.esc, $ = U.$, D = J.D, GRAD = J.GRAD;

  /* Ubicación de la etiqueta de cada jardín en el mapa del relato (derecha por defecto) */
  var LABEL_LEFT = { chincha: true };
  var NDVI_MIN = 0.1, NDVI_MAX = 0.8;   // escala de color común para todos los meses

  J.module(function () {
    renderSeason();
    renderRelato();
    renderSeries();
    renderGee();
  });
  J.route("monitoreo", { onShow: function () { activate(activeIdx, true); } });

  function relatoMeses() {
    return (D.relato.meses || []).filter(function (m) { return D.ndvi.meses.indexOf(m.mes) >= 0; });
  }
  function valuesAt(ym) {
    var i = D.ndvi.meses.indexOf(ym);
    return D.eeaList.map(function (e) { return { e: e, v: D.ndvi.series[e.id] ? D.ndvi.series[e.id][i] : null }; })
      .filter(function (o) { return o.v != null; });
  }
  function dec(v) { return U.fmt(v, 2); }

  /* ---------------- escala de color NDVI ---------------- */
  function hex2rgb(h) { h = h.replace("#", ""); return [0, 2, 4].map(function (k) { return parseInt(h.substr(k, 2), 16); }); }
  function ramp(v) {
    var stops = [0, 1, 2, 3, 4].map(function (k) { return hex2rgb(U.cssVar("--ndvi-" + k) || "#888888"); });
    var t = Math.max(0, Math.min(1, (v - NDVI_MIN) / (NDVI_MAX - NDVI_MIN))) * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    var c = stops[i].map(function (a, k) { return Math.round(a + (stops[i + 1][k] - a) * f); });
    return "rgb(" + c.join(",") + ")";
  }

  /* ---------------- 1. temporada en un cuadro ---------------- */
  function renderSeason() {
    var meses = relatoMeses().map(function (m) { return m.mes; });
    if (!meses.length) meses = D.ndvi.meses.slice(-12);
    var W = 760, H = 300, L = 40, R = 12, T = 14, B = 32;
    var bw = (W - L - R) / meses.length;
    var y = function (v) { return T + (1 - v / 0.9) * (H - T - B); };
    var n = D.eeaList.length;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="NDVI por jardín y mes, con la mediana de la red">';
    [0, 0.2, 0.4, 0.6, 0.8].forEach(function (v) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v.toFixed(1) + "</text>";
    });
    var medPts = [];
    meses.forEach(function (ym, mi) {
      var cx = L + bw * (mi + 0.5);
      var mm = parseInt(ym.slice(5), 10);
      s += '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + J.MESES[mm - 1] + "</text>";
      if (mm === 1 || mi === 0) s += '<text x="' + cx + '" y="' + (H - 1) + '" text-anchor="middle">' + ym.slice(0, 4) + "</text>";
      var vals = valuesAt(ym);
      var med = U.median(vals.map(function (o) { return o.v; }));
      medPts.push(cx.toFixed(1) + "," + y(med).toFixed(1));
      vals.forEach(function (o, k) {
        var dx = (k - (n - 1) / 2) * Math.min(5, bw / (n + 2));
        s += '<circle class="dot" tabindex="0" r="5" cx="' + (cx + dx).toFixed(1) + '" cy="' + y(o.v).toFixed(1) + '" style="fill:var(' + GRAD[o.e.gradiente].v +
          ')" data-tip="' + esc("EEA " + o.e.nombre + " · " + U.mesLargo(ym) + "|" + dec(o.v)) + '"/>';
      });
      s += '<line class="med" x1="' + (cx - bw * 0.36) + '" x2="' + (cx + bw * 0.36) + '" y1="' + y(med) + '" y2="' + y(med) + '"/>';
    });
    s = s.replace('role="img" aria-label="NDVI por jardín y mes, con la mediana de la red">', '$&<polyline class="medline" points="' + medPts.join(" ") + '"/>');
    var el = $("#season-chart");
    el.innerHTML = s + '</svg><div class="tip" hidden></div>';
    var tip = el.querySelector(".tip");
    function show(ev) {
      var d = ev.target.getAttribute("data-tip");
      if (!d) return;
      var p = d.split("|");
      tip.innerHTML = esc(p[0]) + " · NDVI <b>" + esc(p[1]) + "</b>";
      var r = el.getBoundingClientRect(), c = ev.target.getBoundingClientRect();
      tip.style.left = (c.left + c.width / 2 - r.left) + "px";
      tip.style.top = (c.top - r.top) + "px";
      tip.hidden = false;
    }
    el.addEventListener("mouseover", show);
    el.addEventListener("focusin", show);
    el.addEventListener("mouseout", function () { tip.hidden = true; });
    el.addEventListener("focusout", function () { tip.hidden = true; });
    $("#season-legend").innerHTML = Object.keys(GRAD).map(function (g) {
      return "<span>" + U.sw(g) + GRAD[g].nombre + "</span>";
    }).join("") + '<span><i class="medkey"></i>Mediana de la red</span>';
  }

  /* ---------------- 2. relato mes a mes ---------------- */
  var steps = [], activeIdx = 0;

  function project() {
    // equirectangular con corrección de latitud, encuadre del Perú
    var b = { w: -81.5, e: -68.5, s: -18.5, n: -0.0 };
    var k = Math.cos(9.5 * Math.PI / 180);
    var W = 520, sc = W / ((b.e - b.w) * k), H = Math.round((b.n - b.s) * sc);
    return { W: W, H: H, x: function (lon) { return (lon - b.w) * k * sc; }, y: function (lat) { return (b.n - lat) * sc; } };
  }
  function depPaths(P) {
    var out = "";
    D.dep.features.forEach(function (f) {
      var g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      var d = "";
      polys.forEach(function (poly) {
        poly.forEach(function (ring) {
          d += ring.map(function (c, i) { return (i ? "L" : "M") + P.x(c[0]).toFixed(1) + " " + P.y(c[1]).toFixed(1); }).join("") + "Z";
        });
      });
      out += '<path class="dep" d="' + d + '"/>';
    });
    return out;
  }

  function renderRelato() {
    var R = D.relato, meses = relatoMeses();
    var P = project();
    var dots = D.eeaList.map(function (e) {
      var x = P.x(e.lon), y = P.y(e.lat), left = LABEL_LEFT[e.id];
      var tx = left ? x - 15 : x + 15, an = left ? "end" : "start";
      return '<g data-eea="' + e.id + '"><circle class="halo" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="15" style="stroke:var(' + GRAD[e.gradiente].v + ')"/>' +
        '<circle class="eea" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="10" fill="#777"/>' +
        '<text class="lbl" x="' + tx.toFixed(1) + '" y="' + (y - 1).toFixed(1) + '" text-anchor="' + an + '">' + esc(e.nombre.replace(/ \(.*\)/, "")) + "</text>" +
        '<text class="val" x="' + tx.toFixed(1) + '" y="' + (y + 15).toFixed(1) + '" text-anchor="' + an + '"></text></g>';
    }).join("");
    var mid = (NDVI_MIN + NDVI_MAX) / 2;
    $("#relato").innerHTML =
      '<div class="rl-head"><p class="eyebrow">Relato mes a mes</p><h2>' + esc(R.titulo) + "</h2><p>" + esc(R.intro) + "</p>" +
      (R.aviso ? '<span class="rl-flag">' + esc(R.aviso) + "</span>" : "") + "</div>" +
      '<div class="rl-stage">' +
      '<div class="rl-sticky" aria-live="polite">' +
      '<div class="rl-now"><span class="rl-month" id="rl-month"></span><span class="rl-stat" id="rl-stat"></span></div>' +
      '<div class="rl-map"><svg viewBox="-20 -10 ' + (P.W + 120) + " " + (P.H + 20) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa del Perú con el NDVI de cada jardín en el mes activo">' +
      depPaths(P) + dots + "</svg></div>" +
      '<div class="rl-legend"><span>NDVI medio del jardín · misma escala todos los meses</span><div class="rl-ramp"></div>' +
      '<div class="rl-ticks"><span>' + dec(NDVI_MIN) + " suelo desnudo</span><span>" + dec(mid) + "</span><span>" + dec(NDVI_MAX) + " dosel denso</span></div></div>" +
      "</div>" +
      '<div class="rl-steps">' + meses.map(function (m, i) {
        var vals = valuesAt(m.mes).map(function (o) { return o.v; });
        var byG = {};
        valuesAt(m.mes).forEach(function (o) { (byG[o.e.gradiente] = byG[o.e.gradiente] || []).push(o.v); });
        return '<div class="rl-step' + (i === 0 ? " is-active" : "") + '" data-i="' + i + '"><article class="rl-card">' +
          "<h3>" + esc(U.mesLargo(m.mes)) + "</h3><p>" + esc(m.texto) + "</p>" +
          '<p class="stats">NDVI medio de la red ' + dec(U.mean(vals)) + " · mediana " + dec(U.median(vals)) + "</p>" +
          '<div class="rl-grads">' + Object.keys(GRAD).filter(function (g) { return byG[g]; }).map(function (g) {
            return "<span>" + U.sw(g) + esc(GRAD[g].nombre) + " <b>" + dec(U.mean(byG[g])) + "</b></span>";
          }).join("") + "</div></article></div>";
      }).join("") + "</div>" +
      "</div>" +
      (R.cierre ? '<p class="rl-close">' + esc(R.cierre) + "</p>" : "");

    steps = U.$$(".rl-step", $("#relato"));
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) activate(parseInt(en.target.getAttribute("data-i"), 10));
        });
      }, { rootMargin: "-48% 0px -48% 0px" });
      steps.forEach(function (s) { io.observe(s); });
    }
    activate(0, true);
  }

  function activate(i, force) {
    if (!steps.length || (i === activeIdx && !force)) return;
    activeIdx = i;
    var m = relatoMeses()[i];
    if (!m) return;
    steps.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
    var vals = valuesAt(m.mes);
    $("#rl-month").textContent = U.mesLargo(m.mes);
    var arr = vals.map(function (o) { return o.v; });
    $("#rl-stat").innerHTML = "Media <b>" + dec(U.mean(arr)) + "</b> · mediana <b>" + dec(U.median(arr)) + "</b>";
    vals.forEach(function (o) {
      var g = $('#relato [data-eea="' + o.e.id + '"]');
      if (!g) return;
      g.querySelector(".eea").setAttribute("fill", ramp(o.v));
      g.querySelector(".val").textContent = "NDVI " + dec(o.v);
    });
  }

  /* ---------------- 3. serie por jardín ---------------- */
  var ndviOn = { "vista-florida": true, "donoso": true, "huarangopampa": true, "canaan": true };
  function renderSeries() {
    $("#ndvi-chips").innerHTML = D.eeaList.map(function (e) {
      return '<button class="chip" type="button" data-eea="' + e.id + '" aria-pressed="' + !!ndviOn[e.id] + '">' + U.sw(e.gradiente) + esc(e.nombre) + "</button>";
    }).join("");
    $("#ndvi-chips").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-eea]");
      if (!b) return;
      var id = b.getAttribute("data-eea");
      ndviOn[id] = !ndviOn[id];
      b.setAttribute("aria-pressed", ndviOn[id]);
      drawNdvi();
    });
    drawNdvi();
  }
  function drawNdvi() {
    var series = D.eeaList.filter(function (e) { return ndviOn[e.id]; }).map(function (e) {
      return { color: "var(" + GRAD[e.gradiente].v + ")", values: D.ndvi.series[e.id] };
    });
    J.lineChart($("#ndvi-chart"), series, D.ndvi.meses, 300);
  }

  function renderGee() {
    var url = D.sitio && D.sitio.gee_app_url, slot = $("#gee-slot");
    slot.innerHTML = url
      ? '<iframe src="' + esc(url) + '" title="App de Earth Engine" loading="lazy"></iframe>'
      : "<p><b>Aquí irá la App de Earth Engine.</b></p><p class=\"muted\">Al publicar el script de biomasa como Earth Engine App, su dirección se coloca en <code>gee_app_url</code> dentro de <code>data/sitio.json</code> y la herramienta aparece en esta sección.</p>";
  }
})();
