/* ==========================================================================
   Red JANO · Inicio, Visor, Jardines, Ensayos y Catálogo forrajero
   Datos: data/eeas.geojson, data/parcelas.geojson, data/especies.json,
          data/ensayos.json, data/resumen.json
   ========================================================================== */
(function () {
  "use strict";
  var J = window.JANO, U = J.u, esc = U.esc, $ = U.$, D = J.D;
  var GRAD = J.GRAD, sw = U.sw, fmt = U.fmt;

  var CAT = { graminea: "Gramíneas", leguminosa: "Leguminosas", arbustiva: "Arbustivas", herbacea: "Herbáceas", suculenta: "Suculentas" };
  var CAT_SING = { graminea: "Gramínea", leguminosa: "Leguminosa", arbustiva: "Arbustiva", herbacea: "Herbácea", suculenta: "Suculenta" };

  /* Textos de contexto de cada memoria técnica. Agrega aquí el de cada jardín. */
  var CONTEXTO = {
    "vista-florida": "Jardín ubicado en el bosque seco de la costa norte, en el distrito de Picsi. Los suelos son alcalinos (pH 7,5–8,2), lo que orientó la selección de Brachiarias tolerantes para el bloque demostrativo. El jardín abastece de forraje al núcleo caprino de la estación mediante corte escalonado de Cuba 22."
  };

  J.module(function () {
    D.parcelas.features.forEach(function (f) {
      var e = U.eea(f.properties.eea);
      f.properties.gradiente = e ? e.gradiente : "";
      f.properties.eea_nombre = e ? e.nombre : "";
    });
    renderInicio(); renderJardines(); renderEnsayos(); renderCatalogo();
  });

  J.route("inicio", {});
  J.route("jardines", {});
  J.route("ensayos", {});
  J.route("catalogo", {});
  J.route("jardin", { nav: "jardines", fallback: "jardines", render: function (a) { return renderJardin(a[0]); } });
  J.route("especie", { nav: "catalogo", fallback: "catalogo", render: function (a) { return renderEspecie(a[0]); } });
  J.route("visor", { onShow: function () { showMap(); } });

  /* ---------------- inicio ---------------- */
  function renderInicio() {
    var r = D.resumen;
    var crec = Math.round((r.variedades / r.variedades_2024 - 1) * 100);
    $("#figures").innerHTML = [
      [r.eeas, "Estaciones experimentales"],
      [r.gradientes, "Gradientes ecológicas"],
      [r.variedades, "Variedades únicas · <em>+" + crec + "% vs 2024</em>"],
      [r.registros, "Registros parcela-especie"]
    ].map(function (f) { return '<div class="figure"><strong>' + f[0] + "</strong><span>" + f[1] + "</span></div>"; }).join("");

    var max = Math.max.apply(null, r.categorias.map(function (c) { return c[1]; }));
    $("#bars").innerHTML = r.categorias.map(function (c) {
      return '<div class="bar"><span>' + esc(c[0]) + '</span><div class="track"><div class="fill" style="width:' +
        (c[1] / max * 100).toFixed(1) + '%"></div></div><span class="n">' + c[1] + "</span></div>";
    }).join("");

    $("#grad-list").innerHTML = r.gradientes_detalle.map(function (g) {
      var eeas = D.eeaList.filter(function (e) { return e.gradiente === g.id; }).map(function (e) { return e.nombre; });
      return '<div class="grad-row">' + sw(g.id) + "<div><h3>" + esc(g.nombre) + "</h3><p>" + esc(eeas.join(" · ")) +
        '</p></div><div class="n">' + g.variedades + "<small>variedades</small></div></div>";
    }).join("");

    $("#eea-table").innerHTML = '<thead><tr><th>Estación</th><th>Región</th><th>Gradiente</th><th class="r">Registros</th><th>Memoria</th><th>Herbario</th></tr></thead><tbody>' +
      D.eeaList.map(function (e) {
        var hb = herbarioDe(e.id);
        return '<tr><td><a href="#jardin/' + e.id + '">' + esc(e.nombre) + "</a></td><td>" + esc(e.departamento) +
          '</td><td><span class="tag">' + sw(e.gradiente) + GRAD[e.gradiente].nombre + '</span></td><td class="r">' + e.registros +
          "</td><td>" + estadoPill(e.estado_memoria) + "</td><td>" +
          (hb && hb.estado === "publicado" ? '<a class="pill ok" href="#herbario/' + e.id + '">Publicado</a>' : '<span class="pill">En preparación</span>') +
          "</td></tr>";
      }).join("") + "</tbody>";
  }
  function estadoPill(s) {
    return s === "borrador" ? '<span class="pill ok">Borrador</span>' : '<span class="pill">Pendiente</span>';
  }
  function herbarioDe(id) { return (D.herbarios || []).find(function (h) { return h.eea === id; }); }

  /* ---------------- jardines ---------------- */
  function renderJardines() {
    $("#eea-cards").innerHTML = D.eeaList.map(function (e) {
      var np = D.parcelas.features.filter(function (f) { return f.properties.eea === e.id; }).length;
      return '<a class="card" href="#jardin/' + e.id + '"><div class="meta"><span class="tag">' + sw(e.gradiente) +
        GRAD[e.gradiente].nombre + "</span>" + estadoPill(e.estado_memoria) + "</div><h3>EEA " + esc(e.nombre) + "</h3><p>" +
        esc(e.ubicacion) + ", " + esc(e.departamento) + '</p><p class="num">' + e.registros + " registros en inventario · " + np + " parcelas en el visor</p></a>";
    }).join("");
  }

  function renderJardin(id) {
    var e = U.eea(id);
    if (!e) return false;
    var parc = D.parcelas.features.filter(function (f) { return f.properties.eea === id; });
    var esp = D.especies.filter(function (s) { return s.eeas.indexOf(id) >= 0; });
    var ens = D.ensayos.filter(function (t) { return t.eea === id; });
    var hb = herbarioDe(id);
    var contexto = CONTEXTO[id]
      ? "<p>" + esc(CONTEXTO[id]) + "</p>"
      : '<div class="pending">Por completar: clima, suelos, disponibilidad de agua y sistema caprino de referencia de la estación.</div>';
    var rows = parc.map(function (f) {
      var p = f.properties;
      return '<tr><td class="mono">' + esc(p.codigo) + "</td><td>" + esc(p.tipo) + "</td><td>" + esc(p.especie) + '</td><td class="r">' + fmt(p.area_m2) + "</td></tr>";
    }).join("");
    var areaTot = parc.reduce(function (a, f) { return a + f.properties.area_m2; }, 0);
    var secs = ["Ubicación y contexto", "Diseño y parcelas", "Especies instaladas", "Ensayos", "Monitoreo satelital", "Herbario"];
    var html =
      '<p class="breadcrumb"><a href="#jardines">Jardines</a> / EEA ' + esc(e.nombre) + "</p>" +
      '<div class="pagehead"><p class="eyebrow">Memoria técnica</p><h1>EEA ' + esc(e.nombre) + "</h1></div>" +
      '<dl class="metarow">' +
      "<div><dt>Ubicación</dt><dd>" + esc(e.ubicacion) + ", " + esc(e.departamento) + "</dd></div>" +
      '<div><dt>Gradiente</dt><dd><span class="tag" style="color:inherit">' + sw(e.gradiente) + GRAD[e.gradiente].nombre + "</span></dd></div>" +
      '<div><dt>Coordenadas (ref.)</dt><dd class="num">' + e.lat.toFixed(4) + ", " + e.lon.toFixed(4) + "</dd></div>" +
      "<div><dt>Estado</dt><dd>" + estadoPill(e.estado_memoria) + "</dd></div></dl>" +
      '<div class="doc"><nav class="toc" aria-label="Contenido">' +
      secs.map(function (t, i) { return '<a href="#jardin/' + id + '" data-sec="s' + (i + 1) + '">' + (i + 1) + ". " + t + "</a>"; }).join("") + "</nav>" +
      '<div class="doc-body">' +
      sec(1, secs[0], '<div class="prose">' + contexto + "</div>") +
      sec(2, secs[1],
        '<p class="num">' + parc.length + " parcelas · " + fmt(areaTot) + " m² en el visor.</p>" +
        '<div class="table-scroll"><table><thead><tr><th>Código</th><th>Tipo</th><th>Especie / tratamiento</th><th class="r">Área (m²)</th></tr></thead><tbody>' +
        rows + '</tbody></table></div><p><button class="btn ghost" type="button" data-fly="' + id + '">Ver en el visor</button></p>') +
      sec(3, secs[2],
        '<p class="num">' + e.registros + " registros parcela-especie en el inventario 2026. Especies del catálogo presentes en esta versión:</p>" +
        '<div class="chips">' + (esp.map(function (s) {
          return '<a class="chip" href="#especie/' + s.id + '">' + esc(s.comun) + "</a>";
        }).join("") || '<span class="muted">Sin especies del catálogo.</span>') + "</div>") +
      sec(4, secs[3], ens.length
        ? ens.map(function (t) { return '<p><a href="#ensayos">' + esc(t.titulo) + "</a> · " + esc(t.diseno) + "</p>"; }).join("")
        : '<div class="pending">Sin ensayos registrados. Aquí se listarán los ensayos instalados en este jardín.</div>') +
      sec(5, secs[4], '<p class="muted">NDVI medio mensual de las parcelas (serie simulada). <a href="#monitoreo">Ver el monitoreo de toda la red</a>.</p><div id="jardin-chart"></div>') +
      sec(6, secs[5], hb && hb.estado === "publicado"
        ? '<p>El herbario de la estación documenta la flora silvestre y forrajera de su entorno. <a href="#herbario/' + id + '">Abrir el herbario de ' + esc(e.nombre) + "</a>.</p>"
        : '<div class="pending">Herbario en preparación. Cuando la estación cargue sus ejemplares aparecerá aquí.</div>') +
      "</div></div>";
    var v = $("#jardin-view");
    v.innerHTML = html;
    J.lineChart($("#jardin-chart"), [{ color: "var(" + GRAD[e.gradiente].v + ")", values: D.ndvi.series[id], area: true }], D.ndvi.meses, 220);
    U.$$("[data-sec]", v).forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        var t = document.getElementById(a.getAttribute("data-sec"));
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    v.querySelector("[data-fly]").addEventListener("click", function () { flyToEea(id); });
    return true;
  }
  function sec(n, t, body) {
    return '<section class="doc-sec" id="s' + n + '" style="scroll-margin-top:90px"><h2><span class="secno">' + n + "</span>" + t + "</h2>" + body + "</section>";
  }

  /* ---------------- ensayos ---------------- */
  function renderEnsayos() {
    $("#trials").innerHTML = D.ensayos.map(function (t) {
      var e = t.eea ? U.eea(t.eea) : null;
      return '<article class="trial"><div class="head"><div class="chips"><span class="pill">' + esc(t.tipo) + '</span><span class="pill ok">' + esc(t.estado) + "</span></div><h3>" +
        esc(t.titulo) + '</h3><p class="muted">' + (e ? 'EEA <a href="#jardin/' + e.id + '">' + esc(e.nombre) + "</a>" : "Toda la red") + "</p></div>" +
        '<dl class="kv"><dt>Diseño</dt><dd>' + esc(t.diseno) + "</dd>" +
        (t.tratamientos.length ? "<dt>Tratamientos</dt><dd>" + t.tratamientos.map(esc).join(" · ") + "</dd>" : "") +
        "<dt>Variables</dt><dd>" + t.variables.map(esc).join(" · ") + "</dd></dl></article>";
    }).join("");
  }

  /* ---------------- catálogo forrajero ---------------- */
  var catFilter = "todas";
  function renderCatalogo() {
    var counts = {};
    D.especies.forEach(function (s) { counts[s.categoria] = (counts[s.categoria] || 0) + 1; });
    var chips = [["todas", "Todas", D.especies.length]].concat(Object.keys(CAT).map(function (k) { return [k, CAT[k], counts[k] || 0]; }));
    $("#cat-chips").innerHTML = chips.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + c[0] + '" aria-pressed="' + (c[0] === catFilter) + '">' + c[1] + ' <span class="num">' + c[2] + "</span></button>";
    }).join("");
    $("#cat-chips").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cat]");
      if (!b) return;
      catFilter = b.getAttribute("data-cat");
      U.$$("[data-cat]", $("#cat-chips")).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      drawLabels();
    });
    $("#sp-search").addEventListener("input", drawLabels);
    drawLabels();
  }
  function drawLabels() {
    var q = $("#sp-search").value.trim().toLowerCase();
    var list = D.especies.filter(function (s) {
      return (catFilter === "todas" || s.categoria === catFilter) &&
        (!q || (s.comun + " " + s.cientifico + " " + (s.cultivar || "")).toLowerCase().indexOf(q) >= 0);
    });
    $("#labels").innerHTML = list.length ? list.map(function (s) {
      return '<a class="label" href="#especie/' + s.id + '"><span class="eyebrow">' + CAT_SING[s.categoria] + "</span><h3>" + esc(s.comun) +
        '</h3><span class="sci">' + esc(s.cientifico) + '</span><div class="foot"><span>' + esc(s.familia) + "</span><span>" + esc(s.uso) + "</span></div></a>";
    }).join("") : '<p class="muted">Ninguna especie coincide con la búsqueda.</p>';
  }

  function renderEspecie(id) {
    var s = D.especies.find(function (x) { return x.id === id; });
    if (!s) return false;
    var url = U.baseUrl() + "#especie/" + s.id;
    var en = s.eeas.map(function (eid) {
      var e = U.eea(eid);
      return '<a class="chip" href="#jardin/' + eid + '">' + sw(e.gradiente) + esc(e.nombre) + "</a>";
    }).join("");
    var v = $("#especie-view");
    v.innerHTML =
      '<p class="breadcrumb"><a href="#catalogo">Catálogo</a> / ' + esc(s.comun) + "</p>" +
      '<article class="sheet"><div class="block">' +
      '<p class="eyebrow">' + CAT_SING[s.categoria] + " · " + esc(s.familia) + "</p><h1>" + esc(s.comun) + '</h1><p class="sci">' + esc(s.cientifico) + "</p>" +
      '<dl class="kv"><dt>Cultivar</dt><dd>' + esc(s.cultivar || "—") + "</dd><dt>Uso</dt><dd>" + esc(s.uso) + "</dd><dt>Descripción</dt><dd>" + esc(s.nota) +
      '</dd><dt>Presente en</dt><dd><div class="chips">' + en + "</div></dd></dl></div>" +
      '<div class="qr"><div class="code">' + (U.qrSvg(url) || '<p class="note">QR no disponible</p>') + '</div><span class="note">Código QR para la parcela</span><span class="url" id="sp-url">' + esc(url) +
      '</span><button class="btn ghost" type="button" id="copy-url">Copiar enlace</button></div></article>';
    $("#copy-url").addEventListener("click", function () { U.copy(this, url, $("#sp-url")); });
    return true;
  }

  /* ---------------- gráfico de líneas (también lo usa Monitoreo) ---------------- */
  J.lineChart = function (el, series, meses, h) {
    var W = 760, H = h, L = 40, R = 76, T = 12, B = 30;
    var n = meses.length;
    var x = function (i) { return L + i * (W - L - R) / (n - 1); };
    var y = function (v) { return T + (1 - v) * (H - T - B); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="NDVI mensual">';
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v.toFixed(1) + "</text>";
    });
    meses.forEach(function (m, i) {
      var mm = parseInt(m.slice(5), 10);
      if ((mm - 1) % 3 === 0) s += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + J.MESES[mm - 1] + " " + m.slice(2, 4) + "</text>";
    });
    if (!series.length) s += '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">Selecciona al menos un jardín</text>';
    series.forEach(function (se) {
      var pts = se.values.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); });
      if (se.area) s += '<polygon points="' + x(0) + "," + y(0) + " " + pts.join(" ") + " " + x(n - 1) + "," + y(0) + '" style="fill:' + se.color + ';opacity:.14"/>';
      s += '<polyline points="' + pts.join(" ") + '" style="fill:none;stroke:' + se.color + ';stroke-width:2.2;stroke-linejoin:round"/>';
      var lv = se.values[n - 1];
      s += '<circle cx="' + x(n - 1) + '" cy="' + y(lv) + '" r="3.5" style="fill:' + se.color + '"/>';
      s += '<text x="' + (x(n - 1) + 8) + '" y="' + (y(lv) + 4) + '" style="fill:' + se.color + '">' + lv.toFixed(2) + (se.label ? " " + esc(se.label) : "") + "</text>";
    });
    el.innerHTML = s + "</svg>";
  };

  /* ---------------- visor (MapLibre) ---------------- */
  var map = null, mapLoaded = false, pendingFly = null;
  var activeGrad = { costa: true, bosque: true, tropico: true, andes: true };

  function mapColors() {
    var c = U.cssVar;
    return {
      water: c("--water"), land: c("--land"), fg: c("--fg"), bg: c("--surface"), muted: c("--muted"),
      costa: c("--g-costa"), bosque: c("--g-bosque"), tropico: c("--g-tropico"), andes: c("--g-andes"),
      ensayo: c("--t-ensayo"), demo: c("--t-demo")
    };
  }
  function gradExpr(c) { return ["match", ["get", "gradiente"], "costa", c.costa, "bosque", c.bosque, "tropico", c.tropico, "andes", c.andes, c.fg]; }

  function buildSidebar() {
    $("#grad-filter").innerHTML = Object.keys(GRAD).map(function (g) {
      var n = D.eeaList.filter(function (e) { return e.gradiente === g; }).length;
      return '<label class="check"><input type="checkbox" data-grad="' + g + '" checked>' + sw(g) + GRAD[g].nombre + '<span class="count">' + n + " EEA</span></label>";
    }).join("");
    $("#grad-filter").addEventListener("change", function (ev) {
      var g = ev.target.getAttribute("data-grad");
      if (!g) return;
      activeGrad[g] = ev.target.checked;
      applyFilter();
    });
    $("#eea-btns").innerHTML = D.eeaList.map(function (e) {
      return '<button class="eea-btn" type="button" data-go="' + e.id + '">' + sw(e.gradiente) + esc(e.nombre) + "</button>";
    }).join("") + '<button class="eea-btn" type="button" data-go="__peru"><span class="muted">Ver todo el país</span></button>';
    $("#eea-btns").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-go]");
      if (!b) return;
      var id = b.getAttribute("data-go");
      if (id === "__peru") fitPeru(); else flyTo(id);
    });
    $("#lyr-parcelas").addEventListener("change", function () { vis(["parcelas-fill", "parcelas-line"], this.checked); });
    $("#lyr-limites").addEventListener("change", function () { vis(["dep-line"], this.checked); });
    $("#lyr-sat").addEventListener("change", function () { vis(["sat"], this.checked); });
  }
  function vis(ids, on) { if (!mapLoaded) return; ids.forEach(function (id) { map.setLayoutProperty(id, "visibility", on ? "visible" : "none"); }); }
  function applyFilter() {
    if (!mapLoaded) return;
    var act = Object.keys(activeGrad).filter(function (g) { return activeGrad[g]; });
    var f = ["in", ["get", "gradiente"], ["literal", act]];
    ["eeas", "parcelas-fill", "parcelas-line"].forEach(function (l) { map.setFilter(l, f); });
  }
  function fitPeru() { map.fitBounds([[-81.4, -18.4], [-68.6, -0.1]], { padding: 24, duration: 900 }); }
  function flyTo(id) {
    var e = U.eea(id);
    if (e && map) map.flyTo({ center: [e.lon, e.lat], zoom: 17, duration: 1600 });
  }
  function flyToEea(id) {
    pendingFly = id;
    if (location.hash === "#visor") showMap(); else location.hash = "visor";
  }

  function showMap() {
    if (typeof maplibregl === "undefined") {
      $("#map").innerHTML = '<p class="note" style="padding:20px">No se pudo cargar la librería del mapa.</p>';
      return;
    }
    if (!map) initMap();
    else {
      map.resize();
      if (pendingFly && mapLoaded) { flyTo(pendingFly); pendingFly = null; }
    }
  }

  function initMap() {
    buildSidebar();
    var c = mapColors();
    map = new maplibregl.Map({
      container: "map",
      attributionControl: { compact: true },
      bounds: [[-81.4, -18.4], [-68.6, -0.1]],
      fitBoundsOptions: { padding: 24 },
      style: {
        version: 8,
        sources: {
          sat: {
            type: "raster", tileSize: 256, maxzoom: 19,
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            attribution: "Imagen © Esri, Maxar, Earthstar Geographics"
          },
          dep: { type: "geojson", data: D.dep, attribution: "Límites: INEI" },
          parcelas: { type: "geojson", data: D.parcelas },
          eeas: { type: "geojson", data: D.eeas }
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": c.water } },
          { id: "dep-fill", type: "fill", source: "dep", paint: { "fill-color": c.land } },
          { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } },
          { id: "dep-line", type: "line", source: "dep", paint: { "line-color": c.muted, "line-width": 0.7, "line-opacity": 0.6 } },
          {
            id: "parcelas-fill", type: "fill", source: "parcelas", minzoom: 12,
            paint: { "fill-color": ["match", ["get", "tipo"], "Ensayo", c.ensayo, c.demo], "fill-opacity": 0.6 }
          },
          { id: "parcelas-line", type: "line", source: "parcelas", minzoom: 12, paint: { "line-color": c.fg, "line-width": 0.6, "line-opacity": 0.7 } },
          {
            id: "eeas", type: "circle", source: "eeas",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 7, 9, 10, 13, 6, 16, 0],
              "circle-color": gradExpr(c), "circle-stroke-color": c.bg, "circle-stroke-width": 2,
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 16, 0],
              "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 1, 16, 0]
            }
          }
        ]
      }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", function () {
      mapLoaded = true;
      applyFilter();
      if (pendingFly) { flyTo(pendingFly); pendingFly = null; }
    });
    map.on("error", function (ev) { if (ev && ev.sourceId === "sat") $("#sat-note").hidden = false; });
    map.on("click", "eeas", function (ev) {
      var e = U.eea(ev.features[0].properties.id);
      new maplibregl.Popup({ offset: 10 }).setLngLat([e.lon, e.lat]).setHTML(
        '<span class="tag">' + sw(e.gradiente) + GRAD[e.gradiente].nombre + "</span><h4>EEA " + esc(e.nombre) + '</h4><span class="muted">' +
        esc(e.ubicacion) + ", " + esc(e.departamento) + " · " + e.registros + ' registros</span><div class="popup-actions"><a href="#jardin/' + e.id +
        '">Memoria técnica</a><a href="#visor" data-zoom="' + e.id + '">Ver parcelas</a></div>').addTo(map);
    });
    $("#map").addEventListener("click", function (ev) {
      var a = ev.target.closest("[data-zoom]");
      if (!a) return;
      ev.preventDefault();
      flyTo(a.getAttribute("data-zoom"));
    });
    map.on("click", "parcelas-fill", function (ev) {
      var p = ev.features[0].properties;
      $("#parcela-info").innerHTML = '<strong class="mono">' + esc(p.codigo) + "</strong><dl><dt>Jardín</dt><dd>" + esc(p.eea_nombre) +
        "</dd><dt>Tipo</dt><dd>" + esc(p.tipo) + "</dd><dt>Especie</dt><dd>" + esc(p.especie) + '</dd><dt>Área</dt><dd class="num">' + fmt(p.area_m2) + " m²</dd>" +
        (p.ensayo && p.ensayo !== "null" ? '<dt>Ensayo</dt><dd><a href="#ensayos">Ver ensayo</a></dd>' : "") + "</dl>";
    });
    ["eeas", "parcelas-fill"].forEach(function (l) {
      map.on("mouseenter", l, function () { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", l, function () { map.getCanvas().style.cursor = ""; });
    });
  }

  function recolorMap() {
    if (!mapLoaded) return;
    var c = mapColors();
    map.setPaintProperty("bg", "background-color", c.water);
    map.setPaintProperty("dep-fill", "fill-color", c.land);
    map.setPaintProperty("dep-line", "line-color", c.muted);
    map.setPaintProperty("parcelas-fill", "fill-color", ["match", ["get", "tipo"], "Ensayo", c.ensayo, c.demo]);
    map.setPaintProperty("parcelas-line", "line-color", c.fg);
    map.setPaintProperty("eeas", "circle-color", gradExpr(c));
    map.setPaintProperty("eeas", "circle-stroke-color", c.bg);
  }
  if (window.matchMedia) {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", recolorMap);
  }
  new MutationObserver(recolorMap).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
