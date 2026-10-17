/* ==========================================================================
   Red JANO · Suelos — diagnóstico suelo–forraje
   De una foto de calicata y un análisis de fertilidad a una recomendación de
   especies forrajeras, contrastada con SoilGrids.
   Datos (carpeta suelos/):
     ejemplo.json               caso con el que abre la herramienta (calicata EEA Vista Florida)
     especies.json              tolerancias de cada especie (se edita ahí, no aquí)
     referencias-soilgrids.json perfiles SoilGrids de referencia en Lambayeque
     distritos-lambayeque.geojson, munsell.json, img/
   Configuración en data/sitio.json: ia_suelos_url, inia_fertilidad_url.
   Direcciones: #suelos · #suelos/perfil · #suelos/fertilidad · #suelos/uso
   ========================================================================== */
(function () {
  "use strict";
  var J = window.JANO, U = J.u, esc = U.esc, $ = U.$, D = J.D;
  var SD = {};            // datos de la sección
  var ready = null;       // promesa de carga
  var built = false;
  var STEPS = [["sitio", "Sitio"], ["perfil", "Perfil y color"], ["fertilidad", "Fertilidad"], ["uso", "Uso forrajero"]];
  var STL = { ok: "Favorable", warn: "Atención", crit: "Limitante", na: "—" };
  var HZ_STROKE = ["#E4572E", "#F3A712", "#3E92CC", "#9B5DE5", "#2A9D8F", "#D81159"];
  var BB = { lon0: -80.66, lon1: -79.08, lat0: -7.21, lat1: -5.46 };   // recuadro de Lambayeque

  var S = {
    step: "sitio", site: null, sg: null, f: {}, ceFactor: 1,
    scen: { sub: false, org: false, lav: false, mg: false }, filter: "todas",
    photo: { ok: false, w: 0, h: 0, name: "", gains: [1, 1, 1], wbBox: null, gps: null, example: true },
    hz: [], activeHz: 0, tool: "hz", ranked: [], recs: [], ai: null
  };

  J.route("suelos", {
    keepScroll: true,
    render: function (a) {
      var step = { perfil: "perfil", fertilidad: "fertilidad", uso: "uso" }[a[0]] || "sitio";
      return load().then(function () { if (!built) build(); showStep(step); return true; });
    },
    onShow: function () {
      if (!/^suelos/.test(J.current || "")) window.scrollTo(0, 0);   // al entrar desde otra sección
      if (S.step === "sitio") showMap();
      if (S.step === "perfil") sizeCanvas();
    }
  });

  function load() {
    if (ready) return ready;
    ready = Promise.all([
      J.loadJSON("suelos/ejemplo.json"), J.loadJSON("suelos/especies.json"), J.loadJSON("suelos/referencias-soilgrids.json"),
      J.loadJSON("suelos/distritos-lambayeque.geojson"), J.loadJSON("suelos/munsell.json")
    ]).then(function (r) {
      SD.ej = r[0]; SD.sp = r[1].especies; SD.ref = r[2].puntos; SD.refDepth = r[2].calicata_por_profundidad;
      SD.dist = r[3]; SD.munsell = r[4];
      SD.ref.forEach(function (p) { p.mo = +(p.soc / 10 * 1.724).toFixed(2); });
      SD.munsell.forEach(function (m) { m.lab = rgb2lab(m[3]); });
      SD.cal = { lat: SD.ej.lat, lon: SD.ej.lon };
      S.site = { lat: SD.ej.lat, lon: SD.ej.lon, name: SD.ej.nombre };
      S.f = Object.assign({}, SD.ej.laboratorio.medio);
      S.hz = SD.ej.horizontes.map(function (h) { return { name: h.nombre, top: h.desde, bot: h.hasta, box: h.recuadro.slice(), field: "", note: h.nota }; });
      S.sg = sgFromRefs(S.site.lat, S.site.lon);
      S.sg.depths = SD.refDepth;
    });
    return ready;
  }

  /* ======================= utilidades ======================= */
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  function fmt(x, d) {
    if (x == null || isNaN(x)) return "—";
    return Number(x).toLocaleString("es-PE", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }
  function pill(st, txt) { return '<span class="su-pill ' + st + '">' + (txt || STL[st]) + "</span>"; }
  function toast(msg) {
    var t = $("#su-toast");
    if (!t) { t = document.createElement("div"); t.id = "su-toast"; t.className = "su-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function hav(a, b, c, d) {
    var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r;
    var h = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }
  function dms(v, pos, neg) {
    var a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
    return d + "°" + String(m).padStart(2, "0") + "′" + s.toFixed(1).padStart(4, "0") + "″ " + (v < 0 ? neg : pos);
  }
  function saveFile(name, data, type) {
    var blob = new Blob([data], { type: type });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* UTM WGS84 (zona 17 por defecto, sur) */
  var UA = 6378137, UF = 1 / 298.257223563, UE2 = UF * (2 - UF), UEP2 = UE2 / (1 - UE2), UK0 = 0.9996;
  function zoneOf(lon) { return Math.floor((lon + 180) / 6) + 1; }
  function toUTM(lat, lon) {
    var zone = zoneOf(lon), lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180, phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
    var s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
    var N = UA / Math.sqrt(1 - UE2 * s * s), T = t * t, C = UEP2 * c * c, A = c * (lam - lam0), e4 = UE2 * UE2, e6 = e4 * UE2;
    var M = UA * ((1 - UE2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * UE2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi));
    var E = UK0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * UEP2) * Math.pow(A, 5) / 120) + 500000;
    var Nn = UK0 * (M + N * t * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * UEP2) * Math.pow(A, 6) / 720));
    if (lat < 0) Nn += 10000000;
    return { E: E, N: Nn, zone: zone, band: lat < 0 ? "S" : "N" };
  }
  function fromUTM(E, N, zone, south) {
    var lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180, x = E - 500000, y = south ? N - 10000000 : N;
    var e4 = UE2 * UE2, e6 = e4 * UE2, mu = y / UK0 / (UA * (1 - UE2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    var e1 = (1 - Math.sqrt(1 - UE2)) / (1 + Math.sqrt(1 - UE2));
    var p1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
    var N1 = UA / Math.sqrt(1 - UE2 * s * s), T1 = t * t, C1 = UEP2 * c * c, R1 = UA * (1 - UE2) / Math.pow(1 - UE2 * s * s, 1.5), Dd = x / (N1 * UK0);
    var lat = p1 - (N1 * t / R1) * (Dd * Dd / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * UEP2) * Math.pow(Dd, 4) / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * UEP2 - 3 * C1 * C1) * Math.pow(Dd, 6) / 720);
    var lon = lam0 + (Dd - (1 + 2 * T1 + C1) * Math.pow(Dd, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * UEP2 + 24 * T1 * T1) * Math.pow(Dd, 5) / 120) / c;
    return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
  }

  /* color: sRGB → CIELAB y ΔE2000 */
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function rgb2lab(rgb) {
    var R = lin(rgb[0]), G = lin(rgb[1]), B = lin(rgb[2]);
    var X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047, Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750, Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  function dE00(l1, l2) {
    var rad = Math.PI / 180, L1 = l1[0], a1 = l1[1], b1 = l1[2], L2 = l2[0], a2 = l2[1], b2 = l2[2];
    var C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    var hf = function (b, a) { if (a === 0 && b === 0) return 0; var x = Math.atan2(b, a) / rad; return x < 0 ? x + 360 : x; };
    var h1p = hf(b1, a1p), h2p = hf(b2, a2p), dL = L2 - L1, dC = C2p - C1p, dh = 0;
    if (C1p * C2p !== 0) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    var dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2, hb = h1p + h2p;
    if (C1p * C2p !== 0) hb = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
    var T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
    var dth = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2)), Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    var Sl = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T, Rt = -Math.sin(2 * dth * rad) * Rc;
    return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh));
  }
  function munStr(m) { return m[0] === "N" ? "N " + m[1] + "/" : m[0] + " " + m[1] + "/" + m[2]; }
  function nearestMunsell(rgb) {
    var lab = rgb2lab(rgb);
    return SD.munsell.map(function (m) { return [dE00(lab, m.lab), m]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, 3);
  }
  function parseMunsell(s) {
    if (!s) return null;
    var t = s.trim().toUpperCase().replace(",", "."), m = t.match(/^N\s*([0-9.]+)\/?$/);
    if (m) return { h: "N", v: +m[1], c: 0 };
    m = t.match(/^([0-9.]+)\s*(R|YR|Y|GY|G)\s*([0-9.]+)\s*\/\s*([0-9.]+)$/);
    return m ? { h: m[1] + m[2], v: +m[3], c: +m[4] } : null;
  }
  function chipFor(h, v, c) {
    var best = null, bd = 1e9;
    SD.munsell.forEach(function (m) {
      if ((h === "N") !== (m[0] === "N")) return;
      if (h !== "N" && m[0] !== h) return;
      var d = Math.abs(m[1] - v) * 2 + Math.abs(m[2] - c);
      if (d < bd) { bd = d; best = m; }
    });
    return best;
  }
  var HUE_ORDER = ["10R", "2.5YR", "5YR", "7.5YR", "10YR", "2.5Y", "5Y", "N"];

  /* geometría */
  function pip(lon, lat, ring) {
    var ins = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function districtAt(lon, lat) {
    var f = SD.dist.features.find(function (f) { return f.geometry.coordinates.some(function (p) { return pip(lon, lat, p[0]); }); });
    return f ? f.properties : null;
  }
  function deptAt(lon, lat) {
    var f = (D.dep && D.dep.features || []).find(function (f) {
      var g = f.geometry, polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
      return polys.some(function (p) { return pip(lon, lat, p[0]); });
    });
    if (!f) return null;
    var p = f.properties;
    return p.NOMBDEP || p.nombre || p.departamento || p.name || null;
  }
  function texture(sand, clay) {
    var silt = 100 - sand - clay;
    if (silt + 1.5 * clay < 15) return "Arena";
    if (silt + 2 * clay < 30) return "Arena franca";
    if ((clay >= 7 && clay < 20 && sand > 52) || (clay < 7 && silt < 50)) return "Franco arenoso";
    if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return "Franco";
    if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return "Franco limoso";
    if (silt >= 80 && clay < 12) return "Limo";
    if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "Franco arcillo arenoso";
    if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return "Franco arcilloso";
    if (clay >= 27 && clay < 40 && sand <= 20) return "Franco arcillo limoso";
    if (clay >= 35 && sand > 45) return "Arcillo arenoso";
    if (clay >= 40 && silt >= 40) return "Arcillo limoso";
    if (clay >= 40) return "Arcilloso";
    return "Franco";
  }

  /* ======================= SoilGrids ======================= */
  var LAYERS = {
    ph: { label: "pH (H₂O)", unit: "", dec: 1, ramp: ["#F2E8C9", "#C8B36A", "#6F8F3F", "#2F5E5A"] },
    mo: { label: "Materia orgánica", unit: "%", dec: 2, ramp: ["#F1E9D7", "#C9A46B", "#7A5230", "#3A2616"] },
    clay: { label: "Arcilla", unit: "%", dec: 1, ramp: ["#F4EEDB", "#D9A877", "#A35A3A", "#5B2A22"] },
    sand: { label: "Arena", unit: "%", dec: 1, ramp: ["#E8E4D4", "#E2CF95", "#D3A94C", "#A0742B"] },
    cec: { label: "CIC", unit: "cmol(+)/kg", dec: 1, ramp: ["#EEF0E2", "#A9C58F", "#4E8A63", "#1F4D46"] }
  };
  function sgFromRefs(lat, lon) {
    var ds = SD.ref.map(function (p) { return { p: p, d: hav(lat, lon, p.lat, p.lon) }; }).sort(function (a, b) { return a.d - b.d; });
    var near = ds[0];
    if (near.d < 0.6) return { v: Object.assign({}, near.p), method: "punto", nearest: near, depths: null };
    var out = {};
    ["ph", "mo", "clay", "sand", "cec", "soc"].forEach(function (k) {
      var sw = 0, sv = 0;
      ds.forEach(function (x) { var w = 1 / (x.d * x.d); sw += w; sv += w * x.p[k]; });
      out[k] = sv / sw;
    });
    return { v: out, method: "idw", nearest: near, depths: null };
  }
  var SG_CACHE = {}, SG_CALLS = [], sgSeq = 0;
  var SG_NAMES = { phh2o: "ph", soc: "soc", clay: "clay", sand: "sand", cec: "cec", nitrogen: "n", bdod: "bd" };
  function sgFetch(lat, lon) {
    var key = lat.toFixed(3) + "," + lon.toFixed(3);
    if (SG_CACHE[key]) return Promise.resolve(SG_CACHE[key]);
    var now = Date.now();
    SG_CALLS = SG_CALLS.filter(function (t) { return now - t < 60000; });
    if (SG_CALLS.length >= 5) return Promise.reject({ code: "rate" });
    SG_CALLS.push(now);
    var url = "https://rest.isric.org/soilgrids/v2.0/properties/query?lon=" + lon.toFixed(5) + "&lat=" + lat.toFixed(5) +
      Object.keys(SG_NAMES).map(function (p) { return "&property=" + p; }).join("") + "&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean";
    var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 20000);
    return fetch(url, { signal: ctl.signal }).then(function (r) {
      clearTimeout(to);
      if (!r.ok) throw { code: "http", status: r.status };
      return r.json();
    }).then(function (j) {
      var rows = {};
      ((j.properties || {}).layers || []).forEach(function (L) {
        var d = (L.unit_measure && L.unit_measure.d_factor) || 1, k = SG_NAMES[L.name];
        (L.depths || []).forEach(function (dp) {
          var v = dp.values ? dp.values.mean : null;
          (rows[dp.label] = rows[dp.label] || { d: dp.label.replace("-", "–").replace("cm", " cm") })[k] = v == null ? null : v / d;
        });
      });
      var depths = ["0-5cm", "5-15cm", "15-30cm"].map(function (l) { return rows[l]; }).filter(Boolean);
      var mid = rows["5-15cm"];
      if (!mid || mid.ph == null || mid.sand == null) throw { code: "nodata" };
      var res = { v: { ph: mid.ph, soc: mid.soc, mo: mid.soc / 10 * 1.724, clay: mid.clay, sand: mid.sand, cec: mid.cec }, method: "vivo", depths: depths };
      SG_CACHE[key] = res;
      return res;
    }, function (e) { clearTimeout(to); throw e && e.code ? e : { code: "net" }; });
  }

  /* ======================= construcción ======================= */
  function build() {
    built = true;
    var root = $("#su-body");
    root.innerHTML =
      '<nav class="su-tabs" aria-label="Pasos del diagnóstico">' + STEPS.map(function (s, i) {
        return '<a href="#suelos' + (i ? "/" + s[0] : "") + '" data-step="' + s[0] + '"><span class="n">' + (i + 1) + "</span>" + s[1] + "</a>";
      }).join("") + "</nav>" +
      '<div class="su-layout"><div class="su-main">' +
      stepSitio() + stepPerfil() + stepFert() + stepUso() +
      '</div><aside class="su-rail" aria-label="Resumen del sitio">' +
      '<div class="su-panel"><span class="su-h3">Sitio</span><b class="su-ui" id="su-r-site"></b><span class="su-small muted mono" id="su-r-coords"></span><div class="su-row" id="su-r-status"></div></div>' +
      '<div class="su-panel"><div class="su-panel-head"><span class="su-h3">Perfil</span><span class="su-small muted">cm</span></div><div id="su-r-profile"></div></div>' +
      '<div class="su-panel"><div class="su-panel-head"><span class="su-h3">Mejores opciones</span><a class="su-small" href="#suelos/uso">Ver todas</a></div><ol class="su-rank" id="su-r-rank"></ol></div>' +
      "</aside></div>";
    bindSitio(); bindPerfil(); buildParams(); bindUso();
    loadExamplePhoto();
    renderSite(); renderAll();
    new MutationObserver(function () { recolorMap(); renderIDW(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  function showStep(k) {
    S.step = k;
    U.$$(".su-tabs a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-step") === k); if (a.getAttribute("data-step") === k) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
    STEPS.forEach(function (s) { $("#su-step-" + s[0]).hidden = s[0] !== k; });
    var tabs = $(".su-tabs"), top = tabs.getBoundingClientRect().top;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 90 });
  }

  /* ---------------- paso 1: sitio ---------------- */
  function stepSitio() {
    return '<section class="su-step" id="su-step-sitio">' +
      '<div class="su-grid2"><div class="su-stack">' +
      '<div class="su-maptools"><label>Capa de referencia <select id="su-layer"><option value="none">Sin capa</option><option value="ph">pH (H₂O)</option><option value="mo" selected>Materia orgánica %</option><option value="clay">Arcilla %</option><option value="sand">Arena %</option><option value="cec">CIC cmol(+)/kg</option></select></label>' +
      '<label class="check"><input type="checkbox" id="su-sat" checked> Imagen satelital</label></div>' +
      '<div class="su-mapwrap"><div id="su-map" role="region" aria-label="Mapa para ubicar el sitio"></div><div class="su-readout" id="su-readout">Haz clic en el mapa o arrastra el marcador</div><div class="su-maplegend" id="su-maplegend"></div></div>' +
      '<p class="su-note">Haz clic en cualquier punto del Perú o arrastra el marcador rojo: la herramienta consulta SoilGrids en ese punto. Las estaciones de la red se pueden elegir con un clic. La capa de color interpola 13 perfiles de referencia de Lambayeque y es solo orientativa.</p>' +
      '</div><div class="su-stack">' +
      '<div class="su-panel"><div class="su-panel-head"><h2 class="su-h2">Ubicación</h2><span class="su-h3">WGS84 · UTM</span></div>' +
      '<div class="su-field"><label for="su-name">Nombre del sitio</label><input class="txt" id="su-name"></div>' +
      '<div class="su-coords"><div class="su-field"><label for="su-lat">Latitud</label><input id="su-lat" inputmode="decimal"></div><div class="su-field"><label for="su-lon">Longitud</label><input id="su-lon" inputmode="decimal"></div>' +
      '<div class="su-field"><label for="su-e">Este (m)</label><input id="su-e" inputmode="decimal"></div><div class="su-field"><label for="su-n">Norte (m)</label><input id="su-n" inputmode="decimal"></div>' +
      '<div class="su-field"><label for="su-z">Zona UTM (sur)</label><input id="su-z" inputmode="numeric"></div></div>' +
      '<div class="su-row"><button class="btn" type="button" id="su-go-ll">Ubicar por lat/lon</button><button class="btn ghost" type="button" id="su-go-utm">Ubicar por UTM</button><button class="btn ghost" type="button" id="su-go-cal">Calicata de ejemplo</button></div>' +
      '<dl class="su-kv" id="su-site-kv"></dl></div>' +
      '<div class="su-panel"><div class="su-panel-head"><h2 class="su-h2">SoilGrids en el sitio</h2><span class="su-h3" id="su-sg-method"></span></div>' +
      '<div class="table-scroll"><table id="su-sg-tbl"></table></div><p class="su-note" id="su-sg-note"></p>' +
      '<div class="su-row"><button class="btn ghost" type="button" id="su-sg-retry" hidden>Consultar de nuevo</button><a class="su-small" href="https://soilgrids.org" target="_blank" rel="noopener">soilgrids.org ↗</a></div></div>' +
      "</div></div>" +
      '<div class="su-panel"><details id="su-inia"><summary>Mapa nacional de fertilidad del INIA</summary><p class="su-note" style="margin-top:10px">Mapas calibrados con muestras de laboratorio del INIA: para Lambayeque son más confiables que SoilGrids. Consulta el valor de tu parcela aquí y escríbelo en Fertilidad.</p><div id="su-inia-slot"></div></details></div>' +
      "</section>";
  }
  function bindSitio() {
    $("#su-name").value = S.site.name;
    $("#su-name").addEventListener("input", function () { S.site.name = this.value; S.site.auto = false; renderRail(); renderSummary(); });
    var num = function (id) { return parseFloat(String($(id).value).replace(",", ".")); };
    $("#su-go-ll").onclick = function () { setSite(num("#su-lat"), num("#su-lon")); flyToSite(); };
    $("#su-go-utm").onclick = function () { var z = parseInt($("#su-z").value, 10) || 17, p = fromUTM(num("#su-e"), num("#su-n"), z, true); setSite(p.lat, p.lon); flyToSite(); };
    $("#su-go-cal").onclick = function () { S.site.name = SD.ej.nombre; $("#su-name").value = S.site.name; setSite(SD.cal.lat, SD.cal.lon, { cached: true }); flyToSite(); };
    $("#su-sg-retry").onclick = function () { querySG(); };
    $("#su-layer").onchange = renderIDW;
    $("#su-sat").onchange = function () { if (mapLoaded) map.setLayoutProperty("sat", "visibility", this.checked ? "visible" : "none"); };
    $("#su-inia").addEventListener("toggle", function () {
      var slot = $("#su-inia-slot"), url = (D.sitio && D.sitio.inia_fertilidad_url) || "";
      if (!this.open || slot.firstChild || !url) return;
      slot.innerHTML = '<iframe class="su-iframe" src="' + esc(url) + '" title="Mapa nacional de fertilidad del INIA" loading="lazy"></iframe><p class="su-small" style="margin-top:6px"><a href="' + esc(url) + '" target="_blank" rel="noopener">Abrir en una pestaña nueva ↗</a></p>';
    });
  }

  function setSite(lat, lon, opts) {
    opts = opts || {};
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { toast("Coordenadas no válidas"); return; }
    S.site.lat = lat; S.site.lon = lon;
    if (!opts.name && (S.site.auto || S.site.name === SD.ej.nombre) && hav(lat, lon, SD.cal.lat, SD.cal.lon) > 0.05) {
      var dd = districtAt(lon, lat);   // nombre provisional mientras el usuario no escriba uno
      opts.name = "Sitio en " + (dd ? dd.distrito : (deptAt(lon, lat) || "evaluación")); opts.auto = true;
    }
    if (opts.name) { S.site.name = opts.name; S.site.auto = !!opts.auto; $("#su-name").value = opts.name; }
    if (pin) pin.setLngLat([lon, lat]);
    if (opts.cached || hav(lat, lon, SD.cal.lat, SD.cal.lon) < 0.05) { S.sg = sgFromRefs(lat, lon); S.sg.depths = SD.refDepth; S.sg.method = "guardado"; renderSite(); renderAll(); }
    else { S.sg = sgFromRefs(lat, lon); S.sg.pending = true; renderSite(); renderAll(); querySG(); }
  }
  function querySG() {
    var seq = ++sgSeq, lat = S.site.lat, lon = S.site.lon;
    S.sg.pending = true; renderSite();
    sgFetch(lat, lon).then(function (r) {
      if (seq !== sgSeq) return;
      S.sg = Object.assign({}, r, { nearest: sgFromRefs(lat, lon).nearest });
      renderSite(); renderAll();
    }, function (e) {
      if (seq !== sgSeq) return;
      S.sg.pending = false; S.sg.error = e.code;
      renderSite(); renderAll();
    });
  }
  function renderSite() {
    var lat = S.site.lat, lon = S.site.lon, u = toUTM(lat, lon), d = districtAt(lon, lat), dep = d ? "Lambayeque" : deptAt(lon, lat);
    $("#su-lat").value = lat.toFixed(6); $("#su-lon").value = lon.toFixed(6);
    $("#su-e").value = u.E.toFixed(2); $("#su-n").value = u.N.toFixed(2); $("#su-z").value = u.zone;
    var dCal = hav(lat, lon, SD.cal.lat, SD.cal.lon);
    $("#su-site-kv").innerHTML = "<dt>Ubicación</dt><dd>" + (d ? esc(d.distrito) + " · " + esc(d.provincia) + " · Lambayeque" : dep ? esc(dep) : "fuera de los límites cargados") + "</dd>" +
      "<dt>DMS</dt><dd>" + dms(lat, "N", "S") + "<br>" + dms(lon, "E", "W") + "</dd>" +
      "<dt>UTM " + u.zone + u.band + "</dt><dd>" + fmt(u.E, 0) + " E · " + fmt(u.N, 0) + " N</dd>" +
      "<dt>A la calicata</dt><dd>" + (dCal < 1 ? fmt(dCal * 1000, 0) + " m" : fmt(dCal, 1) + " km") + "</dd>";
    if (mapLoaded) {
      var f = d ? SD.dist.features.filter(function (x) { return x.properties.distrito === d.distrito; }) : [];
      map.getSource("sel").setData({ type: "FeatureCollection", features: f });
    }
    var sg = S.sg, v = Object.assign({}, sg.v); v.silt = 100 - v.clay - v.sand;
    var M = { vivo: "consulta en vivo · 5–15 cm", guardado: "perfil guardado · 5–15 cm", punto: "perfil guardado · 5–15 cm", idw: "estimado · 5–15 cm" };
    $("#su-sg-method").textContent = sg.pending ? "consultando…" : M[sg.method] || "";
    var rows = [["pH (H₂O)", "ph", 1, ""], ["Materia orgánica", "mo", 2, "%"], ["Arcilla", "clay", 1, "%"], ["Arena", "sand", 1, "%"], ["Limo", "silt", 1, "%"], ["CIC", "cec", 1, "cmol(+)/kg"]];
    var depthTbl = "";
    if (sg.depths && sg.depths.length) {
      depthTbl = '<tr><td colspan="3" style="padding-top:14px"><span class="su-h3">Por profundidad</span></td></tr><tr><th>Prof.</th><th class="r">pH</th><th class="r">MO % · Arcilla % · CIC</th></tr>' +
        sg.depths.map(function (r) { return "<tr><td>" + esc(r.d) + '</td><td class="r">' + fmt(r.ph, 1) + '</td><td class="r">' + fmt(r.soc / 10 * 1.724, 2) + " · " + fmt(r.clay, 1) + " · " + fmt(r.cec, 1) + "</td></tr>"; }).join("");
      var bd = sg.depths.map(function (r) { return r.bd; }).filter(function (x) { return x != null; });
      if (bd.length) depthTbl += '<tr><td colspan="3" class="muted su-small">Densidad aparente 15–30 cm: ' + fmt(bd[bd.length - 1], 2) + " g/cm³</td></tr>";
    }
    $("#su-sg-tbl").innerHTML = '<thead><tr><th>Variable</th><th class="r">Valor</th><th>Unidad</th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="r">' + fmt(v[r[1]], r[2]) + '</td><td class="muted">' + r[3] + "</td></tr>"; }).join("") +
      "<tr><td>Textura USDA</td><td colspan=\"2\">" + texture(v.sand, v.clay) + "</td></tr>" + depthTbl + "</tbody>";
    var note = "", near = sg.nearest;
    if (sg.pending) note = "Consultando SoilGrids en este punto. Mientras tanto se muestra una estimación con los perfiles de referencia.";
    else if (sg.method === "vivo") note = "Valores de SoilGrids 2.0 (ISRIC) para este punto, a 250 m de resolución.";
    else if (sg.method === "guardado" || sg.method === "punto") note = "Perfil de SoilGrids consultado para <b>" + esc(near.p.n) + "</b> el 11/10/2026.";
    else {
      var why = { rate: "Se alcanzó el límite de consultas de SoilGrids (5 por minuto); espera un momento y vuelve a consultar.", nodata: "SoilGrids no tiene datos en este punto (zona urbana, agua o roca).", net: "SoilGrids no respondió.", http: "SoilGrids devolvió un error." }[sg.error] || "";
      note = (why ? why + " " : "") + "Valores estimados por distancia inversa a los 13 perfiles de referencia; el más cercano es <b>" + esc(near.p.n) + "</b> a " + fmt(near.d, 1) + " km" +
        (near.d > 25 ? ". A esa distancia la estimación no es confiable." : ".");
    }
    $("#su-sg-note").innerHTML = note;
    $("#su-sg-retry").hidden = !(sg.method === "idw" && !sg.pending && sg.error && sg.error !== "nodata");
  }

  /* mapa (MapLibre, ya cargado por el sitio) */
  var map = null, mapLoaded = false, pin = null;
  function mapColors() { return { water: U.cssVar("--water"), land: U.cssVar("--land"), muted: U.cssVar("--muted"), fg: U.cssVar("--fg"), bg: U.cssVar("--bg"), accent: U.cssVar("--accent"), surface: U.cssVar("--surface") }; }
  function showMap() {
    if (!built) return;
    if (typeof maplibregl === "undefined") { $("#su-map").innerHTML = '<p class="note" style="padding:20px">No se pudo cargar la librería del mapa.</p>'; return; }
    if (!map) initMap(); else map.resize();
  }
  function refsFC() {
    var k = $("#su-layer").value;
    return { type: "FeatureCollection", features: SD.ref.map(function (p, i) {
      return { type: "Feature", properties: { i: i, n: p.n, c: k === "none" ? U.cssVar("--surface") : rampColor(k, p[k]) }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
    }) };
  }
  function initMap() {
    var c = mapColors();
    map = new maplibregl.Map({
      container: "su-map", attributionControl: { compact: true },
      center: [S.site.lon, S.site.lat], zoom: 9.2, maxZoom: 18,
      style: { version: 8, sources: {
        sat: { type: "raster", tileSize: 256, maxzoom: 19, tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "Imagen © Esri, Maxar, Earthstar Geographics" },
        dep: { type: "geojson", data: D.dep, attribution: "Límites: INEI" },
        dist: { type: "geojson", data: SD.dist },
        sel: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        refs: { type: "geojson", data: refsFC(), attribution: "Perfiles: SoilGrids 2.0 (ISRIC)" },
        eeas: { type: "geojson", data: D.eeas }
      }, layers: [
        { id: "bg", type: "background", paint: { "background-color": c.water } },
        { id: "dep-fill", type: "fill", source: "dep", paint: { "fill-color": c.land } },
        { id: "sat", type: "raster", source: "sat", layout: { visibility: $("#su-sat").checked ? "visible" : "none" } },
        { id: "dep-line", type: "line", source: "dep", paint: { "line-color": c.muted, "line-width": 0.8, "line-opacity": 0.7 } },
        { id: "dist-line", type: "line", source: "dist", paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.75 } },
        { id: "sel-line", type: "line", source: "sel", paint: { "line-color": "#ffd166", "line-width": 2.4 } },
        { id: "refs", type: "circle", source: "refs", paint: { "circle-radius": 6, "circle-color": ["get", "c"], "circle-stroke-color": "#1b1b1b", "circle-stroke-width": 1.5 } },
        { id: "eeas", type: "circle", source: "eeas", paint: { "circle-radius": 7, "circle-color": c.accent, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } }
      ] }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    var el = document.createElement("div"); el.className = "su-pin"; el.title = "Sitio evaluado: arrástralo para moverlo";
    pin = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([S.site.lon, S.site.lat]).addTo(map);
    pin.on("dragend", function () { var p = pin.getLngLat(); setSite(p.lat, p.lng); });
    map.on("load", function () {
      mapLoaded = true;
      renderSite(); renderIDW();
    });
    map.on("error", function (ev) { if (ev && ev.sourceId === "sat") { $("#su-sat").checked = false; $("#su-sat").disabled = true; } });
    map.on("click", function (ev) {
      var hit = map.queryRenderedFeatures(ev.point, { layers: ["eeas", "refs"] })[0];
      if (hit && hit.layer.id === "eeas") { var e = U.eea(hit.properties.id); setSite(e.lat, e.lon, { name: "EEA " + e.nombre, auto: true }); return; }
      if (hit && hit.layer.id === "refs") { var p = SD.ref[hit.properties.i]; setSite(p.lat, p.lon); return; }
      setSite(ev.lngLat.lat, ev.lngLat.lng);
    });
    map.on("mousemove", function (ev) {
      var hit = map.queryRenderedFeatures(ev.point, { layers: ["eeas", "refs"] })[0], txt;
      map.getCanvas().style.cursor = hit ? "pointer" : "crosshair";
      if (hit && hit.layer.id === "eeas") txt = "EEA " + hit.properties.nombre + " · clic para evaluarla";
      else if (hit) { var p = SD.ref[hit.properties.i], k = $("#su-layer").value; txt = p.n + (k !== "none" ? " · " + LAYERS[k].label + " " + fmt(p[k], LAYERS[k].dec) + " " + LAYERS[k].unit : ""); }
      else { var d = districtAt(ev.lngLat.lng, ev.lngLat.lat); txt = (d ? d.distrito + " · " : "") + ev.lngLat.lat.toFixed(5) + ", " + ev.lngLat.lng.toFixed(5); }
      $("#su-readout").textContent = txt;
    });
  }
  function flyToSite() { if (map) map.flyTo({ center: [S.site.lon, S.site.lat], zoom: Math.max(map.getZoom(), 12), duration: 1200 }); }
  function recolorMap() {
    if (!mapLoaded) return;
    var c = mapColors();
    map.setPaintProperty("bg", "background-color", c.water);
    map.setPaintProperty("dep-fill", "fill-color", c.land);
    map.setPaintProperty("dep-line", "line-color", c.muted);
    map.setPaintProperty("eeas", "circle-color", c.accent);
  }
  function layerRange(k) { var v = SD.ref.map(function (p) { return p[k]; }); return [Math.min.apply(null, v), Math.max.apply(null, v)]; }
  function hex(x) { return [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]; }
  function rampAt(k, v) {
    var r = layerRange(k), t = clamp((v - r[0]) / (r[1] - r[0] || 1), 0, 1), st = LAYERS[k].ramp.map(hex);
    var s = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(s)), f = s - i;
    return [0, 1, 2].map(function (m) { return Math.round(st[i][m] + (st[i + 1][m] - st[i][m]) * f); });
  }
  function rampColor(k, v) { return "rgb(" + rampAt(k, v).join(",") + ")"; }
  var idwCache = {};
  function idwImage(k) {
    if (idwCache[k]) return idwCache[k];
    var W = 160, H = Math.round(W * (BB.lat1 - BB.lat0) / ((BB.lon1 - BB.lon0) * Math.cos(6.3 * Math.PI / 180)));
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
    var rings = []; SD.dist.features.forEach(function (f) { f.geometry.coordinates.forEach(function (p) { rings.push(p[0]); }); });
    for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
      var lon = BB.lon0 + (i + 0.5) / W * (BB.lon1 - BB.lon0), lat = BB.lat1 - (j + 0.5) / H * (BB.lat1 - BB.lat0);
      if (!rings.some(function (r) { return pip(lon, lat, r); })) continue;
      var sw = 0, sv = 0;
      SD.ref.forEach(function (p) { var dd = Math.hypot((p.lon - lon) * 0.994, p.lat - lat) + 1e-4, w = 1 / (dd * dd); sw += w; sv += w * p[k]; });
      var col = rampAt(k, sv / sw), o = (j * W + i) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return (idwCache[k] = cv.toDataURL());
  }
  function renderIDW() {
    if (!built) return;
    var k = $("#su-layer").value, lg = $("#su-maplegend");
    if (k === "none") lg.innerHTML = "<b>Perfiles de referencia</b><div class=\"muted\">13 puntos SoilGrids · 5–15 cm</div>";
    else {
      var r = layerRange(k), L = LAYERS[k];
      lg.innerHTML = "<b>" + L.label + '</b> <span class="muted">' + L.unit + '</span><div class="bar" style="background:linear-gradient(90deg,' + L.ramp.join(",") + ')"></div><div class="ends"><span>' + fmt(r[0], L.dec) + "</span><span>" + fmt(r[1], L.dec) + '</span></div><div class="muted">Interpolación de 13 perfiles · orientativa</div>';
    }
    if (!mapLoaded) return;
    map.getSource("refs").setData(refsFC());
    if (map.getLayer("idw")) map.removeLayer("idw");
    if (map.getSource("idw")) map.removeSource("idw");
    if (k === "none") return;
    map.addSource("idw", { type: "image", url: idwImage(k), coordinates: [[BB.lon0, BB.lat1], [BB.lon1, BB.lat1], [BB.lon1, BB.lat0], [BB.lon0, BB.lat0]] });
    map.addLayer({ id: "idw", type: "raster", source: "idw", paint: { "raster-opacity": 0.62, "raster-resampling": "linear" } }, "dist-line");
  }

  /* ---------------- paso 2: perfil y color ---------------- */
  function stepPerfil() {
    return '<section class="su-step" id="su-step-perfil" hidden>' +
      '<div class="su-panel"><div class="su-panel-head"><div><h2 class="su-h2">Foto de la calicata</h2><p class="su-small muted">Elige un horizonte y arrastra un recuadro sobre una cara iluminada del perfil, sin sombras ni raíces.</p></div>' +
      '<div class="su-row"><label class="btn" for="su-file">Subir foto</label><input type="file" id="su-file" accept="image/*" hidden>' +
      '<button class="btn ghost" type="button" id="su-ex">Usar ejemplo</button><button class="btn ghost" type="button" id="su-wb" aria-pressed="false" title="Arrastra sobre algo blanco o gris neutro (cartel, carta de color) para corregir el balance de blancos">Referencia blanca</button><button class="btn ghost" type="button" id="su-addhz">+ Horizonte</button></div></div>' +
      '<div class="su-row su-hzpick" id="su-hzpick"></div>' +
      '<div class="su-stage" id="su-stage"><canvas id="su-photo"></canvas></div><p class="su-small muted" id="su-photo-meta"></p></div>' +
      '<div class="su-grid2"><div class="su-panel"><div class="su-panel-head"><h2 class="su-h2">Horizontes y color Munsell</h2><span class="su-h3">foto = seco, sin carta</span></div>' +
      '<div class="su-stack" id="su-hzlist"></div>' +
      '<p class="su-note">La lectura desde la foto es aproximada: la luz directa, la cámara y la humedad cambian el color. El color húmedo se estima restando una unidad de valor. Si tienes la lectura con tabla Munsell en campo, escríbela en «Campo»: tiene prioridad en todos los cálculos.</p></div>' +
      '<div class="su-stack"><div class="su-panel"><div class="su-panel-head"><h2 class="su-h2">Lectura asistida por IA</h2><span class="su-h3">Claude · visión</span></div>' +
      '<p class="su-small muted" id="su-ai-intro"></p><div class="su-row"><button class="btn" type="button" id="su-ai-btn" hidden>Interpretar foto con IA</button><button class="btn ghost" type="button" id="su-ai-stop" hidden>Detener</button></div><div class="su-ai" id="su-ai-out"></div></div>' +
      '<div class="su-panel"><h2 class="su-h2">Cómo leer el color</h2><dl class="su-kv"><dt>Matiz</dt><dd>10YR pardo · 2.5Y amarillento · 5YR rojizo</dd><dt>Valor</dt><dd>2 oscuro → 8 claro (más MO, más oscuro)</dd><dt>Croma</dt><dd>1 grisáceo → 8 intenso</dd></dl>' +
      '<p class="su-note">Croma ≤ 2 en el subsuelo suele indicar reducción por agua estancada; en suelos con carbonatos los colores claros pueden deberse al CaCO₃.</p></div></div></div>' +
      "</section>";
  }
  var cv, ctx, off, offx;
  function bindPerfil() {
    cv = $("#su-photo"); ctx = cv.getContext("2d");
    off = document.createElement("canvas"); offx = off.getContext("2d", { willReadFrequently: true });
    new ResizeObserver(function () { sizeCanvas(); }).observe($("#su-stage"));
    var drag = null;
    var rel = function (e) { var r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
    var norm = function (b) { return [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])]; };
    cv.addEventListener("pointerdown", function (e) { if (!S.photo.ok) return; var p = rel(e); drag = [p[0], p[1], p[0], p[1]]; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", function (e) { if (!drag) return; var p = rel(e); drag[2] = p[0]; drag[3] = p[1]; drawPhoto(norm(drag)); });
    cv.addEventListener("pointerup", function () {
      if (!drag) return;
      var b = norm(drag); drag = null;
      if ((b[2] - b[0]) * off.width < 6 || (b[3] - b[1]) * off.height < 6) { drawPhoto(); return; }
      if (S.tool === "wb") {
        S.photo.wbBox = b; var st = boxStats(b);
        S.photo.gains = st.rgb.map(function (c) { return clamp(242 / Math.max(1, c), 0.7, 1.45); });
        S.tool = "hz"; $("#su-wb").setAttribute("aria-pressed", "false"); toast("Balance de blancos aplicado");
      } else S.hz[S.activeHz].box = b;
      sampleAll(); drawPhoto();
    });
    $("#su-wb").onclick = function () {
      S.tool = S.tool === "wb" ? "hz" : "wb";
      this.setAttribute("aria-pressed", S.tool === "wb");
      if (S.tool === "wb") toast("Arrastra sobre una superficie blanca o gris neutro");
      else { S.photo.gains = [1, 1, 1]; S.photo.wbBox = null; sampleAll(); drawPhoto(); }
    };
    $("#su-ex").onclick = function () {
      S.hz = SD.ej.horizontes.map(function (h) { return { name: h.nombre, top: h.desde, bot: h.hasta, box: h.recuadro.slice(), field: "", note: h.nota }; });
      S.activeHz = 0; loadExamplePhoto();
    };
    $("#su-addhz").onclick = function () {
      var last = S.hz[S.hz.length - 1], top = last ? +last.bot : 0;
      S.hz.push({ name: "H" + (S.hz.length + 1), top: top, bot: top + 20, box: null, field: "", note: "" });
      S.activeHz = S.hz.length - 1; renderAll(); drawPhoto(); toast("Dibuja en la foto el recuadro del nuevo horizonte");
    };
    $("#su-file").onchange = function (e) { handleFile(e.target.files[0]); this.value = ""; };
    var st = $("#su-stage");
    ["dragenter", "dragover"].forEach(function (t) { st.addEventListener(t, function (e) { e.preventDefault(); st.classList.add("drop"); }); });
    ["dragleave", "drop"].forEach(function (t) { st.addEventListener(t, function (e) { e.preventDefault(); st.classList.remove("drop"); }); });
    st.addEventListener("drop", function (e) { var f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    initAI();
  }
  function loadImage(src, meta) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        var sc = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        off.width = Math.round(im.naturalWidth * sc); off.height = Math.round(im.naturalHeight * sc);
        offx.drawImage(im, 0, 0, off.width, off.height);
        Object.assign(S.photo, { ok: true, w: off.width, h: off.height, gains: [1, 1, 1], wbBox: null }, meta);
        sizeCanvas(); sampleAll(); photoMeta(); res();
      };
      im.onerror = function () { rej(new Error("imagen")); };
      im.src = src;
    });
  }
  function loadExamplePhoto() {
    loadImage(SD.ej.foto, { name: "Calicata EEA Vista Florida (" + SD.ej.fecha.split("-").reverse().join("/") + ")", example: true, gps: null })
      .catch(function () { $("#su-photo-meta").textContent = "No se pudo cargar la foto de ejemplo. Sube una foto."; });
  }
  function handleFile(file) {
    if (!file || !/^image\//.test(file.type)) { toast("El archivo no es una imagen"); return; }
    file.arrayBuffer().then(function (buf) {
      var gps = exifGPS(buf), url = URL.createObjectURL(file);
      return loadImage(url, { name: file.name, example: false, gps: gps }).then(function () {
        S.hz.forEach(function (h) { h.box = null; });
        S.activeHz = 0; sampleAll(); drawPhoto();
        toast(gps ? "Ubicación tomada del GPS de la foto. Ahora marca cada horizonte." : "Foto cargada. Marca cada horizonte con un recuadro.");
        if (gps) setSite(gps.lat, gps.lon);
      });
    }).catch(function () { toast("El navegador no pudo abrir esta imagen. Prueba con JPG o PNG."); });
  }
  function photoMeta() {
    var g = S.photo.gps;
    $("#su-photo-meta").textContent = S.photo.name + " · " + S.photo.w + "×" + S.photo.h + " px" +
      (g ? " · GPS de la foto: " + g.lat.toFixed(5) + ", " + g.lon.toFixed(5) : S.photo.example ? " · sello GPS Map Camera: " + SD.ej.utm : " · sin GPS en los metadatos (WhatsApp los elimina)") +
      (S.photo.gains.some(function (x) { return x !== 1; }) ? " · balance de blancos aplicado" : "");
  }
  function sizeCanvas() {
    if (!cv || !S.photo.ok) return;
    var w = $("#su-stage").clientWidth; if (!w) return;
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * S.photo.h / S.photo.w * dpr);
    drawPhoto();
  }
  function drawPhoto(tmp) {
    if (!S.photo.ok || !cv.width) return;
    var W = cv.width, H = cv.height, dpr = window.devicePixelRatio || 1, lw = 2 * dpr;
    ctx.clearRect(0, 0, W, H); ctx.drawImage(off, 0, 0, W, H);
    S.hz.forEach(function (h, i) {
      if (!h.box) return;
      var b = h.box, col = HZ_STROKE[i % HZ_STROKE.length];
      ctx.lineWidth = i === S.activeHz ? lw * 1.6 : lw; ctx.strokeStyle = col;
      ctx.setLineDash(i === S.activeHz ? [] : [6 * dpr, 4 * dpr]);
      ctx.strokeRect(b[0] * W, b[1] * H, (b[2] - b[0]) * W, (b[3] - b[1]) * H); ctx.setLineDash([]);
      ctx.font = "600 " + 12 * dpr + "px 'IBM Plex Mono',monospace";
      var tw = ctx.measureText(h.name).width + 8 * dpr;
      ctx.fillStyle = col; ctx.fillRect(b[0] * W, b[1] * H - 16 * dpr, tw, 16 * dpr);
      ctx.fillStyle = "#fff"; ctx.fillText(h.name, b[0] * W + 4 * dpr, b[1] * H - 4 * dpr);
    });
    if (S.photo.wbBox) { var w = S.photo.wbBox; ctx.strokeStyle = "#fff"; ctx.lineWidth = lw; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.strokeRect(w[0] * W, w[1] * H, (w[2] - w[0]) * W, (w[3] - w[1]) * H); ctx.setLineDash([]); }
    if (tmp) { ctx.strokeStyle = S.tool === "wb" ? "#fff" : HZ_STROKE[S.activeHz % HZ_STROKE.length]; ctx.lineWidth = lw; ctx.strokeRect(tmp[0] * W, tmp[1] * H, (tmp[2] - tmp[0]) * W, (tmp[3] - tmp[1]) * H); }
  }
  function boxStats(b) {
    var X0 = Math.floor(b[0] * off.width), Y0 = Math.floor(b[1] * off.height), w = Math.max(1, Math.floor((b[2] - b[0]) * off.width)), h = Math.max(1, Math.floor((b[3] - b[1]) * off.height));
    var d = offx.getImageData(X0, Y0, w, h).data, step = Math.max(1, Math.floor(Math.sqrt(w * h / 6000))), R = [], G = [], B = [];
    for (var y = 0; y < h; y += step) for (var x = 0; x < w; x += step) { var o = (y * w + x) * 4; R.push(d[o]); G.push(d[o + 1]); B.push(d[o + 2]); }
    var med = function (a) { a = a.slice().sort(function (p, q) { return p - q; }); return a[a.length >> 1]; };
    var Ls = R.map(function (r, i) { return rgb2lab([r, G[i], B[i]])[0]; }), mL = U.mean(Ls);
    var sd = Math.sqrt(Ls.reduce(function (a, l) { return a + (l - mL) * (l - mL); }, 0) / Ls.length);
    return { rgb: [med(R), med(G), med(B)], sdL: sd };
  }
  function sampleAll() {
    S.hz.forEach(function (h) {
      if (!h.box || !S.photo.ok) { h.ph = null; return; }
      var st = boxStats(h.box), g = S.photo.gains;
      var rgb = st.rgb.map(function (c, i) { return clamp(Math.round(c * g[i]), 0, 255); }), nn = nearestMunsell(rgb);
      h.ph = { rgb: rgb, lab: rgb2lab(rgb), sdL: st.sdL, best: nn[0][1], dE: nn[0][0], alts: nn.slice(1).map(function (x) { return munStr(x[1]); }) };
    });
    renderAll();
  }
  /* GPS en los metadatos EXIF de una foto JPG */
  function exifGPS(buf) {
    try {
      var v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null;
      var o = 2;
      while (o < v.byteLength) {
        var mk = v.getUint16(o); if ((mk & 0xFF00) !== 0xFF00) return null;
        var len = v.getUint16(o + 2);
        if (mk === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
          var t = o + 10, le = v.getUint16(t) === 0x4949;
          var g16 = function (p) { return v.getUint16(p, le); }, g32 = function (p) { return v.getUint32(p, le); };
          var ifd0 = t + g32(t + 4), n = g16(ifd0), gpsOff = null;
          for (var i = 0; i < n; i++) { var e = ifd0 + 2 + i * 12; if (g16(e) === 0x8825) gpsOff = t + g32(e + 8); }
          if (!gpsOff) return null;
          var m = g16(gpsOff), tags = {};
          for (var k = 0; k < m; k++) {
            var e2 = gpsOff + 2 + k * 12, tag = g16(e2), type = g16(e2 + 2), cnt = g32(e2 + 4);
            if (type === 2) tags[tag] = String.fromCharCode(v.getUint8(cnt <= 4 ? e2 + 8 : t + g32(e2 + 8)));
            else if (type === 5) { var p = t + g32(e2 + 8); tags[tag] = [0, 1, 2].map(function (q) { return g32(p + q * 8) / g32(p + q * 8 + 4); }); }
          }
          if (!tags[2] || !tags[4]) return null;
          var dd = function (a) { return a[0] + a[1] / 60 + a[2] / 3600; }, lat = dd(tags[2]), lon = dd(tags[4]);
          if (tags[1] === "S") lat = -lat; if (tags[3] === "W") lon = -lon;
          return isFinite(lat) && isFinite(lon) ? { lat: lat, lon: lon } : null;
        }
        o += 2 + len;
      }
    } catch (e) { /* sin EXIF legible */ }
    return null;
  }

  /* color de cada horizonte e interpretación */
  function hzColor(h) {
    var f = parseMunsell(h.field), dry = null, wet = null;
    if (h.ph) {
      var b = h.ph.best;
      dry = { h: b[0], v: b[1], c: b[2], str: munStr(b), rgb: b[3] };
      var wv = Math.max(2, b[1] - 1), wc = b[0] === "N" ? 0 : Math.min(8, b[2] + (b[2] <= 2 ? 0 : 1)), ch = chipFor(b[0], wv, wc);
      wet = ch ? { h: ch[0], v: ch[1], c: ch[2], str: munStr(ch), rgb: ch[3] } : null;
    }
    if (f) { var cf = chipFor(f.h, f.v, f.c); return { used: { h: f.h, v: f.v, c: f.c, str: h.field.trim().toUpperCase(), rgb: cf ? cf[3] : [128, 128, 128] }, source: "campo", dry: dry, wet: wet }; }
    if (wet) return { used: wet, source: "foto, húmedo est.", dry: dry, wet: wet };
    return { used: null, source: null, dry: dry, wet: wet };
  }
  function interpHz(h) {
    var c = hzColor(h);
    if (!c.used) return { txt: "Sin lectura de color: dibuja un recuadro en la foto o escribe la lectura de campo.", risk: 0 };
    var hue = c.used.h, v = c.used.v, ch = c.used.c, parts = [], risk = 0, moClass;
    if (v <= 3) { moClass = "alta"; parts.push("valor bajo: MO probablemente alta (más de 3 %)"); }
    else if (v <= 4) { moClass = "media"; parts.push("MO probable media (1,5–3 %)"); }
    else { moClass = "baja"; parts.push("valor alto: MO probable baja (menos de 1,5 %)"); }
    if (c.source !== "campo") {
      if (moClass === "alta" && S.f.mo < 3) parts.push("no coincide con la MO del laboratorio (" + fmt(S.f.mo, 2) + " %): el tono oscuro puede venir de sombra o humedad");
      if (moClass === "baja" && S.f.mo > 3) parts.push("no coincide con la MO del laboratorio (" + fmt(S.f.mo, 2) + " %): la luz directa aclara el color");
    }
    var hi = HUE_ORDER.indexOf(hue);
    if (hi >= 0 && hi <= 2) parts.push("matiz rojizo: óxidos de hierro, buena aireación");
    else if (hi === 3 || hi === 4) parts.push("matiz pardo: aireación normal");
    else if (hi >= 5) parts.push("matiz amarillo u oliva: humedad prolongada o material calcáreo");
    if (ch <= 2 && v >= 4 && h.top >= 15) { parts.push("croma bajo en el subsuelo: posible reducción o lavado"); risk += 0.25; if (hi >= 5 || hue === "N") risk += 0.15; }
    if (v >= 6 && ch <= 3 && S.f.caco3 >= 5) parts.push("colores claros compatibles con carbonatos");
    if (c.dry && h.ph && h.ph.lab[0] < 28) parts.push("lectura muy oscura: revisa que el recuadro no esté en sombra");
    if (c.dry && h.ph && h.ph.sdL > 9) parts.push("recuadro heterogéneo: reduce el área");
    return { txt: parts.join(" · "), risk: risk };
  }
  function drainageRisk(f) {
    var r = 0;
    S.hz.forEach(function (h) { r += interpHz(h).risk; });
    if (f.caco3 >= 5) r *= 0.6;
    if (f.compact) r += 0.2;
    return clamp(r, 0, 1);
  }
  function renderHz() {
    $("#su-hzpick").innerHTML = '<span class="su-small muted">Horizonte activo:</span>' + S.hz.map(function (h, i) {
      return '<button type="button" class="btn ' + (i === S.activeHz ? "" : "ghost") + '" data-i="' + i + '" aria-pressed="' + (i === S.activeHz) + '" style="border-left-color:' + HZ_STROKE[i % HZ_STROKE.length] + '">' + esc(h.name) + "</button>";
    }).join("");
    U.$$("#su-hzpick button").forEach(function (b) { b.onclick = function () { S.activeHz = +b.getAttribute("data-i"); renderHz(); drawPhoto(); }; });
    $("#su-hzlist").innerHTML = S.hz.map(function (h, i) {
      var c = hzColor(h), it = interpHz(h), q = h.ph ? (h.ph.dE < 3 ? ["ok", "buena"] : h.ph.dE < 6 ? ["warn", "aproximada"] : ["crit", "dudosa"]) : null;
      return '<div class="su-hz' + (i === S.activeHz ? " on" : "") + '"><div class="su-sw" title="Arriba: seco (foto). Abajo: color usado">' +
        '<span style="background:' + (c.dry ? "rgb(" + c.dry.rgb.join(",") + ")" : "var(--panel)") + '"></span><span style="background:' + (c.used ? "rgb(" + c.used.rgb.join(",") + ")" : "var(--panel)") + '"></span></div>' +
        '<div class="su-stack" style="gap:8px"><div class="su-hzgrid">' +
        '<div class="su-field"><label for="su-hzn' + i + '">Horizonte</label><input class="txt" id="su-hzn' + i + '" data-k="name" data-i="' + i + '" value="' + esc(h.name) + '"></div>' +
        '<div class="su-field"><label for="su-hzt' + i + '">Desde (cm)</label><input id="su-hzt' + i + '" type="number" min="0" data-k="top" data-i="' + i + '" value="' + h.top + '"></div>' +
        '<div class="su-field"><label for="su-hzb' + i + '">Hasta (cm)</label><input id="su-hzb' + i + '" type="number" min="0" data-k="bot" data-i="' + i + '" value="' + h.bot + '"></div>' +
        '<div class="su-field"><label for="su-hzf' + i + '">Campo (Munsell)</label><input id="su-hzf' + i + '" data-k="field" data-i="' + i + '" placeholder="10YR 4/3" value="' + esc(h.field) + '"></div></div>' +
        '<div class="su-row su-small" style="gap:6px 14px"><span>Foto (seco): <span class="su-munsell">' + (c.dry ? esc(c.dry.str) : "—") + "</span> " + (q ? pill(q[0], "ΔE " + fmt(h.ph.dE, 1) + " · " + q[1]) : "") + "</span>" +
        '<span>Húmedo est.: <span class="su-munsell">' + (c.wet ? esc(c.wet.str) : "—") + "</span></span>" +
        '<span>Usado: <b class="su-munsell">' + (c.used ? esc(c.used.str) : "—") + '</b> <span class="muted">' + (c.source || "") + "</span></span>" +
        (h.ph ? '<span class="muted">alternativas: ' + h.ph.alts.join(", ") + "</span>" : "") + "</div>" +
        '<p class="su-interp">' + (h.note ? esc(h.note) + ". " : "") + esc(it.txt) + "</p>" +
        '<div class="su-row"><button type="button" class="btn ghost" data-sel="' + i + '">Marcar en la foto</button>' + (S.hz.length > 1 ? '<button type="button" class="btn ghost" data-del="' + i + '">Quitar</button>' : "") + "</div></div></div>";
    }).join("");
    U.$$("#su-hzlist input").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var i = +inp.getAttribute("data-i"), k = inp.getAttribute("data-k"), v = inp.value;
        if (k === "top" || k === "bot") v = Math.max(0, parseFloat(v) || 0);
        if (k === "field" && v && !parseMunsell(v)) toast("Formato Munsell no reconocido. Ejemplo: 10YR 4/3");
        S.hz[i][k] = v; renderAll(); drawPhoto();
      });
    });
    U.$$("#su-hzlist [data-sel]").forEach(function (b) { b.onclick = function () { S.activeHz = +b.getAttribute("data-sel"); renderHz(); drawPhoto(); $("#su-stage").scrollIntoView({ behavior: "smooth", block: "center" }); }; });
    U.$$("#su-hzlist [data-del]").forEach(function (b) { b.onclick = function () { S.hz.splice(+b.getAttribute("data-del"), 1); S.activeHz = 0; renderAll(); drawPhoto(); }; });
  }

  /* lectura con IA (servicio opcional configurado en data/sitio.json → ia_suelos_url) */
  var aiCtl = null;
  function initAI() {
    var url = D.sitio && D.sitio.ia_suelos_url;
    if (!url) { $("#su-ai-intro").textContent = "La lectura de la foto con IA todavía no está activa en este sitio. Cuando se active, describirá estructura, raíces, moteados, límites entre horizontes y señales de compactación, y leerá el sello GPS si la foto lo trae."; return; }
    $("#su-ai-intro").textContent = "Describe estructura, raíces, moteados, límites entre horizontes y señales de compactación a partir de la foto, y lee el sello GPS si la foto lo trae. La foto se envía al servicio de IA del proyecto; no se guarda.";
    $("#su-ai-btn").hidden = false;
    $("#su-ai-stop").onclick = function () { if (aiCtl) aiCtl.abort(); };
    $("#su-ai-btn").onclick = function () {
      if (!S.photo.ok) return;
      var out = $("#su-ai-out"), btn = this;
      btn.disabled = true; $("#su-ai-stop").hidden = false;
      out.innerHTML = '<p class="muted">Analizando la foto… puede tardar hasta un minuto.</p>';
      aiCtl = new AbortController();
      var c = document.createElement("canvas"), sc = Math.min(1, 1568 / Math.max(off.width, off.height));
      c.width = Math.round(off.width * sc); c.height = Math.round(off.height * sc); c.getContext("2d").drawImage(off, 0, 0, c.width, c.height);
      var body = {
        imagen: c.toDataURL("image/jpeg", 0.86).split(",")[1],
        datos: {
          horizontes: S.hz.map(function (h) { var hc = hzColor(h); return { nombre: h.name, desde: +h.top, hasta: +h.bot, color_foto: hc.dry ? hc.dry.str : null, color_campo: h.field || null, nota: h.note || "" }; }),
          raices_cm: S.f.root, compactacion_cm: S.f.cTop > 0 ? [S.f.cTop, S.f.cBot] : null,
          ph: S.f.ph, ce: S.f.ce, mo: S.f.mo, caco3: S.f.caco3
        }
      };
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: aiCtl.signal })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw { msg: j && j.error }; return j; }); })
        .then(function (j) { S.ai = j.resultado || j; renderAI(S.ai); })
        .catch(function (e) {
          var msg = e && e.name === "AbortError" ? "Detenido." : (e && e.msg) || "No se pudo completar la lectura. Intenta de nuevo en unos minutos.";
          out.innerHTML = '<p class="su-note warn">' + esc(msg) + "</p>";
        })
        .then(function () { btn.disabled = false; $("#su-ai-stop").hidden = true; });
    };
  }
  function renderAI(r) {
    var H = r.horizontes || [], cvis = r.coordenadas_visibles, list = function (a) { return (a || []).filter(Boolean); };
    $("#su-ai-out").innerHTML = (r.resumen ? "<p>" + esc(r.resumen) + "</p>" : "") + '<p class="su-small muted">Confianza: ' + esc(r.confianza || "—") + "</p>" +
      (H.length ? '<h4>Horizontes</h4><div class="table-scroll"><table><thead><tr><th>Hz</th><th>cm</th><th>Estructura</th><th>Raíces</th><th>Moteados</th><th>Límite</th></tr></thead><tbody>' +
        H.map(function (h) { return "<tr><td>" + esc(h.nombre) + '</td><td class="mono">' + esc(h.profundidad_cm) + "</td><td>" + esc(h.estructura || "—") + "</td><td>" + esc(h.raices || "—") + "</td><td>" + esc(h.moteados_o_concreciones || "—") + "</td><td>" + esc(h.limite_inferior || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      (r.compactacion ? "<h4>Compactación</h4><p>" + esc(r.compactacion.evidencia || "—") + (r.compactacion.profundidad_cm ? ' <span class="mono">(' + esc(r.compactacion.profundidad_cm) + " cm)</span>" : "") + "</p>" : "") +
      (r.coincidencias_con_datos ? "<h4>Coincide con tus datos</h4><p>" + esc(r.coincidencias_con_datos) + "</p>" : "") +
      (r.discrepancias_con_datos ? "<h4>Revisar</h4><p>" + esc(r.discrepancias_con_datos) + "</p>" : "") +
      (r.calidad_foto ? "<h4>Calidad de la foto</h4><ul>" + list(r.calidad_foto.problemas).concat(list(r.calidad_foto.recomendaciones)).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (cvis && isFinite(cvis.lat) && isFinite(cvis.lon) ? '<div class="su-row"><span class="su-small">Sello leído: <span class="mono">' + esc(cvis.texto || "") + '</span></span><button type="button" class="btn ghost" id="su-ai-coord">Usar ' + (+cvis.lat).toFixed(5) + ", " + (+cvis.lon).toFixed(5) + "</button></div>" : "") +
      '<p class="su-note">Interpretación generada por IA a partir de la imagen. Verificar en campo.</p>';
    var b = $("#su-ai-coord"); if (b) b.onclick = function () { setSite(+cvis.lat, +cvis.lon); toast("Ubicación actualizada"); };
  }

  /* ---------------- paso 3: fertilidad ---------------- */
  var PARAMS = [
    { g: "Reacción, sales y materia orgánica", id: "ph", lbl: "pH", sub: "suelo:agua", min: 4, max: 9.5, step: .01, dec: 2, segs: [[5.5, "crit"], [6.0, "warn"], [7.3, "ok"], [7.8, "warn"], [9.5, "crit"]], sg: "ph" },
    { g: "Reacción, sales y materia orgánica", id: "ce", lbl: "CE", sub: "dS/m", min: 0, max: 12, step: .05, dec: 2, segs: null },
    { g: "Reacción, sales y materia orgánica", id: "mo", lbl: "Materia orgánica", sub: "%", min: 0, max: 8, step: .01, dec: 2, segs: [[2, "crit"], [3, "warn"], [8, "ok"]], sg: "mo" },
    { g: "Reacción, sales y materia orgánica", id: "caco3", lbl: "CaCO₃", sub: "%", min: 0, max: 25, step: .1, dec: 1, segs: [[2, "ok"], [10, "warn"], [25, "crit"]] },
    { g: "Reacción, sales y materia orgánica", id: "p", lbl: "P disponible", sub: "Olsen, mg/kg", min: 0, max: 80, step: .5, dec: 1, segs: [[7, "crit"], [14, "warn"], [80, "ok"]] },
    { g: "Cationes intercambiables", id: "ca", lbl: "Ca²⁺", sub: "cmol(+)/kg", min: 0, max: 60, step: .1, dec: 1, segs: [[2, "crit"], [5, "warn"], [25, "ok"], [60, "warn"]] },
    { g: "Cationes intercambiables", id: "mg", lbl: "Mg²⁺", sub: "cmol(+)/kg", min: 0, max: 10, step: .01, dec: 2, segs: [[.5, "crit"], [1, "warn"], [8, "ok"], [10, "warn"]] },
    { g: "Cationes intercambiables", id: "k", lbl: "K⁺", sub: "cmol(+)/kg", min: 0, max: 8, step: .01, dec: 2, segs: [[.2, "crit"], [.4, "warn"], [8, "ok"]] },
    { g: "Cationes intercambiables", id: "na", lbl: "Na⁺", sub: "cmol(+)/kg", min: 0, max: 10, step: .01, dec: 2, segs: null },
    { g: "Cationes intercambiables", id: "cic", lbl: "CIC", sub: "cmol(+)/kg", min: 1, max: 60, step: .1, dec: 1, segs: [[5, "crit"], [10, "warn"], [60, "ok"]], sg: "cec" },
    { g: "Física y riego", id: "sand", lbl: "Arena", sub: "%", min: 0, max: 100, step: .5, dec: 1, segs: [[70, "ok"], [85, "warn"], [100, "crit"]], sg: "sand" },
    { g: "Física y riego", id: "clay", lbl: "Arcilla", sub: "%", min: 0, max: 70, step: .5, dec: 1, segs: [[5, "warn"], [35, "ok"], [50, "warn"], [70, "crit"]], sg: "clay" },
    { g: "Física y riego", id: "root", lbl: "Profundidad de raíces", sub: "cm, observada", min: 0, max: 100, step: 1, dec: 0, segs: [[25, "crit"], [40, "warn"], [100, "ok"]] },
    { g: "Física y riego", id: "cTop", lbl: "Compactación desde", sub: "cm (0 = sin capa)", min: 0, max: 100, step: 1, dec: 0, segs: null },
    { g: "Física y riego", id: "cBot", lbl: "Compactación hasta", sub: "cm", min: 0, max: 100, step: 1, dec: 0, segs: null },
    { g: "Física y riego", id: "ecw", lbl: "CE del agua de riego", sub: "dS/m", min: 0, max: 4, step: .05, dec: 2, segs: [[.7, "ok"], [3, "warn"], [4, "crit"]] }
  ];
  function stepFert() {
    return '<section class="su-step" id="su-step-fertilidad" hidden>' +
      '<div class="su-panel"><div class="su-panel-head"><div><h2 class="su-h2">Parámetros de fertilidad</h2><p class="su-small muted">Mueve las barras o escribe el valor. Abre con el análisis de laboratorio de la EEA Vista Florida.</p></div>' +
      '<div class="su-row"><button type="button" class="btn ghost" id="su-pre-mid">Lab: valor medio</button><button type="button" class="btn ghost" id="su-pre-worst">Lab: peor caso</button><button type="button" class="btn ghost" id="su-pre-sg">Tomar de SoilGrids</button></div></div>' +
      '<div class="su-row" style="justify-content:space-between"><div class="su-legend">' +
      '<span><i style="width:18px;height:6px;background:var(--ok);opacity:.5;border-radius:3px"></i>Favorable</span><span><i style="width:18px;height:6px;background:var(--ochre);opacity:.5;border-radius:3px"></i>Atención</span><span><i style="width:18px;height:6px;background:var(--crit);opacity:.5;border-radius:3px"></i>Limitante</span>' +
      '<span><i style="width:18px;height:6px;border:1.5px solid var(--fg);border-top:0;opacity:.55"></i>Rango del laboratorio</span><span><i style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--g-bosque)"></i>SoilGrids en el sitio</span></div>' +
      '<label class="su-small">CE medida en <select id="su-cemethod" class="su-ui" style="padding:4px 6px;border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--fg)"><option value="1">Extracto de saturación (CEe)</option><option value="2">Relación 1:1</option><option value="4">Relación 1:2,5</option></select></label></div>' +
      '<div id="su-params"></div></div>' +
      '<div class="su-panel"><h2 class="su-h2">Relaciones y alertas</h2><div class="su-derived" id="su-derived"></div><div class="su-stack" id="su-alerts"></div></div>' +
      '<div class="su-panel"><div class="su-panel-head"><div><h2 class="su-h2">Contexto regional</h2><p class="su-small muted">Tu valor frente a SoilGrids en el sitio y a 13 perfiles agrícolas de Lambayeque (5–15 cm).</p></div>' +
      '<div class="su-legend"><span><i style="width:8px;height:8px;border-radius:50%;background:var(--muted)"></i>Perfiles de referencia</span><span><i style="width:9px;height:9px;transform:rotate(45deg);border:2px solid var(--g-bosque)"></i>SoilGrids en el sitio</span><span><i style="width:3px;height:14px;background:var(--accent)"></i>Tu valor</span></div></div>' +
      '<div id="su-strips"></div></div></section>';
  }
  function buildParams() {
    var host = $("#su-params"), g = null, box = null;
    PARAMS.forEach(function (p) {
      if (p.g !== g) { g = p.g; box = document.createElement("div"); box.className = "su-pgroup"; box.innerHTML = '<span class="su-h3">' + g + "</span>"; host.appendChild(box); }
      var lab = SD.ej.laboratorio.rango[p.id];
      var r = document.createElement("div"); r.className = "su-prow";
      r.innerHTML = '<div class="lbl">' + p.lbl + "<small>" + p.sub + '</small></div><input type="number" id="su-num-' + p.id + '" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" aria-label="' + p.lbl + '">' +
        '<div class="su-trk"><div class="band" id="su-band-' + p.id + '"></div>' + (lab ? '<div class="labr" id="su-labr-' + p.id + '"></div>' : "") + (p.sg ? '<div class="sgt" id="su-sgt-' + p.id + '"></div>' : "") +
        '<input type="range" id="su-rng-' + p.id + '" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" aria-label="' + p.lbl + ' (barra)"></div><div class="stc" id="su-st-' + p.id + '"></div><div class="msg" id="su-msg-' + p.id + '"></div>';
      box.appendChild(r);
      var set = function (v) { v = parseFloat(String(v).replace(",", ".")); if (!isFinite(v)) return; S.f[p.id] = clamp(v, p.min, p.max); renderAll(); };
      r.querySelector("input[type=number]").addEventListener("change", function () { set(this.value); });
      r.querySelector("input[type=range]").addEventListener("input", function () { set(this.value); });
    });
    $("#su-cemethod").onchange = function () { S.ceFactor = +this.value; renderAll(); };
    $("#su-pre-mid").onclick = function () { S.f = Object.assign({}, SD.ej.laboratorio.medio); renderAll(); toast("Valores medios del laboratorio"); };
    $("#su-pre-worst").onclick = function () { S.f = Object.assign({}, SD.ej.laboratorio.peor); renderAll(); toast("Peor caso del rango de laboratorio"); };
    $("#su-pre-sg").onclick = function () {
      var v = S.sg.v;
      Object.assign(S.f, { ph: +v.ph.toFixed(2), mo: +v.mo.toFixed(2), clay: +v.clay.toFixed(1), sand: +v.sand.toFixed(1), cic: +v.cec.toFixed(1) });
      renderAll(); toast("pH, MO, textura y CIC tomados de SoilGrids");
    };
  }
  function effVals() {
    var f = Object.assign({}, S.f);
    f.ece = f.ce * S.ceFactor;
    f.compact = f.cTop > 0 && f.cBot > f.cTop;
    f.depth = f.compact ? Math.min(f.root || 0, f.cTop) : (f.root || 0);
    return f;
  }
  function applyScen(f) {
    var g = Object.assign({}, f);
    if (S.scen.sub) { g.depth = Math.max(g.depth, 50); g.compact = false; }
    if (S.scen.org) g.mo += 1;
    if (S.scen.lav) g.ece = Math.max(g.ecw * 1.5, Math.min(g.ece, 2.0));
    if (S.scen.mg) g.mg = Math.max(g.mg, g.ca / 6);
    return g;
  }
  function derive(f) {
    var sb = f.ca + f.mg + f.k + f.na;
    return {
      camg: f.ca / Math.max(.01, f.mg), mgk: f.mg / Math.max(.01, f.k), camgk: (f.ca + f.mg) / Math.max(.01, f.k),
      sb: sb, psi: f.na / Math.max(.1, f.cic) * 100, psiSB: f.na / Math.max(.1, sb) * 100, tex: texture(f.sand, f.clay), silt: 100 - f.sand - f.clay
    };
  }
  function segStatus(segs, v) { for (var i = 0; i < segs.length; i++) if (v <= segs[i][0]) return segs[i][1]; return segs[segs.length - 1][1]; }
  function paramStatus(p, f, d) {
    switch (p.id) {
      case "ce": var e = f.ce * S.ceFactor; return e < 2 ? "ok" : e < 4 ? "warn" : "crit";
      case "na": return d.psi < 7 ? "ok" : d.psi < 15 ? "warn" : "crit";
      case "cTop": case "cBot": return f.cTop > 0 && f.cBot > f.cTop ? "warn" : "ok";
      case "p": var s = segStatus(p.segs, f.p); return s === "ok" && f.ph > 7.5 && f.caco3 > 2 ? "warn" : s;
      case "mg": var m = segStatus(p.segs, f.mg); return d.camg > 8 && m === "ok" ? "warn" : m;
      case "ca": return d.camg > 8 ? "crit" : segStatus(p.segs, f.ca);
    }
    return p.segs ? segStatus(p.segs, f[p.id]) : "na";
  }
  function paramMsg(p, f, d) {
    switch (p.id) {
      case "ph": return f.ph > 7.8 ? "Alcalino: baja disponibilidad de P, Fe, Zn, Mn y B; riesgo de clorosis férrica." : f.ph > 7.3 ? "Moderadamente alcalino: limita P, Fe, Zn, Mn y B disponibles." : f.ph < 5.5 ? "Ácido: posible toxicidad de aluminio y manganeso." : "Rango adecuado para la mayoría de forrajeras.";
      case "ce": var e = f.ce * S.ceFactor; return "CEe equivalente " + fmt(e, 2) + " dS/m: " + (e < 2 ? "no salino." : e < 4 ? "ligeramente salino, afecta leguminosas y maíz." : e < 8 ? "moderadamente salino, solo especies tolerantes." : "fuertemente salino.") + (S.ceFactor !== 1 ? " Conversión aproximada ×" + S.ceFactor + "." : "");
      case "mo": return f.mo < 2 ? "Bajo: poca capacidad buffer y poca retención de agua." : f.mo < 3 ? "Medio: mantener los aportes orgánicos." : "Adecuado.";
      case "caco3": return f.caco3 >= 10 ? "Fuertemente calcáreo: clorosis y fijación de fósforo." : f.caco3 >= 2 ? "Calcáreo: clorosis fisiológica en leguminosas sensibles." : "Sin carbonatos libres relevantes.";
      case "p": return f.p < 7 ? "Deficiente." : f.p < 14 ? "Medio." : f.ph > 7.5 && f.caco3 > 2 ? "Medio-alto, pero se fija como fosfato de calcio: la fracción aprovechable es menor." : "Adecuado.";
      case "ca": return d.camg > 8 ? "Ca/Mg = " + fmt(d.camg, 1) + " (óptimo 3–5): antagonismo con Mg y K." : "Calcio adecuado.";
      case "mg": return "Mg/K = " + fmt(d.mgk, 2) + (d.mgk < 1 ? ": riesgo de deficiencia de Mg inducida por K." : ".");
      case "k": return "Unos " + fmt(f.k * 391, 0) + " mg/kg: " + (f.k > 1 ? "alto a muy alto, favorece gramíneas C4." : "adecuado.");
      case "na": return "PSI " + fmt(d.psi, 1) + " % sobre la CIC · " + fmt(d.psiSB, 1) + " % sobre la suma de bases.";
      case "cic": return d.sb > f.cic * 1.15 ? "La suma de bases (" + fmt(d.sb, 1) + ") supera la CIC: el Ca extraído incluye carbonatos disueltos." : "Capacidad de intercambio coherente con la textura.";
      case "sand": return "Textura " + d.tex.toLowerCase() + " (limo " + fmt(d.silt, 1) + " %)." + (f.sand > 70 ? " Retiene poca agua y pocos nutrientes: riegos ligeros y frecuentes." : "");
      case "clay": return f.clay < 10 ? "Poca arcilla: CIC baja y riesgo de lixiviación." : "";
      case "root": return "Profundidad efectiva usada en el cálculo: " + fmt(effVals().depth, 0) + " cm.";
      case "cTop": case "cBot": return f.cTop > 0 && f.cBot > f.cTop ? "Capa compactada de " + (f.cBot - f.cTop) + " cm: frena raíces y agua." : "Sin capa compactada declarada.";
      case "ecw": return f.ecw < 0.7 ? "Agua sin restricción por sales." : f.ecw < 3 ? "Restricción ligera a moderada: considerar fracción de lavado." : "Agua salina: uso restringido.";
    }
    return "";
  }
  function renderParams() {
    var f = S.f, d = derive(f);
    PARAMS.forEach(function (p) {
      var span = p.max - p.min, pos = function (v) { return clamp((v - p.min) / span * 100, 0, 100); };
      $("#su-num-" + p.id).value = Number(f[p.id]).toFixed(p.dec); $("#su-rng-" + p.id).value = f[p.id];
      var segs = p.segs;
      if (p.id === "ce") segs = [[2 / S.ceFactor, "ok"], [4 / S.ceFactor, "warn"], [p.max, "crit"]];
      if (p.id === "na") segs = [[0.07 * f.cic, "ok"], [0.15 * f.cic, "warn"], [p.max, "crit"]];
      var band = $("#su-band-" + p.id);
      if (segs) { var prev = p.min; band.innerHTML = segs.map(function (s) { var to = Math.min(s[0], p.max), w = pos(to) - pos(prev); prev = to; return w > 0 ? '<span class="' + s[1] + '" style="width:' + w + '%"></span>' : ""; }).join(""); }
      else band.innerHTML = '<span class="none" style="width:100%"></span>';
      var lab = SD.ej.laboratorio.rango[p.id], lr = $("#su-labr-" + p.id);
      if (lab && lr) { var a = pos(lab[0]), b = pos(lab[1]); lr.style.left = a + "%"; lr.style.width = Math.max(.8, b - a) + "%"; lr.title = "Laboratorio: " + lab[0] + "–" + lab[1]; }
      if (p.sg) { var t = $("#su-sgt-" + p.id), v = S.sg.v[p.sg]; t.style.left = pos(v) + "%"; t.title = "SoilGrids: " + fmt(v, 2); }
      $("#su-st-" + p.id).innerHTML = p.id === "cBot" ? "" : pill(paramStatus(p, f, d));
      $("#su-msg-" + p.id).textContent = p.id === "cBot" ? "" : paramMsg(p, f, d);
    });
    var ef = effVals(), dr = drainageRisk(ef);
    var cells = [
      ["Ca/Mg", fmt(d.camg, 1), "óptimo 3–5", d.camg > 8 ? "crit" : d.camg > 5 ? "warn" : d.camg < 2 ? "crit" : "ok"],
      ["Mg/K", fmt(d.mgk, 2), "deseable > 1", d.mgk < 1 ? "warn" : "ok"],
      ["(Ca+Mg)/K", fmt(d.camgk, 1), "10–40", d.camgk < 10 || d.camgk > 40 ? "warn" : "ok"],
      ["PSI", fmt(d.psi, 1) + " %", "sin riesgo < 7 %", d.psi < 7 ? "ok" : d.psi < 15 ? "warn" : "crit"],
      ["Suma de bases", fmt(d.sb, 1), "cmol(+)/kg", d.sb > f.cic * 1.15 ? "warn" : "ok"],
      ["Textura", d.tex, "arena " + fmt(f.sand) + " · limo " + fmt(d.silt) + " · arcilla " + fmt(f.clay), f.sand > 85 ? "crit" : f.sand > 70 ? "warn" : "ok"],
      ["Profundidad efectiva", fmt(ef.depth) + " cm", "raíces o capa dura", ef.depth < 25 ? "crit" : ef.depth < 40 ? "warn" : "ok"],
      ["Riesgo de drenaje", dr < .25 ? "Bajo" : dr < .5 ? "Medio" : "Alto", "color + compactación", dr < .25 ? "ok" : dr < .5 ? "warn" : "crit"]
    ];
    $("#su-derived").innerHTML = cells.map(function (c) { return '<div class="su-dcell"><span class="k">' + c[0] + '</span><span class="v">' + c[1] + '</span><span class="s"><span>' + c[2] + "</span>" + pill(c[3]) + "</span></div>"; }).join("");
    var al = [];
    if (d.sb > f.cic * 1.15) al.push(["warn", "La suma de bases (" + fmt(d.sb, 1) + " cmol/kg) es " + fmt(d.sb / f.cic, 1) + " veces la CIC. En suelos calcáreos el acetato de amonio disuelve CaCO₃ y sobreestima el Ca intercambiable: la relación Ca/Mg real puede ser menor. Pide CIC y Ca por un método para suelos calcáreos."]);
    if (S.ceFactor === 1 && f.ce >= 2) al.push(["warn", "Confirma con el laboratorio si la CE es de extracto de saturación o de suspensión 1:1. Si es 1:1, la salinidad real es aproximadamente el doble."]);
    if (f.ph > 7.5 && f.caco3 >= 5) al.push(["warn", "pH alcalino con carbonatos: alto riesgo de clorosis férrica en leguminosas y sorgo."]);
    $("#su-alerts").innerHTML = al.map(function (a) { return '<p class="su-note ' + a[0] + '">' + a[1] + "</p>"; }).join("");
  }
  function renderStrips() {
    var f = S.f, vars = [["ph", "pH", f.ph, 2], ["mo", "MO %", f.mo, 2], ["clay", "Arcilla %", f.clay, 1], ["sand", "Arena %", f.sand, 1], ["cec", "CIC", f.cic, 1]];
    $("#su-strips").innerHTML = vars.map(function (x) {
      var k = x[0], v = x[2], dd = x[3], vals = SD.ref.map(function (p) { return p[k]; }), sgv = S.sg.v[k];
      var lo0 = Math.min.apply(null, vals.concat([v, sgv])), hi0 = Math.max.apply(null, vals.concat([v, sgv])), pad = (hi0 - lo0) * .06 || 1, lo = lo0 - pad, hi = hi0 + pad;
      var X = function (z) { return ((z - lo) / (hi - lo) * 100).toFixed(2); };
      var pct = Math.round(vals.filter(function (z) { return z < v; }).length / vals.length * 100), diff = v - sgv;
      return '<div class="su-strip"><div><b>' + x[1] + '</b><div class="su-small muted mono">' + fmt(v, dd) + "</div></div>" +
        '<div><div class="su-sline" role="img" aria-label="' + x[1] + ": tu valor " + fmt(v, dd) + '"><div class="axis"></div>' +
        SD.ref.map(function (p) { return '<span class="dot" style="left:' + X(p[k]) + '%" title="' + esc(p.n) + ": " + fmt(p[k], dd) + '"></span>'; }).join("") +
        '<span class="sgm" style="left:' + X(sgv) + '%" title="SoilGrids en el sitio: ' + fmt(sgv, dd) + '"></span><span class="you" style="left:' + X(v) + '%" title="Tu valor: ' + fmt(v, dd) + '"></span></div>' +
        '<div class="su-ends"><span>' + fmt(lo0, dd) + "</span><span>" + fmt(hi0, dd) + "</span></div></div>" +
        '<div class="su-small">Percentil ' + pct + ' en la región<br><span class="muted">' + (diff >= 0 ? "+" : "") + fmt(diff, dd) + " frente a SoilGrids</span></div></div>";
    }).join("");
  }

  /* ---------------- paso 4: uso forrajero ---------------- */
  var FACTORS = [["ph", "pH"], ["sal", "Sales"], ["dep", "Prof."], ["dr", "Drenaje"], ["ca", "CaCO₃"], ["cm", "Ca/Mg"], ["sod", "Sodio"], ["tex", "Textura"], ["mo", "MO"], ["p", "P"]];
  var GRUPO = { graminea: "Gramínea", leguminosa: "Leguminosa", arbustiva: "Arbustiva / arbórea", suculenta: "Suculenta" };
  var CLS_TXT = { S1: "Apto", S2: "Moderado", S3: "Marginal", N: "No apto" };
  function stepUso() {
    return '<section class="su-step" id="su-step-uso" hidden>' +
      '<div class="su-panel"><div><h2 class="su-h2">Escenarios de manejo</h2><p class="su-small muted">Activa una práctica para ver cómo cambia la aptitud. Los efectos son orientativos.</p></div>' +
      '<div class="su-scen"><label><input type="checkbox" data-sc="sub"> Subsolado a 50 cm</label><label><input type="checkbox" data-sc="org"> Enmienda orgánica (+1 % MO)</label><label><input type="checkbox" data-sc="lav"> Lavado de sales con drenaje</label><label><input type="checkbox" data-sc="mg"> Fertilización con Mg</label></div></div>' +
      '<div class="su-panel"><div class="su-panel-head"><div><h2 class="su-h2">Especies sugeridas</h2><p class="su-small muted" id="su-sp-sub"></p></div><div class="chips" id="su-sp-filters"></div></div>' +
      '<div id="su-sp-list"></div>' +
      '<p class="su-note">Clase según el factor más limitante: S1 ≥ 0,8 · S2 0,6–0,8 · S3 0,4–0,6 · N &lt; 0,4. Las tolerancias están en <code>suelos/especies.json</code> y se basan en Maas y Hoffman (1977), Ayers y Westcot (FAO 29), FAO Ecocrop, Tropical Forages y Watanabe et al. (2023). Validar con los ensayos de la red.</p></div>' +
      '<div class="su-panel"><h2 class="su-h2">Manejo recomendado</h2><ul class="su-recs" id="su-recs"></ul></div>' +
      '<div class="su-panel"><h2 class="su-h2">Exportar</h2><div class="su-row"><button type="button" class="btn ghost" id="su-dl-json">Informe completo (.json)</button><button type="button" class="btn ghost" id="su-dl-csv">Ranking de especies (.csv)</button><button type="button" class="btn ghost" id="su-dl-svg">Perfil del suelo (.svg)</button><button type="button" class="btn" id="su-copy">Copiar resumen</button></div>' +
      '<textarea class="su-sum" id="su-sum" readonly aria-label="Resumen del diagnóstico"></textarea></div></section>';
  }
  function bindUso() {
    U.$$("[data-sc]").forEach(function (c) { c.onchange = function () { S.scen[c.getAttribute("data-sc")] = c.checked; renderAll(); }; });
    var opts = [["todas", "Todas"], ["graminea", "Gramíneas"], ["leguminosa", "Leguminosas"], ["arbustiva", "Arbustivas"], ["suculenta", "Suculentas"], ["red", "En el catálogo de la red"]];
    var host = $("#su-sp-filters");
    host.innerHTML = opts.map(function (o) { return '<button type="button" class="chip" data-f="' + o[0] + '" aria-pressed="' + (S.filter === o[0]) + '">' + o[1] + "</button>"; }).join("");
    U.$$("button", host).forEach(function (b) { b.onclick = function () { S.filter = b.getAttribute("data-f"); U.$$("button", host).forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); renderSpecies(); }; });
    $("#su-dl-json").onclick = exportJSON; $("#su-dl-csv").onclick = exportCSV;
    $("#su-dl-svg").onclick = function () { saveFile("perfil-suelo-" + stamp() + ".svg", profileSVG(true), "image/svg+xml"); };
    $("#su-copy").onclick = function () {
      var btn = this, ta = $("#su-sum"), label = btn.textContent;
      var done = function (t) { btn.textContent = t; setTimeout(function () { btn.textContent = label; }, 1800); };
      var fallback = function () { ta.focus(); ta.select(); done("Texto seleccionado"); };
      try { navigator.clipboard.writeText(ta.value).then(function () { done("Copiado"); }, fallback); } catch (e) { fallback(); }
    };
  }
  function linf(x, x0, y0, x1, y1) { return y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0), 0, 1); }
  function scoreSpecies(sp, f, d, dr) {
    var ph = sp.ph, fph;
    if (f.ph >= ph[1] && f.ph <= ph[2]) fph = 1;
    else if (f.ph < ph[1]) fph = f.ph >= ph[0] ? linf(f.ph, ph[0], .45, ph[1], 1) : linf(f.ph, ph[0] - .7, 0, ph[0], .45);
    else fph = f.ph <= ph[3] ? linf(f.ph, ph[2], 1, ph[3], .45) : linf(f.ph, ph[3], .45, ph[3] + .7, 0);
    var thr = sp.ce[0], c50 = sp.ce[1], fsal = f.ece <= thr ? 1 : clamp(1 - .5 * (f.ece - thr) / (c50 - thr), 0, 1);
    var dmin = sp.prof[0], dopt = sp.prof[1], fdep = f.depth >= dopt ? 1 : f.depth >= dmin ? linf(f.depth, dmin, .6, dopt, 1) : Math.max(.15, .6 * f.depth / dmin);
    var fdr = 1 - dr * (1 - sp.drenaje) * .8;
    var fca = f.caco3 <= 2 ? 1 : 1 - (1 - sp.carbonatos) * Math.min(1, (f.caco3 - 2) / 13) * .75 - (f.ph > 7.6 && f.caco3 > 5 ? (1 - sp.carbonatos) * .15 : 0);
    var fcm = d.camg <= 5 ? 1 : 1 - (1 - sp.camg) * Math.min(1, (d.camg - 5) / 10) * .6;
    var fsod = d.psi <= .6 * sp.psi ? 1 : d.psi <= sp.psi ? 1 - .3 * (d.psi - .6 * sp.psi) / (.4 * sp.psi) : Math.max(.1, .7 - .6 * (d.psi - sp.psi) / sp.psi);
    var ftex = f.sand <= 60 ? 1 : 1 - (1 - sp.arena) * Math.min(1, (f.sand - 60) / 30) * .5;
    var fmo = 1 - sp.mo * Math.max(0, (2.5 - f.mo) / 2.5) * .5;
    var fp = f.p >= 10 ? 1 : 1 - .4 * sp.p * (10 - f.p) / 10;
    var fac = { ph: fph, sal: fsal, dep: fdep, dr: fdr, ca: fca, cm: fcm, sod: fsod, tex: ftex, mo: fmo, p: fp };
    var vals = Object.keys(fac).map(function (k) { return fac[k] = clamp(fac[k], 0, 1); });
    var mn = Math.min.apply(null, vals), gm = Math.exp(vals.reduce(function (a, v) { return a + Math.log(Math.max(v, .01)); }, 0) / vals.length);
    var lim = FACTORS.filter(function (x) { return fac[x[0]] < .8; }).sort(function (a, b) { return fac[a[0]] - fac[b[0]]; }).map(function (x) { return { k: x[0], l: x[1], v: fac[x[0]] }; });
    var lr = f.ecw > 0 ? f.ecw / (5 * thr - f.ecw) : 0;
    return { sp: sp, fac: fac, mn: mn, score: Math.round(100 * (.6 * mn + .4 * gm)), cls: mn >= .8 ? "S1" : mn >= .6 ? "S2" : mn >= .4 ? "S3" : "N", lim: lim, lr: lr > 0 && lr < 1 ? lr : null };
  }
  function rankAll(f) {
    var d = derive(f), dr = drainageRisk(f);
    if (S.scen.sub) dr = Math.max(0, dr - .2);
    return SD.sp.map(function (sp) { return scoreSpecies(sp, f, d, dr); }).sort(function (a, b) { return b.score - a.score; });
  }
  function facColor(v) { return v >= .8 ? "var(--ok)" : v >= .6 ? "var(--accent)" : v >= .4 ? "var(--ochre)" : "var(--crit)"; }
  function renderSpecies() {
    var base = effVals(), any = Object.keys(S.scen).some(function (k) { return S.scen[k]; }), cur = any ? applyScen(base) : base;
    var ranked = rankAll(cur), before = {};
    if (any) rankAll(base).forEach(function (r) { before[r.sp.id] = r; });
    S.ranked = ranked;
    $("#su-sp-sub").textContent = ranked.filter(function (r) { return r.cls !== "N"; }).length + " de " + ranked.length + " especies con alguna aptitud" + (any ? " · con escenario de manejo" : "") +
      ". Profundidad efectiva " + fmt(cur.depth) + " cm · CEe " + fmt(cur.ece, 2) + " dS/m · pH " + fmt(cur.ph, 2) + ".";
    var list = ranked.filter(function (r) { return S.filter === "todas" || (S.filter === "red" ? !!r.sp.ficha : r.sp.grupo === S.filter); });
    $("#su-sp-list").innerHTML = list.map(function (r) {
      var b = before[r.sp.id], delta = b && b.cls !== r.cls ? ' <span class="su-small muted">antes ' + b.cls + "</span>" : "";
      return '<div class="su-sp"><div><div class="su-row" style="gap:10px"><span class="su-cls ' + r.cls + '">' + r.cls + '</span><span class="name">' + esc(r.sp.comun) + "</span>" + delta + "</div>" +
        '<div class="sci">' + esc(r.sp.cientifico) + "</div>" +
        '<div class="su-tags"><span class="su-tag">' + GRUPO[r.sp.grupo] + "</span>" + r.sp.uso.map(function (u) { return '<span class="su-tag">' + esc(u) + "</span>"; }).join("") + (r.sp.caprinos ? '<span class="su-tag">Caprinos</span>' : "") + "</div>" +
        "<p>" + (r.lim.length ? "<b>Limitantes:</b> " + r.lim.slice(0, 3).map(function (x) { return x.l + " (" + fmt(x.v, 2) + ")"; }).join(", ") + ". " : "Sin limitantes relevantes. ") + esc(r.sp.nota) +
        (r.lr ? ' <span class="muted">Fracción de lavado ≈ ' + Math.round(r.lr * 100) + " %.</span>" : "") +
        (r.sp.ficha ? ' <a href="#especie/' + esc(r.sp.ficha) + '">Ver ficha en el catálogo</a>' : "") + "</p></div>" +
        '<div class="su-stack" style="gap:8px"><div class="su-score"><span class="mono">' + r.score + '</span><div class="bar"><span style="width:' + r.score + '%"></span></div><span class="muted">' + CLS_TXT[r.cls] + "</span></div>" +
        '<div class="su-fbars">' + FACTORS.map(function (x) { var v = r.fac[x[0]]; return '<div class="su-fb" title="' + x[1] + ": " + fmt(v, 2) + '">' + x[1] + '<div class="t"><span style="width:' + Math.round(v * 100) + "%;background:" + facColor(v) + '"></span></div></div>'; }).join("") + "</div></div></div>";
    }).join("") || '<p class="muted">No hay especies en este filtro.</p>';
  }
  function renderRecs() {
    var f = effVals(), d = derive(f), R = [], top = S.ranked[0];
    if (f.compact) R.push(["crit", "Romper la capa compactada", "Subsolado cruzado a 45–50 cm con el suelo seco antes de instalar, para atravesar la capa de " + f.cTop + "–" + f.cBot + " cm. Complementar con especies de raíz pivotante (leucaena, algarrobo) y evitar el tránsito de maquinaria con suelo húmedo."]);
    if (f.ece >= 2) R.push([f.ece >= 4 ? "crit" : "warn", "Controlar las sales", "CEe de " + fmt(f.ece, 2) + " dS/m. Aplicar riegos de lavado con drenaje efectivo; con agua de " + fmt(f.ecw, 2) + " dS/m la fracción de lavado para " + (top ? top.sp.comun : "la especie elegida") + " es de " + (top && top.lr ? Math.round(top.lr * 100) + " %" : "—") + " (Ayers y Westcot). Mantener el suelo húmedo en la siembra."]);
    if (f.ph > 7.3) R.push(["warn", "Manejar la alcalinidad", "Usar fuentes nitrogenadas acidificantes (sulfato de amonio), fósforo como fosfato monoamónico localizado y micronutrientes (Fe, Zn) quelatados por vía foliar. No aplicar cal ni dolomita."]);
    if (d.camg > 5) R.push([d.camg > 8 ? "crit" : "warn", "Corregir el desbalance Ca/Mg", "Ca/Mg de " + fmt(d.camg, 1) + ". Aportar Mg soluble (sulfato de magnesio o sulfato doble de K y Mg) y evitar fuentes de Ca (yeso, cal). Antes, verificar el Ca intercambiable con un método para suelos calcáreos."]);
    if (f.mo < 3) R.push([f.mo < 2 ? "crit" : "warn", "Elevar la materia orgánica", "Incorporar compost o estiércol caprino compostado, mantener rastrojos y rotar con leguminosas. Priorizar los sectores con menos de 2 % de MO."]);
    if (f.sand > 70) R.push(["warn", "Adaptar el riego a la textura arenosa", "Riegos más frecuentes y de menor lámina; fraccionar N y K para reducir pérdidas por lixiviación, sobre todo bajo los 40 cm de arena."]);
    if (d.psi >= 7) R.push([d.psi >= 15 ? "crit" : "warn", "Vigilar el sodio", "PSI de " + fmt(d.psi, 1) + " %. En suelo calcáreo el azufre elemental moviliza el Ca nativo; evitar riegos con agua sódica."]);
    if (f.p >= 14 && f.ph > 7.5) R.push(["ok", "Fósforo", "Nivel adecuado: solo mantenimiento con aplicaciones localizadas."]);
    if (f.k > 1) R.push(["ok", "Potasio", "Alto: no hace falta aplicar K. Vigilar el Mg del forraje (tetania en caprinos)."]);
    S.recs = R;
    $("#su-recs").innerHTML = R.map(function (r) { return "<li>" + pill(r[0], r[0] === "crit" ? "Prioridad" : r[0] === "warn" ? "Atención" : "Favorable") + "<div><b>" + r[1] + ".</b> " + esc(r[2]) + "</div></li>"; }).join("");
  }

  /* perfil dibujado (columna de resumen y exportación) */
  function profileSVG(standalone) {
    var W = standalone ? 560 : 268, H = standalone ? 620 : 290, top = standalone ? 78 : 8, left = standalone ? 60 : 30, pw = standalone ? 200 : 118;
    var maxD = Math.max.apply(null, [70].concat(S.hz.map(function (h) { return +h.bot || 0; })));
    var y = function (d) { return top + d / maxD * (H - top - (standalone ? 30 : 12)); };
    var ink = standalone ? "#17231C" : "var(--fg)", mut = standalone ? "#56665B" : "var(--muted)", acc = standalone ? "#2D6A4F" : "var(--accent)", f = S.f;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="100%" font-family="IBM Plex Mono, monospace" role="img" aria-label="Perfil del suelo">';
    if (standalone) s += '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/><text x="20" y="32" font-family="Archivo, Arial" font-weight="700" font-size="17" fill="' + ink + '">Perfil del suelo — ' + esc(S.site.name) + '</text><text x="20" y="54" font-size="11" fill="' + mut + '">' + S.site.lat.toFixed(5) + ", " + S.site.lon.toFixed(5) + " · Munsell de campo o estimado desde foto (húmedo) · Red JANO</text>";
    var pid = standalone ? "suH2" : "suH";
    s += '<defs><pattern id="' + pid + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#B3382C" stroke-width="1.6" opacity=".75"/></pattern></defs>';
    S.hz.forEach(function (h) {
      var c = hzColor(h), rgb = c.used ? c.used.rgb : [200, 200, 200], y0 = y(+h.top), y1 = y(+h.bot);
      s += '<rect x="' + left + '" y="' + y0 + '" width="' + pw + '" height="' + Math.max(1, y1 - y0) + '" fill="rgb(' + rgb.join(",") + ')" stroke="#ffffff" stroke-width="1"/>';
      var tc = rgb2lab(rgb)[0] > 55 ? "#1A1A16" : "#F4F3EC";
      if (y1 - y0 >= 11) s += '<text x="' + (left + 6) + '" y="' + ((y0 + y1) / 2 + 4) + '" font-size="' + (standalone ? 12 : 10) + '" fill="' + tc + '">' + esc(h.name) + (c.used ? " · " + esc(c.used.str) : "") + "</text>";
      if (standalone) s += '<text x="' + (left + pw + 120) + '" y="' + ((y0 + y1) / 2) + '" font-size="11" fill="' + ink + '"><tspan font-weight="600">' + esc(h.name) + " (" + h.top + "–" + h.bot + ' cm)</tspan><tspan x="' + (left + pw + 120) + '" dy="14" fill="' + mut + '">' + (c.used ? esc(c.used.str) + " · " + c.source : "sin color") + "</tspan></text>";
    });
    if (f.cTop > 0 && f.cBot > f.cTop) s += '<rect x="' + left + '" y="' + y(f.cTop) + '" width="' + pw + '" height="' + (y(f.cBot) - y(f.cTop)) + '" fill="url(#' + pid + ')"/><text x="' + (left + pw + 6) + '" y="' + ((y(f.cTop) + y(f.cBot)) / 2 + 3) + '" font-size="' + (standalone ? 11 : 9) + '" fill="#B3382C">compactación</text>';
    if (f.root > 0) s += '<line x1="' + (left - 4) + '" x2="' + (left + pw + 4) + '" y1="' + y(f.root) + '" y2="' + y(f.root) + '" stroke="' + acc + '" stroke-width="2" stroke-dasharray="5 3"/><text x="' + (left + pw + 6) + '" y="' + (y(f.root) - 3) + '" font-size="' + (standalone ? 11 : 9) + '" fill="' + acc + '">raíces ' + f.root + " cm</text>";
    [0, 15, 20, 30, 40, maxD].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (t) {
      s += '<line x1="' + (left - 6) + '" x2="' + left + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="' + mut + '"/><text x="' + (left - 9) + '" y="' + (y(t) + 3) + '" font-size="' + (standalone ? 11 : 9) + '" text-anchor="end" fill="' + mut + '">' + t + "</text>";
    });
    return s + "</svg>";
  }

  /* exportación */
  function stamp() { return new Date().toISOString().slice(0, 10); }
  function exportJSON() {
    var f = effVals(), d = derive(f), dist = districtAt(S.site.lon, S.site.lat);
    var rep = {
      sitio: { nombre: S.site.name, lat: S.site.lat, lon: S.site.lon, utm: toUTM(S.site.lat, S.site.lon), distrito: dist ? dist.distrito : null },
      soilgrids: { metodo: S.sg.method, valores_5_15cm: S.sg.v, por_profundidad: S.sg.depths || null },
      horizontes: S.hz.map(function (h) { var c = hzColor(h); return { nombre: h.name, desde_cm: +h.top, hasta_cm: +h.bot, munsell_foto_seco: c.dry && c.dry.str, munsell_humedo_estimado: c.wet && c.wet.str, munsell_campo: h.field || null, munsell_usado: c.used && c.used.str, deltaE: h.ph ? +h.ph.dE.toFixed(2) : null, interpretacion: interpHz(h).txt }; }),
      fertilidad: Object.assign({}, S.f, { factor_ce: S.ceFactor, cee: +f.ece.toFixed(2) }), derivados: d, escenarios: S.scen,
      ranking: S.ranked.map(function (r) { return { especie: r.sp.comun, cientifico: r.sp.cientifico, clase: r.cls, puntaje: r.score, limitantes: r.lim.map(function (x) { return x.l; }) }; }),
      manejo: S.recs.map(function (r) { return { nivel: r[0], tema: r[1], detalle: r[2] }; }), ia: S.ai, generado: new Date().toISOString(), fuente: "Red JANO · Suelos"
    };
    saveFile("diagnostico-suelo-forraje-" + stamp() + ".json", JSON.stringify(rep, null, 2), "application/json");
  }
  function exportCSV() {
    var q = function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; };
    var head = ["especie", "cientifico", "grupo", "clase", "puntaje"].concat(FACTORS.map(function (x) { return x[1]; }), ["limitantes"]);
    var rows = S.ranked.map(function (r) { return [r.sp.comun, r.sp.cientifico, GRUPO[r.sp.grupo], r.cls, r.score].concat(FACTORS.map(function (x) { return r.fac[x[0]].toFixed(2); }), [r.lim.map(function (x) { return x.l; }).join(" | ")]); });
    saveFile("ranking-forrajeras-" + stamp() + ".csv", "﻿" + [head].concat(rows).map(function (r) { return r.map(q).join(","); }).join("\n"), "text/csv");
  }
  function renderSummary() {
    var f = effVals(), d = derive(f), dist = districtAt(S.site.lon, S.site.lat), u = toUTM(S.site.lat, S.site.lon);
    var any = Object.keys(S.scen).some(function (k) { return S.scen[k]; });
    $("#su-sum").value = "DIAGNÓSTICO SUELO–FORRAJE · " + stamp() + "\nSitio: " + S.site.name + "\n" +
      (dist ? dist.distrito + ", " + dist.provincia + ", Lambayeque · " : "") + S.site.lat.toFixed(5) + ", " + S.site.lon.toFixed(5) + " · UTM " + u.zone + u.band + " " + u.E.toFixed(0) + " E " + u.N.toFixed(0) + " N\n\nPerfil (Munsell):\n" +
      S.hz.map(function (h) { var c = hzColor(h); return "  " + h.name + " (" + h.top + "-" + h.bot + " cm): " + (c.used ? c.used.str + " [" + c.source + "]" : "sin color"); }).join("\n") +
      "\nRaíces hasta " + f.root + " cm · compactación " + (f.compact ? f.cTop + "-" + f.cBot + " cm" : "no") + " · profundidad efectiva " + f.depth + " cm\n\n" +
      "Fertilidad: pH " + f.ph + " · CEe " + f.ece.toFixed(2) + " dS/m · MO " + f.mo + " % · CaCO3 " + f.caco3 + " % · P " + f.p + " mg/kg · Ca/Mg " + d.camg.toFixed(1) + " · PSI " + d.psi.toFixed(1) + " % · " + d.tex + "\n\n" +
      "Especies mejor ubicadas" + (any ? " (con escenario de manejo)" : "") + ":\n" +
      S.ranked.slice(0, 5).map(function (r, i) { return "  " + (i + 1) + ". " + r.sp.comun + " — " + r.cls + " (" + r.score + ")" + (r.lim.length ? "; limita: " + r.lim.slice(0, 2).map(function (x) { return x.l; }).join(", ") : ""); }).join("\n") +
      "\n\nManejo prioritario:\n" + S.recs.filter(function (r) { return r[0] !== "ok"; }).map(function (r) { return "  - " + r[1]; }).join("\n") +
      "\n\nRed JANO · PROCAP-INIA · herramienta de apoyo, no reemplaza el análisis de laboratorio.";
  }

  /* columna de resumen */
  function renderRail() {
    var dist = districtAt(S.site.lon, S.site.lat), f = S.f, dv = derive(f);
    $("#su-r-site").textContent = S.site.name;
    $("#su-r-coords").textContent = S.site.lat.toFixed(5) + ", " + S.site.lon.toFixed(5) + (dist ? " · " + dist.distrito : "");
    var st = PARAMS.filter(function (p) { return p.id !== "cBot"; }).map(function (p) { return paramStatus(p, f, dv); });
    var nC = st.filter(function (x) { return x === "crit"; }).length, nW = st.filter(function (x) { return x === "warn"; }).length;
    $("#su-r-status").innerHTML = pill("crit", nC + " limitantes") + pill("warn", nW + " en atención");
    $("#su-r-profile").innerHTML = profileSVG(false);
    $("#su-r-rank").innerHTML = S.ranked.slice(0, 5).map(function (r, i) { return '<li><span class="mono muted">' + (i + 1) + "</span><span>" + esc(r.sp.comun) + '</span><span class="su-cls ' + r.cls + '">' + r.cls + "</span></li>"; }).join("");
  }

  function renderAll() {
    if (!built) return;
    renderParams(); renderStrips(); renderHz(); renderSpecies(); renderRecs(); renderRail(); renderSummary();
  }
})();
