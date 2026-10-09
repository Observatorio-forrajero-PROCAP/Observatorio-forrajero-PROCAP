# Red JANO — sitio web

Sitio estático de la **Red JANO** (Jardines Agrostológicos como Nodos de Observación), componente forrajero del Proyecto Caprino PROCAP (CUI 2506684) — INIA. Reúne en un solo sitio el visor de parcelas, las memorias técnicas de los jardines, los ensayos, el catálogo de especies forrajeras, el monitoreo satelital y los **herbarios** de las estaciones.

No necesita instalar nada ni compilar: GitHub Pages publica los archivos tal como están. Cada cambio que guardes en el repositorio aparece en la web en uno o dos minutos.

> **Versión de demostración.** Las cifras del inventario 2026 y los datos del herbario de Vista Florida son reales. Las coordenadas de las EEAs son referenciales; las parcelas, la asignación de especies por jardín y las series NDVI son ilustrativas.

---

## Cómo está organizado

```
index.html                    Estructura de la página, menú y textos fijos de cada sección
.nojekyll                     Indica a GitHub Pages que publique los archivos tal cual

assets/css/
  base.css                    Colores, tipografías y estilos generales (empieza por aquí para cambiar colores)
  relato.css                  Monitoreo: gráfico de temporada y relato mes a mes
  herbarios.css               Sección Herbarios (clases con prefijo hb-)
assets/js/
  core.js                     Carga de datos y navegación (normalmente no se toca)
  jardines.js                 Inicio, Visor, Jardines, Ensayos y Catálogo
  monitoreo.js                Monitoreo satelital y relato NDVI
  herbarios.js                Herbarios

data/
  sitio.json                  Configuración: dirección pública del sitio y App de Earth Engine
  eeas.geojson                Estaciones (coordenadas, gradiente, registros, estado de la memoria)
  parcelas.geojson            Polígonos de parcelas demostrativas y ensayos
  departamentos.geojson       Límites departamentales (fondo de los mapas)
  especies.json               Catálogo de especies forrajeras (fichas con QR)
  ensayos.json                Ensayos y protocolos
  resumen.json                Cifras del inventario consolidado
  ndvi.json                   NDVI mensual por jardín (se reemplaza con la exportación de Earth Engine)
  relato_ndvi.json            Textos del relato mes a mes de Monitoreo
  herbarios.json              Lista de herbarios de la red y su estado

herbarios/vista-florida/
  herbario.json               Título, presentación, encabezado del rótulo, avance y observaciones
  ejemplares.csv              Un ejemplar por fila, en formato Darwin Core (listo para GBIF)
  especies.csv                Una ficha por especie: descripción, hábito, origen, interés forrajero
  candidatos.csv              Especies registradas que aún no tienen rótulo
  img/                        Fotos: VF-002.jpg (grande) y VF-002-t.jpg (miniatura)
```

La regla general: **el contenido está en `data/` y `herbarios/`; el diseño en `assets/css/`; el comportamiento en `assets/js/`.** Para corregir un texto o un dato casi nunca hace falta tocar código.

---

## Tres formas de editar

### 1. Directamente en GitHub (cambios pequeños)
1. Abre el archivo en el repositorio y pulsa el **lápiz** (Edit this file).
2. Haz el cambio.
3. Pulsa **Commit changes**, escribe en una línea qué cambiaste (por ejemplo, "Corrige altitud de VF-021") y confirma.

Los archivos `.csv` se ven como tabla en GitHub; al editarlos con el lápiz se muestran como texto separado por comas.

### 2. Editor completo en el navegador (varios archivos a la vez)
Con el repositorio abierto, presiona la tecla **`.`** (punto). Se abre **github.dev**, un Visual Studio Code dentro del navegador. Puedes editar varios archivos, buscar y reemplazar en todo el sitio, y al final guardar todo en un solo commit desde el ícono de control de versiones (barra izquierda).

### 3. En tu computadora (fotos, archivos grandes, pruebas)
1. Instala **GitHub Desktop** y **Visual Studio Code**.
2. En GitHub Desktop: **File → Clone repository** y elige este repositorio.
3. Edita con VS Code. Para ver el sitio antes de publicarlo, abre una terminal en la carpeta y ejecuta:
   ```
   python -m http.server 8000
   ```
   y entra a `http://localhost:8000`. (El sitio lee los datos con `fetch`, por eso no funciona abriendo `index.html` con doble clic.)
