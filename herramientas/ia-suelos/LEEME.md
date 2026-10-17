# Lectura de calicatas con IA

La sección **Suelos** puede describir la foto de una calicata con IA (estructura, raíces, moteados, límites entre horizontes, compactación y el sello GPS de la foto). Como el sitio es estático, la clave de la API no puede ir en GitHub: se guarda en un servicio pequeño, `worker.js`, que corre gratis en Cloudflare.

Mientras `ia_suelos_url` esté vacío en `data/sitio.json`, la sección funciona igual y solo muestra que la lectura con IA aún no está activa.

## Activarla (una sola vez, unos 15 minutos)

1. **Clave de la API.** En [console.anthropic.com](https://console.anthropic.com) crea una clave (API Keys → Create Key) y carga saldo. Cada lectura de una foto cuesta del orden de unos centavos de dólar con el modelo por defecto; en la consola se puede fijar un límite mensual de gasto.
2. **Cuenta en Cloudflare.** Crea una cuenta gratuita en [dash.cloudflare.com](https://dash.cloudflare.com).
3. **Crear el Worker.** Workers & Pages → Create → Create Worker → nombre `ia-suelos` → Deploy. Luego **Edit code**, borra el contenido, pega todo `worker.js` y pulsa **Deploy**.
4. **Variables.** En el Worker: Settings → Variables and Secrets:
   - `ANTHROPIC_API_KEY` (tipo **Secret**): la clave del paso 1.
   - `ORIGENES` (tipo Text): la dirección del sitio sin barra final, por ejemplo `https://observatorio-forrajero-procap.github.io`. Para probar en tu computadora agrega `,http://localhost:8000`.
   - `MODELO` (opcional): `claude-sonnet-5-5` por defecto; `claude-haiku-5-5` es más barato y algo menos detallado.
5. **Conectar el sitio.** Copia la dirección del Worker (algo como `https://ia-suelos.<tu-cuenta>.workers.dev`) y pégala en `data/sitio.json` → `ia_suelos_url`. Al guardar el cambio en GitHub, el botón «Interpretar foto con IA» aparece en Suelos → Perfil y color.

## Qué hace y qué no hace

- Solo atiende pedidos que vienen de las direcciones de `ORIGENES` y solo con una foto y los datos del perfil: no sirve como acceso general a la API.
- La foto no se guarda en ningún lado; se envía a la API, se obtiene la respuesta y se descarta.
- La interpretación es un apoyo: el sitio la muestra con la nota «Verificar en campo».

Para cambiar las instrucciones que recibe la IA, edita la constante `INSTRUCCIONES` en `worker.js` y vuelve a desplegarlo en Cloudflare.
