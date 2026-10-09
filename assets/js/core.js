/* ==========================================================================
   Red JANO · núcleo del sitio
   - Carga los datos de /data
   - Navegación por direcciones con # (ej. #jardin/vista-florida)
   - Utilidades compartidas por todas las secciones
   Normalmente no hace falta editar este archivo: el contenido vive en /data
   y en /herbarios, y cada sección tiene su propio archivo en assets/js.
   ========================================================================== */
(function () {
  "use strict";

  var JANO = window.JANO = {
    D: {},          // datos cargados
    routes: {},     // secciones registradas
    modules: [],    // funciones de inicio de cada sección
    current: null
  };

  /* ---------- archivos de datos comunes ---------- */
  var FILES = {
    sitio: "data/sitio.json",
    eeas: "data/eeas.geojson",
    parcelas: "data/parcelas.geojson",
    dep: "data/departamentos.geojson",
    especies: "data/especies.json",
    ensayos: "data/ensayos.json",
    ndvi: "data/ndvi.json",
    relato: "data/relato_ndvi.json",
    resumen: "data/resumen.json",
    herbarios: "data/herbarios.json"
  };

  /* ---------- catálogos fijos ---------- */
  JANO.GRAD = {
    costa: { nombre: "Costa árida", v: "--g-costa" },
    bosque: { nombre: "Bosque seco", v: "--g-bosque" },
    tropico: { nombre: "Trópico húmedo", v: "--g-tropico" },
    andes: { nombre: "Andes", v: "--g-andes" }
  };
  JANO.MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  JANO.MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

  /* ---------- utilidades ---------- */
  var U = JANO.u = {};
  U.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  U.$ = function (s, root) { return (root || document).querySelector(s); };
  U.$$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  U.cssVar = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };
  U.fmt = function (n, dec) {
    return Number(n).toLocaleString("es-PE", dec == null ? {} : { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  U.sw = function (g) { return '<i class="sw" style="background:var(' + JANO.GRAD[g].v + ')"></i>'; };
  U.eea = function (id) { return (JANO.D.eeaList || []).find(function (e) { return e.id === id; }); };
  U.mean = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
  U.median = function (a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };
  U.mesLargo = function (ym) { return JANO.MESES_L[parseInt(ym.slice(5, 7), 10) - 1] + " " + ym.slice(0, 4); };
  /* dirección pública del sitio (para QR y citas) */
  U.baseUrl = function () {
    var u = JANO.D.sitio && JANO.D.sitio.url_publica;
    if (u) return u.replace(/#.*$/, "").replace(/\/?$/, "/");
    return location.origin + location.pathname;
  };
  U.qrSvg = function (text) {
    try {
      var qr = qrcode(0, "M"); qr.addData(text); qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: "Código QR" });
    } catch (e) { return ""; }
  };
  U.copy = function (btn, text, selectEl) {
    var label = btn.textContent;
    var done = function (t) { btn.textContent = t; setTimeout(function () { btn.textContent = label; }, 1800); };
    var fallback = function () {
      if (selectEl) {
        var r = document.createRange(); r.selectNodeContents(selectEl);
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      done("Seleccionado");
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done("Copiado"); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  };

  /* ---------- lectura de archivos ---------- */
  JANO.loadJSON = function (url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url);
      return r.json();
    });
  };
  /* CSV con comillas, comas y saltos de línea dentro de celdas (formato de Excel "CSV UTF-8") */
  JANO.parseCSV = function (text) {
    text = text.replace(/^﻿/, "");
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    var head = rows.shift().map(function (h) { return h.trim(); });
    return rows.map(function (r) {
      var o = {};
      head.forEach(function (h, k) { o[h] = (r[k] == null ? "" : r[k]).trim(); });
      return o;
    });
  };
  JANO.loadCSV = function (url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url);
      return r.text();
    }).then(JANO.parseCSV);
  };

  /* ---------- registro de secciones ----------
     JANO.route("nombre", { view, nav, render(args) })
     render devuelve false si la dirección no existe, o una promesa. */
  JANO.route = function (name, def) { JANO.routes[name] = def; };
  JANO.module = function (fn) { JANO.modules.push(fn); };

  function showError(msg) {
    var l = U.$("#loading");
    l.hidden = false;
    l.innerHTML = '<span class="error-box">' + msg + "</span>";
  }

  JANO.go = function () {
    var h = decodeURIComponent((location.hash || "").slice(1));
    // direcciones antiguas (#jardin-x, #especie-x) siguen funcionando
    var m = h.match(/^(jardin|especie)-(.+)$/);
    if (m) { location.replace("#" + m[1] + "/" + m[2]); return; }
    var parts = h.split("/").filter(Boolean);
    var name = parts[0] || "inicio";
    var def = JANO.routes[name];
    if (!def && !U.$('[data-view="' + name + '"]')) { name = "inicio"; def = JANO.routes.inicio; parts = []; }
    var viewName = (def && def.view) || name;
    var navKey = (def && def.nav) || viewName;
    var res = def && def.render ? def.render(parts.slice(1)) : true;
    Promise.resolve(res).then(function (ok) {
      if (ok === false && def.fallback) { location.replace("#" + def.fallback); return; }
      U.$$("[data-view]").forEach(function (s) { s.hidden = s.getAttribute("data-view") !== viewName; });
      U.$$("[data-nav]").forEach(function (a) {
        if (a.getAttribute("data-nav") === navKey) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
      if (def && def.onShow) def.onShow(parts.slice(1));
      if (JANO.current !== h && !(def && def.keepScroll)) window.scrollTo(0, 0);
      JANO.current = h;
    }).catch(function (err) {
      showError("No se pudo abrir esta sección (" + U.esc(err.message) + ").");
    });
  };

  JANO.start = function () {
    var D = JANO.D;
    Promise.all(Object.keys(FILES).map(function (k) {
      return JANO.loadJSON(FILES[k]).then(function (j) { D[k] = j; });
    })).then(function () {
      D.eeaList = D.eeas.features.map(function (f) {
        var p = Object.assign({}, f.properties);
        p.lon = f.geometry.coordinates[0]; p.lat = f.geometry.coordinates[1];
        return p;
      });
      U.$("#loading").hidden = true;
      JANO.modules.forEach(function (fn) { fn(D); });
      window.addEventListener("hashchange", JANO.go);
      JANO.go();
    }).catch(function (err) {
      showError("No se pudieron cargar los datos (" + U.esc(err.message) + "). Si abriste el archivo con doble clic, " +
        "publícalo en GitHub Pages o usa un servidor local: <code>python -m http.server</code>.");
    });
  };
})();
