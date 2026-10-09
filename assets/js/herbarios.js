/* ==========================================================================
   Red JANO · Herbarios
   Cada herbario vive en su carpeta (ej. herbarios/vista-florida/):
     herbario.json   textos y datos generales del herbario
     ejemplares.csv  un ejemplar por fila (campos Darwin Core)
     especies.csv    una ficha por especie (descripción, hábito, origen…)
     candidatos.csv  especies registradas que aún no tienen rótulo
     img/            fotos: VF-002.jpg (grande) y VF-002-t.jpg (miniatura)
   La lista de herbarios de la red está en data/herbarios.json.
   Direcciones: #herbarios · #herbario/<eea> · #herbario/<eea>/ejemplares
                #herbario/<eea>/mapa · …/incorporar · …/curaduria · …/sp-<especie>
   ========================================================================== */
(function () {
  "use strict";
  var J = window.JANO, U = J.u, esc = U.esc, $ = U.$, D = J.D;
  var MES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  var ORIGINS = ["Nativa", "Introducida", "Pantropical", "Por verificar", "Por determinar"];
  var cache = {};       // herbarios ya cargados
  var F = {}, SORT = "img";
  var view = function () { return $("#herbarios-view"); };

  J.route("herbarios", { render: function () { return loadPublished().then(viewRed); } });
  J.route("herbario", {
    view: "herbarios", nav: "herbarios", fallback: "herbarios",
    render: function (a) {
      var reg = (D.herbarios || []).find(function (h) { return h.eea === a[0] && h.estado === "publicado"; });
      if (!reg) return false;
      return load(reg).then(function (H) {
        var t = a[1] || "especies";
        if (t.indexOf("sp-") === 0) { var sp = H.byId[t]; if (!sp) return false; viewFicha(H, sp); }
        else if (t === "ejemplares") viewEjemplares(H);
        else if (t === "mapa") viewMapa(H);
        else if (t === "incorporar") viewIncorporar(H);
        else if (t === "curaduria") viewCuraduria(H);
        else viewEspecies(H);
        return true;
      });
    }
  });

  /* ---------------- carga de un herbario ---------------- */
  function loadPublished() {
    return Promise.all((D.herbarios || []).filter(function (h) { return h.estado === "publicado"; }).map(load));
  }
  function load(reg) {
    if (cache[reg.eea]) return Promise.resolve(cache[reg.eea]);
    var base = reg.carpeta.replace(/\/?$/, "/");
    return Promise.all([
      J.loadJSON(base + "herbario.json"),
      J.loadCSV(base + "ejemplares.csv"),
      J.loadCSV(base + "especies.csv"),
      J.loadCSV(base + "candidatos.csv").catch(function () { return []; })
    ]).then(function (r) {
      var H = { reg: reg, base: base, meta: r[0] };
      var list = function (s) { return String(s || "").split("|").map(function (x) { return x.trim(); }).filter(Boolean); };
      H.specimens = r[1].map(function (x) {
        return {
          code: x.catalogNumber, taxon: x.taxonID, sci: x.scientificName, family: x.family, common: x.vernacularName,
          date: x.eventDate, collector: x.recordedBy, locality: x.locality, loc_text: x.verbatimLocality,
          lat: parseFloat(x.decimalLatitude), lon: parseFloat(x.decimalLongitude), utm: x.verbatimCoordinates,
          alt: x.minimumElevationInMeters, photos: list(x.associatedMedia), note: x.occurrenceRemarks,
          family_label: x.rotulo_familia, sci_label: x.rotulo_nombre
        };
      });
      H.spec = {};
      H.specimens.forEach(function (s) { H.spec[s.code] = s; });
      H.species = r[2].map(function (x) {
        return {
          id: x.taxonID, sci: x.scientificName, author: x.scientificNameAuthorship, family: x.family || "Por determinar",
          order: x.order, cls: x["class"], genus: x.genus, commons: list(x.vernacularName), habit: x.habito,
          origin: x.origen || "Por determinar", forage: x.interes_forrajero, desc: x.descripcion,
          specimens: H.specimens.filter(function (s) { return s.taxon === x.taxonID; }).map(function (s) { return s.code; })
        };
      }).filter(function (sp) { return sp.specimens.length; });
      H.species.sort(function (a, b) { return (a.sci ? 0 : 1) - (b.sci ? 0 : 1) || label(a).localeCompare(label(b)); });
      H.byId = {};
      H.species.forEach(function (sp) { H.byId[sp.id] = sp; });
      H.candidates = r[3];
      H.localities = uniq(H.specimens.map(function (s) { return s.locality; }));
      H.families = uniq(H.species.map(function (s) { return s.family; })).sort(function (a, b) {
        return a === "Por determinar" ? 1 : b === "Por determinar" ? -1 : a.localeCompare(b);
      });
      H.habits = uniq(H.species.map(function (s) { return s.habit; }).filter(Boolean)).sort();
      H.nDet = H.species.filter(function (s) { return s.sci; }).length;
      H.nFam = H.families.filter(function (f) { return f !== "Por determinar"; }).length;
      H.nPhoto = H.specimens.filter(function (s) { return s.photos.length; }).length;
      cache[reg.eea] = H;
      return H;
    });
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function label(sp) { return sp.sci || "Indeterminada " + sp.specimens.join(", "); }
  function photosOf(H, sp) { return [].concat.apply([], sp.specimens.map(function (c) { return H.spec[c].photos; })); }
  function thumbSrc(p) { return p.replace(/(\.[a-z]+)$/i, "-t$1"); }
  function fdate(d) {
    if (!d) return "—";
    var p = d.split("-");
    return parseInt(p[2], 10) + " " + J.MESES[parseInt(p[1], 10) - 1] + " " + p[0];
  }
  function originCls(o) { return { Nativa: "o-n", Introducida: "o-i", Pantropical: "o-p" }[o] || "o-v"; }
  function href(H, t) { return "#herbario/" + H.reg.eea + (t ? "/" + t : ""); }
  function eeaName(H) { var e = U.eea(H.reg.eea); return e ? e.nombre : H.reg.eea; }

  function leafSVG() {
    return '<svg viewBox="0 0 60 90" aria-hidden="true"><path d="M30 88V20" stroke="#6b7368" stroke-width="1.5" fill="none"/><path d="M30 40c-12-3-18-12-19-24 12 2 19 10 19 24zM30 55c11-3 17-11 18-22-11 2-18 9-18 22zM30 70c-9-2-14-8-15-17 9 1 15 7 15 17z" fill="#8a9585"/></svg>';
  }
  function thumb(H, sp) {
    var p = photosOf(H, sp)[0];
    if (p) return '<img src="' + esc(H.base + thumbSrc(p)) + '" data-full="' + esc(H.base + p) + '" onerror="this.onerror=null;this.src=this.dataset.full" alt="Ejemplar de herbario de ' + esc(label(sp)) + '" loading="lazy">';
    var s = H.spec[sp.specimens[0]];
    return '<div class="hb-sheet"><span class="hb-nophoto">Sin fotografía</span>' + leafSVG() + '<div class="hb-mini"><b>' + esc(s.code) + "</b> · " + esc(sp.family) +
      "<br><i>" + esc(sp.sci || "Indeterminada") + "</i></div></div>";
  }
  function chips(sp, withForage) {
    var h = '<span class="hb-chip ' + originCls(sp.origin) + '">' + esc(sp.origin) + "</span>";
    if (sp.habit) h += '<span class="hb-chip hab">' + esc(sp.habit) + "</span>";
    if (withForage && sp.forage) h += '<span class="hb-chip f">Forraje: ' + esc(sp.forage.toLowerCase()) + "</span>";
    return '<div class="hb-chips">' + h + "</div>";
  }

  /* ---------------- encabezado y pestañas ---------------- */
  function header(H) {
    var m = H.meta;
    return '<nav class="hb-crumbs"><a href="#herbarios">Herbarios</a><span>›</span><span>EEA ' + esc(eeaName(H)) + "</span></nav>" +
      '<p class="eyebrow">Herbario ' + esc(m.codigo) + " · " + esc(m.institucion) + " · " + esc(m.distrito) + ", " + esc(m.region) + "</p>" +
      "<h1>" + esc(m.titulo) + '</h1><p class="hb-lede">' + esc(m.presentacion) + "</p>" +
      (m.aviso ? '<p class="hb-note">' + esc(m.aviso) + "</p>" : "") +
      '<div class="hb-stats">' +
      [[H.specimens.length, "ejemplares"], [H.nDet, "taxones determinados"], [H.nFam, "familias"], [H.localities.length, "localidades de colecta"], [H.nPhoto, "con imagen digital"]]
        .map(function (x) { return '<div class="hb-stat"><b>' + x[0] + "</b><span>" + x[1] + "</span></div>"; }).join("") + "</div>";
  }
  function tabs(H, on) {
    var T = [["especies", "Especies", H.species.length], ["ejemplares", "Ejemplares", H.specimens.length], ["mapa", "Mapa", H.localities.length],
      ["incorporar", "Por incorporar", H.candidates.length], ["curaduria", "Curaduría", H.specimens.filter(function (s) { return s.note; }).length]];
    return '<nav class="hb-tabs" aria-label="Secciones del herbario">' + T.map(function (t) {
      return '<a href="' + href(H, t[0]) + '" class="' + (t[0] === on ? "on" : "") + '">' + t[1] + '<span class="n">' + t[2] + "</span></a>";
    }).join("") + "</nav>";
  }
  function opt(v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(l) + "</option>"; }

  /* ---------------- especies ---------------- */
  function viewEspecies(H) {
    var f = F[H.reg.eea] = F[H.reg.eea] || { q: "", fam: "", loc: "", hab: "", ori: "", photo: false };
    var v = view();
    v.innerHTML = '<div>' + header(H) + tabs(H, "especies") +
      '<div class="hb-filters" role="search">' +
      '<input type="search" id="hb-q" placeholder="Buscar por nombre científico, común o código (' + esc(H.meta.codigo) + '-012)" value="' + esc(f.q) + '" aria-label="Buscar">' +
      '<select id="hb-fam" aria-label="Familia">' + opt("", "Todas las familias", f.fam) + H.families.map(function (x) { return opt(x, x, f.fam); }).join("") + "</select>" +
      '<select id="hb-loc" aria-label="Localidad">' + opt("", "Todas las localidades", f.loc) + H.localities.map(function (x) { return opt(x, x, f.loc); }).join("") + "</select>" +
      '<select id="hb-hab" aria-label="Hábito">' + opt("", "Todo hábito", f.hab) + H.habits.map(function (x) { return opt(x, x, f.hab); }).join("") + "</select>" +
      '<select id="hb-ori" aria-label="Origen">' + opt("", "Todo origen", f.ori) + ORIGINS.map(function (x) { return opt(x, x, f.ori); }).join("") + "</select>" +
      '<select id="hb-sort" aria-label="Ordenar">' + opt("img", "Con imagen primero", SORT) + opt("az", "Orden alfabético", SORT) + opt("fam", "Por familia", SORT) + "</select>" +
      '<label><input type="checkbox" id="hb-ph"' + (f.photo ? " checked" : "") + "> Solo con imagen</label></div>" +
      '<div class="hb-count" id="hb-cnt"></div><div class="hb-grid" id="hb-grid"></div></div>';
    var upd = function () {
      f.q = $("#hb-q").value.trim().toLowerCase(); f.fam = $("#hb-fam").value; f.loc = $("#hb-loc").value;
      f.hab = $("#hb-hab").value; f.ori = $("#hb-ori").value; f.photo = $("#hb-ph").checked; SORT = $("#hb-sort").value;
      var L = H.species.filter(function (sp) {
        var sx = sp.specimens.map(function (c) { return H.spec[c]; });
        if (f.fam && sp.family !== f.fam) return false;
        if (f.loc && !sx.some(function (s) { return s.locality === f.loc; })) return false;
        if (f.hab && sp.habit !== f.hab) return false;
        if (f.ori && sp.origin !== f.ori) return false;
        if (f.photo && !photosOf(H, sp).length) return false;
        if (f.q) {
          var hay = [sp.sci, sp.family].concat(sp.commons, sp.specimens).join(" ").toLowerCase();
          if (hay.indexOf(f.q) < 0) return false;
        }
        return true;
      });
      if (SORT === "img") L.sort(function (a, b) { return (photosOf(H, b).length ? 1 : 0) - (photosOf(H, a).length ? 1 : 0); });
      if (SORT === "fam") L.sort(function (a, b) { return a.family.localeCompare(b.family) || label(a).localeCompare(label(b)); });
      var active = f.q || f.fam || f.loc || f.hab || f.ori || f.photo;
      $("#hb-cnt").innerHTML = L.length + " de " + H.species.length + " taxones" + (active ? ' · <button type="button" id="hb-clr">Quitar filtros</button>' : "");
      if (active) $("#hb-clr").onclick = function () { F[H.reg.eea] = null; viewEspecies(H); };
      $("#hb-grid").innerHTML = L.length ? L.map(function (sp) {
        return '<a class="hb-card" href="' + href(H, sp.id) + '"><div class="hb-ph">' + thumb(H, sp) +
          (sp.specimens.length > 1 ? '<span class="hb-cnt">' + sp.specimens.length + " ejemplares</span>" : "") + "</div>" +
          '<div class="hb-bd"><span class="hb-fm">' + esc(sp.family) + '</span><span class="hb-nm">' + esc(sp.sci || "Indeterminada") +
          (sp.author ? ' <span class="hb-au">' + esc(sp.author) + "</span>" : "") + '</span><span class="hb-cm">' +
          esc(sp.commons.join(", ") || sp.specimens.join(", ")) + "</span>" + chips(sp, true) + "</div></a>";
      }).join("") : '<p class="hb-lede">Ningún taxón coincide con estos filtros.</p>';
    };
    ["hb-q", "hb-fam", "hb-loc", "hb-hab", "hb-ori", "hb-ph", "hb-sort"].forEach(function (id) { $("#" + id).addEventListener("input", upd); });
    upd();
  }

  /* ---------------- ejemplares ---------------- */
  function viewEjemplares(H) {
    var rows = H.specimens.slice().sort(function (a, b) { return a.code.localeCompare(b.code); });
    view().innerHTML = "<div>" + header(H) + tabs(H, "ejemplares") +
      '<div class="hb-tbl"><table><thead><tr><th>Código</th><th>Taxón</th><th>Familia</th><th>Nombre común</th><th>Localidad</th><th class="r">Altitud</th><th>Fecha</th><th>Colector</th><th>Imagen</th></tr></thead><tbody>' +
      rows.map(function (s) {
        var sp = H.byId[s.taxon];
        return '<tr class="lk" data-go="' + href(H, s.taxon) + '" tabindex="0"><td class="mono">' + esc(s.code) + '</td><td class="sci">' + esc(s.sci || "Indeterminada") +
          "</td><td>" + esc(sp ? sp.family : s.family) + "</td><td>" + esc(s.common) + "</td><td>" + esc(s.locality) + '</td><td class="r mono">' + esc(s.alt) + " m</td>" +
          '<td class="mono" style="white-space:nowrap">' + fdate(s.date) + "</td><td>" + esc(s.collector) + "</td><td>" + (s.photos.length ? "Sí" : "—") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="hb-note">Fuente: <a href="' + esc(H.base) + 'ejemplares.csv">ejemplares.csv</a> en formato Darwin Core, listo para compartir con GBIF.</p></div>';
    U.$$("tr.lk", view()).forEach(function (tr) {
      var go = function () { location.hash = tr.getAttribute("data-go"); };
      tr.onclick = go;
      tr.onkeydown = function (e) { if (e.key === "Enter") go(); };
    });
  }

  /* ---------------- mapa de colecta (SVG) ---------------- */
  function groups(H) {
    var g = {};
    H.specimens.forEach(function (s) { if (!isNaN(s.lat)) (g[s.locality] = g[s.locality] || []).push(s); });
    return g;
  }
  function mapSVG(H, highlight, w, h, compact) {
    var refs = H.meta.referencias_mapa || [];
    var lats = H.specimens.map(function (s) { return s.lat; }).concat(refs.map(function (r) { return r[1]; })).filter(function (x) { return !isNaN(x); });
    var lons = H.specimens.map(function (s) { return s.lon; }).concat(refs.map(function (r) { return r[2]; })).filter(function (x) { return !isNaN(x); });
    var B = { lonMin: Math.min.apply(null, lons) - 0.12, lonMax: Math.max.apply(null, lons) + 0.12, latMin: Math.min.apply(null, lats) - 0.12, latMax: Math.max.apply(null, lats) + 0.12 };
    var pad = { l: 60, r: 150, t: 24, b: 30 };
    var k = Math.min((w - pad.l - pad.r) / (B.lonMax - B.lonMin), (h - pad.t - pad.b) / (B.latMax - B.latMin));
    var X = function (lon) { return pad.l + (lon - B.lonMin) * k; }, Y = function (lat) { return pad.t + (B.latMax - lat) * k; };
    var Hh = pad.t + (B.latMax - B.latMin) * k + pad.b, W = pad.l + (B.lonMax - B.lonMin) * k + pad.r;
    var step = 0.25, s = "";
    for (var lon = Math.ceil(B.lonMin / step) * step; lon <= B.lonMax; lon += step)
      s += '<line class="gl" x1="' + X(lon) + '" x2="' + X(lon) + '" y1="' + pad.t + '" y2="' + (Hh - pad.b) + '"/><text class="gt" x="' + X(lon) + '" y="' + (Hh - 10) + '" text-anchor="middle">' + Math.abs(lon).toFixed(2) + "°O</text>";
    for (var lat = Math.ceil(B.latMin / step) * step; lat <= B.latMax; lat += step)
      s += '<line class="gl" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + Y(lat) + '" y2="' + Y(lat) + '"/><text class="gt" x="' + (pad.l - 6) + '" y="' + (Y(lat) + 4) + '" text-anchor="end">' + Math.abs(lat).toFixed(2) + "°S</text>";
    refs.forEach(function (r) {
      var left = r[3] === "izquierda";
      s += '<rect class="ref" x="' + (X(r[2]) - 4) + '" y="' + (Y(r[1]) - 4) + '" width="8" height="8"/><text class="reft" x="' + (X(r[2]) + (left ? -9 : 9)) + '" y="' + (Y(r[1]) + 15) + '" text-anchor="' + (left ? "end" : "start") + '">' + esc(r[0]) + "</text>";
    });
    var lefts = H.meta.localidades_etiqueta_izquierda || [];
    var G = groups(H);
    Object.keys(G).forEach(function (loc) {
      var ss = G[loc];
      var la = U.mean(ss.map(function (x) { return x.lat; })), lo = U.mean(ss.map(function (x) { return x.lon; }));
      var hit = !highlight || ss.some(function (x) { return highlight.indexOf(x.code) >= 0; });
      var r = 5 + Math.sqrt(ss.length) * 3.2, left = lefts.indexOf(loc) >= 0;
      var n = highlight ? ss.filter(function (x) { return highlight.indexOf(x.code) >= 0; }).length : ss.length;
      var tx = X(lo) + (left ? -(r + 8) : r + 8), an = left ? "end" : "start";
      s += '<g><circle class="' + (hit ? "pt" : "dim") + '" data-loc="' + esc(loc) + '" cx="' + X(lo) + '" cy="' + Y(la) + '" r="' + r + '"><title>' + esc(loc) + ": " + ss.length + " ejemplares</title></circle>";
      if (hit || !compact) s += '<text class="lb" x="' + tx + '" y="' + (Y(la) + 2) + '" text-anchor="' + an + '">' + esc(loc.split(",")[0]) + '</text><text class="lb2" x="' + tx + '" y="' + (Y(la) + 17) + '" text-anchor="' + an + '">' + n + " ejempl. · " + esc(ss[0].alt) + " m</text>";
      s += "</g>";
    });
    return '<svg viewBox="0 0 ' + W.toFixed(0) + " " + Hh.toFixed(0) + '" role="img" aria-label="Mapa de localidades de colecta">' + s + "</svg>";
  }

  function viewMapa(H) {
    var G = groups(H);
    view().innerHTML = "<div>" + header(H) + tabs(H, "mapa") +
      '<div class="hb-mapbox"><div class="hb-map">' + mapSVG(H, null, 640, 600, false) + "</div><div>" +
      '<h3 class="hb-h3">Localidades de colecta</h3><div class="hb-loclist">' +
      Object.keys(G).sort(function (a, b) { return G[b].length - G[a].length; }).map(function (loc) {
        var ss = G[loc];
        return '<button type="button" class="hb-loc" data-loc="' + esc(loc) + '"><b>' + esc(loc) + "</b><span>" + esc(ss[0].alt) + " m s. n. m. · " +
          esc(uniq(ss.map(function (x) { return x.collector; })).join(", ")) + '</span><span class="mono">' + ss.length + "</span></button>";
      }).join("") + "</div>" +
      '<p class="hb-note">Elige una localidad para ver sus especies. Coordenadas UTM 17S convertidas a WGS 84 geográficas.</p></div></div></div>';
    U.$$("[data-loc]", view()).forEach(function (el) {
      el.addEventListener("click", function () {
        F[H.reg.eea] = { q: "", fam: "", loc: el.getAttribute("data-loc"), hab: "", ori: "", photo: false };
        location.hash = href(H);
      });
    });
  }

  /* ---------------- por incorporar ---------------- */
  function viewIncorporar(H) {
    var a = H.meta.avance || {};
    var B = [["Colectadas e identificadas", a.colectadas], ["Viables para el herbario", a.viables], ["Prensadas y secadas", a.prensadas],
      ["Con rótulo", a.rotuladas], ["Montadas en cartulina", a.montadas], ["Fotografiadas", H.nPhoto]].filter(function (b) { return b[1] != null; });
    var max = Math.max.apply(null, B.map(function (b) { return b[1]; }));
    view().innerHTML = "<div>" + header(H) + tabs(H, "incorporar") +
      "<h2>Avance de la colección</h2>" +
      '<p class="hb-lede" style="margin-bottom:16px">Según el reporte de avance' + (a.fecha ? " del " + fdate(a.fecha) : "") + " y la hoja de rótulos. Todas las barras usan la misma escala.</p>" +
      '<div class="hb-bars">' + B.map(function (b) {
        return '<div class="hb-bar"><span>' + b[0] + '</span><div class="tr"><div class="fl" style="width:' + (b[1] / max * 100).toFixed(1) + '%"></div></div><span class="v">' + b[1] + "</span></div>";
      }).join("") + "</div>" +
      '<h2 class="hb-sec-gap">Especies registradas aún sin rótulo</h2>' +
      '<p class="hb-lede" style="margin-bottom:16px">Son la siguiente tanda para montar, rotular y fotografiar.</p>' +
      '<div class="hb-tbl"><table><thead><tr><th>Especie</th><th>Familia</th><th>Nombre común</th><th>Hábito</th><th>Condición</th><th>Nota</th></tr></thead><tbody>' +
      H.candidates.map(function (c) {
        return '<tr><td class="sci">' + esc(c.scientificName) + "</td><td>" + esc(c.family) + "</td><td>" + esc(c.vernacularName) + "</td><td>" + esc(c.habito) +
          "</td><td>" + esc(c.condicion) + '</td><td style="min-width:220px">' + esc(c.nota) + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
  }

  /* ---------------- curaduría ---------------- */
  function viewCuraduria(H) {
    var L = H.specimens.filter(function (s) { return s.note; }).sort(function (a, b) { return a.code.localeCompare(b.code); });
    view().innerHTML = "<div>" + header(H) + tabs(H, "curaduria") +
      "<h2>Observaciones de curaduría</h2>" +
      '<p class="hb-lede" style="margin-bottom:16px">Inconsistencias detectadas al consolidar los rótulos con el reporte de avance. Conviene resolverlas antes de la publicación oficial.</p>' +
      '<div class="hb-issues">' + L.map(function (s) {
        return '<div class="hb-issue"><a href="' + href(H, s.taxon) + '">' + esc(s.code) + "</a><p><i>" + esc(s.sci || "Indeterminada") + "</i> · " + esc(s.note) + "</p></div>";
      }).join("") + (H.meta.observaciones_generales || []).map(function (t) {
        return '<div class="hb-issue"><span class="mono">General</span><p>' + esc(t) + "</p></div>";
      }).join("") + "</div></div>";
  }

  /* ---------------- ficha de especie ---------------- */
  function viewFicha(H, sp) {
    var i = H.species.indexOf(sp), prev = H.species[(i - 1 + H.species.length) % H.species.length], next = H.species[(i + 1) % H.species.length];
    var sx = sp.specimens.map(function (c) { return H.spec[c]; });
    var photos = photosOf(H, sp);
    var months = sx.map(function (s) { return parseInt((s.date || "").slice(5, 7), 10) - 1; });
    var q = encodeURIComponent(sp.sci || "");
    var levels = { Bajo: 1, Medio: 2, Alto: 3 };
    var url = U.baseUrl() + href(H, sp.id);
    var today = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
    var year = (sx[0].date || "").slice(0, 4);
    var cite = H.meta.nombre + " (" + year + "). " + (sp.sci || "Indeterminada") + (sp.author ? " " + sp.author : "") + " [" + sp.specimens.join(", ") +
      "]. Herbarios de la Red JANO, PROCAP–INIA. " + url + " (consultado el " + today + ").";
    var hd = (H.meta.rotulo_encabezado || []).map(esc).join("<br>");
    var name = esc(sp.sci || "Indeterminada");
    view().innerHTML =
      '<nav class="hb-crumbs"><a href="#herbarios">Herbarios</a><span>›</span><a href="' + href(H) + '">EEA ' + esc(eeaName(H)) + "</a><span>›</span><span>" + esc(sp.family) +
      '</span><span>›</span><span class="sci">' + name + "</span></nav>" +
      '<div class="hb-ficha"><div class="hb-gal">' +
      (photos.length
        ? '<button type="button" class="hb-main" id="hb-gmain" aria-label="Ampliar imagen"><img id="hb-gimg" src="' + esc(H.base + photos[0]) + '" alt="Ejemplar de herbario de ' + name + '"></button>' +
          (photos.length > 1 ? '<div class="hb-thumbs">' + photos.map(function (p, k) {
            return '<button type="button" data-p="' + esc(H.base + p) + '" class="' + (k ? "" : "on") + '" aria-label="Imagen ' + (k + 1) + '"><img src="' + esc(H.base + thumbSrc(p)) + '" alt=""></button>';
          }).join("") + "</div>" : "") +
          '<div class="hb-cap">Ejemplar montado · toca la imagen para ampliarla</div>'
        : '<div class="hb-main nozoom">' + thumb(H, sp) + '</div><div class="hb-cap">Ejemplar montado aún sin fotografía digital.</div>') +
      "</div><div>" +
      '<div class="hb-ttl"><div class="hb-fm">' + esc(sp.family) + "</div><h1>" + name + (sp.author ? '<span class="hb-au">' + esc(sp.author) + "</span>" : "") + "</h1>" +
      '<p class="hb-vn">' + (sp.commons.length ? esc(sp.commons.map(function (c) { return "“" + c + "”"; }).join(" · ")) : "Sin nombre común registrado") + "</p>" + chips(sp, false) + "</div>" +
      '<nav class="hb-anchors"><a href="#" data-to="hb-desc">Descripción</a><a href="#" data-to="hb-tax">Taxonomía</a><a href="#" data-to="hb-ej">Ejemplares (' + sx.length +
      ')</a><a href="#" data-to="hb-dist">Distribución</a><a href="#" data-to="hb-ref">Enlaces y cita</a></nav>' +

      '<section class="hb-sec" id="hb-desc"><h3 class="hb-h3">Descripción</h3><p>' + esc(sp.desc) + "</p>" +
      '<div class="hb-forage"><span class="hb-lv">' + [1, 2, 3].map(function (k) { return '<i class="' + (sp.forage && levels[sp.forage] >= k ? "on" : "") + '"></i>'; }).join("") +
      "</span><span><b>Interés forrajero para caprinos:</b> " + (sp.forage ? esc(sp.forage.toLowerCase()) : "por documentar") + ' <span class="muted">· valoración preliminar</span></span></div>' +
      sx.filter(function (s) { return s.note; }).map(function (s) { return '<div class="hb-callout"><b>Nota de curaduría (' + esc(s.code) + ").</b> " + esc(s.note) + "</div>"; }).join("") +
      "</section>" +

      '<section class="hb-sec" id="hb-tax"><h3 class="hb-h3">Taxonomía</h3><dl class="hb-kv">' +
      "<dt>Reino</dt><dd>Plantae</dd><dt>Filo</dt><dd>Tracheophyta</dd><dt>Clase</dt><dd>" + esc(sp.cls || "—") + "</dd><dt>Orden</dt><dd>" + esc(sp.order || "—") +
      "</dd><dt>Familia</dt><dd>" + esc(sp.family) + '</dd><dt>Género</dt><dd class="i">' + esc(sp.genus || "—") + '</dd><dt>Especie</dt><dd class="i">' + esc(sp.sci || "—") +
      "</dd><dt>Autoría</dt><dd>" + esc(sp.author || "Por verificar") + "</dd><dt>Origen en Perú</dt><dd>" + esc(sp.origin) + "</dd><dt>Hábito</dt><dd>" + esc(sp.habit || "—") + "</dd></dl></section>" +

      '<section class="hb-sec" id="hb-ej"><h3 class="hb-h3">Ejemplares de herbario</h3><div class="hb-vouchers">' + sx.map(function (s) {
        return '<div class="hb-voucher"><div class="hb-label" aria-label="Rótulo del ejemplar ' + esc(s.code) + '"><div class="hd">' + hd + "</div>" +
          '<div class="row"><b>' + esc(s.family_label || s.family || sp.family) + "</b><i>" + esc(s.sci_label || s.sci || "…") + "</i></div>" +
          "<p>“" + esc(s.common || "…") + "”</p><p>" + esc(s.loc_text) + "</p><p>UTM: WGS 84 " + esc(s.utm) + "</p><p>Colector: " + esc(s.collector) + "</p>" +
          '<div class="ft"><div><b>COD: ' + esc(s.code) + "</b><br>" + fdate(s.date) + '</div><div class="hb-qr" title="Enlace a esta ficha">' + U.qrSvg(url) + "</div></div></div>" +
          '<dl class="hb-kv"><dt>Código</dt><dd class="mono">' + esc(s.code) + "</dd><dt>Fecha de colecta</dt><dd>" + fdate(s.date) + "</dd><dt>Localidad</dt><dd>" + esc(s.locality) +
          "</dd><dt>Altitud</dt><dd>" + esc(s.alt) + ' m s. n. m.</dd><dt>Lat / Long</dt><dd class="mono">' + (isNaN(s.lat) ? "—" : s.lat.toFixed(5) + ", " + s.lon.toFixed(5)) +
          "</dd><dt>Colector</dt><dd>" + esc(s.collector) + "</dd><dt>Imagen</dt><dd>" + (s.photos.length ? s.photos.length + " fotografía" + (s.photos.length > 1 ? "s" : "") : "Pendiente") + "</dd></dl></div>";
      }).join("") + '</div><p class="hb-note">El código QR del rótulo físico enlaza con esta ficha: <span class="mono">' + esc(url) + "</span></p></section>" +

      '<section class="hb-sec" id="hb-dist"><h3 class="hb-h3">Distribución en la colección</h3><div class="hb-mapbox" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)">' +
      '<div class="hb-map">' + mapSVG(H, sp.specimens, 520, 480, true) + '</div><div><h3 class="hb-h3">Meses de colecta</h3><div class="hb-months">' +
      MES.map(function (m, k) { return '<div class="' + (months.indexOf(k) >= 0 ? "on" : "") + '"><i></i>' + m + "</div>"; }).join("") +
      '</div><p class="hb-note">Con más colectas a lo largo del año, esta franja mostrará la fenología de floración y fructificación observada.</p></div></div></section>' +

      '<section class="hb-sec" id="hb-ref"><h3 class="hb-h3">Enlaces externos</h3>' +
      (sp.sci ? '<div class="hb-links"><a href="https://www.gbif.org/species/search?q=' + q + '" target="_blank" rel="noopener">GBIF ↗</a>' +
        '<a href="https://www.inaturalist.org/taxa/search?q=' + q + '" target="_blank" rel="noopener">iNaturalist ↗</a>' +
        '<a href="https://www.tropicos.org/name/Search?name=' + q + '" target="_blank" rel="noopener">Tropicos ↗</a>' +
        '<a href="https://powo.science.kew.org/results?q=' + q + '" target="_blank" rel="noopener">Plants of the World Online ↗</a></div>'
        : "<p>Disponibles cuando el ejemplar esté determinado.</p>") +
      '<h3 class="hb-h3" style="margin-top:12px">Cómo citar esta ficha</h3><div class="hb-cite"><code id="hb-cite">' + esc(cite) + '</code><button class="btn ghost" type="button" id="hb-cp">Copiar</button></div></section>' +

      '<nav class="hb-pn"><a href="' + href(H, prev.id) + '">← Anterior<span>' + esc(prev.sci || "Indeterminada") + '</span></a><a href="' + href(H, next.id) +
      '" style="text-align:right">Siguiente →<span>' + esc(next.sci || "Indeterminada") + "</span></a></nav></div></div>";

    var v = view();
    U.$$(".hb-anchors a", v).forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); document.getElementById(a.getAttribute("data-to")).scrollIntoView({ behavior: "smooth", block: "start" }); };
    });
    var gm = $("#hb-gmain");
    if (gm) {
      gm.onclick = function () {
        var img = $("#hb-gimg"), lb = $("#lightbox");
        $("#lightbox-img").src = img.src; $("#lightbox-img").alt = img.alt;
        if (lb.showModal) lb.showModal();
      };
      U.$$(".hb-thumbs button", v).forEach(function (b) {
        b.onclick = function () {
          $("#hb-gimg").src = b.getAttribute("data-p");
          U.$$(".hb-thumbs button", v).forEach(function (x) { x.classList.toggle("on", x === b); });
        };
      });
    }
    $("#hb-cp").onclick = function () { U.copy(this, cite, $("#hb-cite")); };
  }

  /* ---------------- red de herbarios ---------------- */
  function viewRed() {
    var list = (D.herbarios || []).map(function (h) { return { h: h, e: U.eea(h.eea) }; }).filter(function (o) { return o.e; });
    view().innerHTML = "<div>" +
      '<p class="eyebrow">Red JANO · Jardines Agrostológicos como Nodos de Observación</p>' +
      "<h1>Herbarios de las Estaciones Experimentales</h1>" +
      '<p class="hb-lede">Cada EEA de la red documenta la flora silvestre y forrajera de su gradiente ecológica: bosque seco, costa árida, trópico húmedo y Andes. Las colecciones comparten un mismo formato de ficha y de registro, de modo que pueden consultarse juntas y exportarse a GBIF.</p>' +
      '<div class="hb-eeas">' + list.map(function (o) {
        var pub = o.h.estado === "publicado", H = cache[o.h.eea];
        var tag = pub ? "a" : "div";
        return "<" + tag + (pub ? ' href="#herbario/' + o.h.eea + '"' : "") + ' class="hb-eea' + (pub ? " pub" : "") + '">' +
          '<div class="t"><h2>EEA ' + esc(o.e.nombre.replace(/ \(.*\)/, "")) + '</h2><span class="hb-st ' + (pub ? "pub" : "prep") + '">' + (pub ? "Publicado" : "En preparación") + "</span></div>" +
          '<span class="tag">' + U.sw(o.e.gradiente) + J.GRAD[o.e.gradiente].nombre + " · " + esc(o.e.departamento) + "</span>" +
          '<div class="ft">' + (pub && H ? "<span>" + H.specimens.length + " ejemplares · " + H.nDet + ' taxones</span><span style="color:var(--accent);font-weight:600">Ver catálogo →</span>'
            : "<span>Colecta y montaje pendientes</span><span></span>") + "</div></" + tag + ">";
      }).join("") + "</div>" +
      '<div class="hb-two"><div><h2>Cómo se digitaliza un herbario</h2><ol class="hb-steps">' +
      "<li><b>Colecta</b>Ejemplar fértil, coordenadas GPS, altitud, colector y nombre local.</li>" +
      "<li><b>Prensado y secado</b>En papel periódico, con cambios hasta secar sin hongos.</li>" +
      "<li><b>Montaje y rótulo</b>Cartulina, mica y rótulo con código de la EEA y QR.</li>" +
      "<li><b>Fotografía</b>Fondo neutro, escala y luz pareja; una imagen por pliego.</li>" +
      "<li><b>Registro</b>Fila en la plantilla Darwin Core común a todas las EEAs.</li>" +
      "<li><b>Publicación</b>El sitio genera la ficha y el mapa a partir de ese registro.</li></ol></div>" +
      "<div><h2>Formato común de datos</h2>" +
      '<p class="hb-lede" style="margin-bottom:12px">Cada herbario se publica desde un archivo <span class="mono">ejemplares.csv</span> con campos del estándar Darwin Core. Así la ficha, el catálogo y el mapa se generan solos, y la colección queda lista para compartirse con GBIF.</p>' +
      '<div class="hb-tbl"><table><thead><tr><th>Campo</th><th>Ejemplo (Vista Florida)</th></tr></thead><tbody>' +
      [["catalogNumber", "VF-002"], ["scientificName", "<i>Cordia lutea</i>"], ["family", "Boraginaceae"], ["vernacularName", "Flor de overo"], ["eventDate", "2025-09-02"],
        ["decimalLatitude / Longitude", "-6.72721, -79.78079"], ["associatedMedia", "img/VF-002.jpg"]].map(function (r) {
        return '<tr><td class="mono">' + r[0] + "</td><td>" + r[1] + "</td></tr>";
      }).join("") + "</tbody></table></div></div></div>" +
      "</div>";
  }

  /* cerrar visor de imagen */
  document.addEventListener("click", function (e) {
    var lb = $("#lightbox");
    if (!lb) return;
    if (e.target === lb || e.target.closest("#lightbox .x")) lb.close();
  });
})();
