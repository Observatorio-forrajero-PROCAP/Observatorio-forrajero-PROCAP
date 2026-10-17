# Registro de cambios

Cada mejora queda anotada aquí con la referencia que la inspiró, para saber de dónde salió cada idea.

## Octubre 2026 · versión 0.4
- Nueva sección **Suelos**: diagnóstico suelo–forraje en cuatro pasos (sitio, perfil y color, fertilidad, uso forrajero). Nace de la calicata interpretativa del jardín de la EEA Vista Florida (10/09/2025) y de la plataforma interactiva preparada a partir de ella.
  - Mapa MapLibre con imagen satelital, distritos de Lambayeque y estaciones de la red; consulta SoilGrids en vivo en el punto elegido, con respaldo en 13 perfiles de referencia.
  - Color Munsell de cada horizonte medido desde la foto (ΔE2000), con corrección de balance de blancos y lectura del GPS de la foto.
  - Aptitud de 24 especies forrajeras, enlazadas a sus fichas del catálogo cuando existen, con escenarios de manejo y exportación en JSON, CSV y SVG.
  - Mapa nacional de fertilidad del INIA incrustado.
  - Lectura de la foto con IA opcional, mediante un servicio en Cloudflare (`herramientas/ia-suelos/`).
- Nuevo color de estado `--crit` (limitante) en `base.css`.

## Octubre 2026 · versión 0.3.2
- Interruptor de modo claro / oscuro en la barra superior. El sitio abre en modo claro y recuerda la elección de cada visitante en su navegador.

## Octubre 2026 · versión 0.3.1
- Fondo claro fijo en todo el sitio, también en dispositivos con modo oscuro. El relato NDVI de Monitoreo pasa a fondo claro.

## Octubre 2026 · versión 0.3
- **Fusión** del sitio de jardines agrostológicos y del demo de herbarios en un solo sitio, con un menú, un diseño y una navegación comunes.
- **Herbarios** pasan de datos incrustados en el HTML a archivos editables: `ejemplares.csv` (Darwin Core), `especies.csv`, `candidatos.csv` y `herbario.json`. Cada estación tendrá su propia carpeta en `herbarios/`.
- Las memorias técnicas y la tabla de inicio enlazan con el herbario de cada estación.
- **Monitoreo** reorganizado según la referencia *Berlin in Green* (klauswiese.github.io/ndvi, hecha con Quarto + Closeread):
  - "La temporada en un solo cuadro": todos los jardines por mes y la mediana de la red.
  - Relato mes a mes con el mapa fijo y una escala de color común; los textos están en `data/relato_ndvi.json`.
  - Sección "Cómo se hizo" con la cadena Sentinel-2 → Earth Engine → CSV → GitHub Pages.
- Configuración central en `data/sitio.json` (dirección pública para los QR y App de Earth Engine).

## Octubre 2026 · versiones anteriores
- 0.2 · Demo de herbarios con los datos de la EEA Vista Florida.
- 0.1 · Demo del sitio de la Red JANO: inicio, visor MapLibre, memorias, ensayos, catálogo con QR y monitoreo.
