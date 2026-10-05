# Red JANO — sitio web (demo)

Sitio estático de la Red JANO (Jardines Agrostológicos como Nodos de Observación), componente forrajero del Proyecto Caprino PROCAP — INIA.

> **Demo.** Las cifras del inventario 2026 son reales. Las coordenadas de las EEAs son referenciales; las parcelas, la asignación de especies por jardín y las series NDVI son ilustrativas.

## Estructura

```
index.html                 Página completa (navegación por secciones con #)
.nojekyll                  Evita que GitHub Pages procese el sitio con Jekyll
data/
  eeas.geojson             Estaciones (punto, gradiente, registros, estado de memoria)
  parcelas.geojson         Polígonos de parcelas demostrativas y ensayos
  departamentos.geojson    Límites departamentales (contexto del mapa)
  especies.json            Catálogo de especies (fichas y QR)
  ensayos.json             Ensayos y protocolos
  ndvi_simulado.json       Serie NDVI mensual (reemplazar por exportación GEE)
  resumen.json             Cifras del inventario consolidado
```

Para actualizar el sitio se editan los archivos de `data/`; las páginas se generan solas a partir de ellos.

## Publicar en GitHub Pages

1. Crea una organización en GitHub para el proyecto (por ejemplo `red-jano`) y dentro un repositorio público llamado `red-jano.github.io`.
2. Sube todo el contenido de esta carpeta a la rama `main`.
3. En el repositorio: **Settings → Pages → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. En uno o dos minutos el sitio queda en `https://red-jano.github.io/`.

## Probar en tu computadora

El sitio lee los datos con `fetch`, así que no funciona abriendo `index.html` con doble clic. Desde esta carpeta:

```
python -m http.server 8000
```

y abre `http://localhost:8000`.

## Reemplazar datos de ejemplo por datos reales

- **Parcelas:** exporta desde QGIS a GeoJSON (EPSG:4326) con los campos `eea`, `codigo`, `tipo` ("Parcela demostrativa" o "Ensayo"), `especie`, `area_m2` y `ensayo` (id del ensayo o vacío).
- **EEAs:** corrige las coordenadas en `eeas.geojson`.
- **NDVI:** reemplaza `ndvi_simulado.json` por la exportación de Earth Engine (mismo formato: `meses` y `series` por id de EEA).
- **App de Earth Engine:** pega su URL pública en la variable `GEE_APP_URL` al inicio del script de `index.html`.