4. En GitHub Desktop: escribe el resumen del cambio, **Commit to main** y **Push origin**.

---

## Tareas frecuentes

| Quiero… | Archivo |
|---|---|
| Cambiar un texto de presentación de una sección | `index.html` (buscar la sección por su comentario, p. ej. `MONITOREO`) |
| Corregir un dato de una estación | `data/eeas.geojson` |
| Escribir el contexto de la memoria técnica de un jardín | `assets/js/jardines.js`, objeto `CONTEXTO` al inicio |
| Agregar una especie forrajera al catálogo | `data/especies.json` (copiar un bloque `{ … }` y cambiar sus valores) |
| Agregar un ensayo | `data/ensayos.json` |
| Cambiar los textos del relato NDVI | `data/relato_ndvi.json` |
| Poner la App de Earth Engine | `data/sitio.json` → `gee_app_url` |
| Cambiar un color en todo el sitio | `assets/css/base.css`, bloque `:root` (modo claro) y `:root[data-theme="dark"]` (modo oscuro) |
| Corregir un ejemplar del herbario | `herbarios/vista-florida/ejemplares.csv` |
| Corregir la descripción de una especie del herbario | `herbarios/vista-florida/especies.csv` |

### Agregar ejemplares al herbario
La forma más cómoda es con Excel:
1. Abre `ejemplares.csv` en Excel, agrega filas respetando las columnas y guarda como **CSV UTF-8 (delimitado por comas)**.
2. `taxonID` une el ejemplar con su ficha en `especies.csv` (por ejemplo `sp-cordia-lutea`). Si la especie es nueva, agrega también su fila en `especies.csv`.
3. Varias fotos de un mismo ejemplar se separan con ` | ` en `associatedMedia`: `img/VF-002.jpg | img/VF-002-2.jpg`.
4. Sube las fotos a `img/`. La miniatura lleva el mismo nombre con `-t` (`VF-002-t.jpg`, unos 400 px de ancho). Si no hay miniatura, el sitio usa la foto grande.

### Publicar el herbario de otra estación
1. Copia la carpeta `herbarios/vista-florida/` como `herbarios/<id-de-la-eea>/` (el id es el de `data/eeas.geojson`, por ejemplo `el-chira`).
2. Reemplaza sus CSV, fotos y `herbario.json`.
3. En `data/herbarios.json`, cambia la entrada de esa estación a `"estado": "publicado"`, con su `"codigo"` y `"carpeta"`.

### Actualizar el NDVI con datos reales
Reemplaza `data/ndvi.json` con la exportación de Earth Engine en el mismo formato: `meses` (lista `AAAA-MM`) y `series` con una lista de valores por id de estación. Los gráficos, el mapa del relato y las cifras de cada mes se recalculan solos; solo los textos de `relato_ndvi.json` hay que revisarlos a mano.

### Antes de imprimir rótulos con QR
Coloca la dirección definitiva del sitio en `data/sitio.json` → `url_publica`. Los QR de las fichas y de los rótulos del herbario apuntan a esa dirección.

---

## Publicar en GitHub Pages

1. Sube todo el contenido de esta carpeta a la raíz de la rama `main` del repositorio (no la carpeta contenedora).
2. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
3. En uno o dos minutos el sitio queda en `https://<organización>.github.io/<repositorio>/`.

Haz commits pequeños y con un mensaje claro: así el historial muestra qué cambió, cuándo y quién lo hizo, y cualquier cambio se puede deshacer.

## Direcciones de cada sección

`#inicio` · `#visor` · `#jardines` · `#jardin/vista-florida` · `#ensayos` · `#catalogo` · `#especie/cuba-22` · `#monitoreo` · `#herbarios` · `#herbario/vista-florida` · `#herbario/vista-florida/ejemplares` · `#herbario/vista-florida/mapa` · `#herbario/vista-florida/sp-cordia-lutea`

## Créditos de datos
Límites departamentales: INEI. Imagen satelital del visor: Esri, Maxar, Earthstar Geographics. Índices de vegetación: Copernicus Sentinel-2 procesado en Google Earth Engine.
