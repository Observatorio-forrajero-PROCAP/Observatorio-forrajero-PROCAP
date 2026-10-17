/* ==========================================================================
   Red JANO · servicio de lectura de calicatas con IA (Cloudflare Worker)
   Recibe la foto de una calicata desde la sección Suelos del sitio, la envía
   a la API de Claude con instrucciones fijas y devuelve la interpretación en
   JSON. La clave de la API queda guardada en Cloudflare, nunca en el sitio.

   Variables del Worker (Settings → Variables and Secrets):
     ANTHROPIC_API_KEY   secreto · clave de la API de Claude
     ORIGENES            dirección del sitio, p. ej. https://observatorio-forrajero-procap.github.io
                         (varias separadas por coma)
     MODELO              opcional · por defecto claude-sonnet-5-5
   Instrucciones completas en LEEME.md
   ========================================================================== */

const MAX_IMAGEN = 3_000_000; // caracteres base64 (~2,2 MB de JPG)

const INSTRUCCIONES = `Eres edafólogo de campo con experiencia en suelos aluviales y calcáreos de la costa y el bosque seco del Perú. La imagen es una calicata (perfil de suelo). Abajo van los datos que registró el técnico.

Describe solo lo que se puede ver en la foto. Si algo no se ve, usa null. No inventes valores de laboratorio.
Responde solo con un objeto JSON con esta forma exacta:
{"coordenadas_visibles": {"texto": "texto exacto del sello GPS si se ve", "lat": -6.7, "lon": -79.7} o null,
 "horizontes": [{"nombre": "A", "profundidad_cm": "0-15", "color_aparente": "", "estructura": "", "raices": "", "moteados_o_concreciones": "", "limite_inferior": "", "observaciones": ""}],
 "compactacion": {"evidencia": "", "profundidad_cm": ""},
 "calidad_foto": {"problemas": [""], "recomendaciones": [""]},
 "coincidencias_con_datos": "",
 "discrepancias_con_datos": "",
 "resumen": "tres frases claras para un productor",
 "confianza": "baja | media | alta"}`;

export default {
  async fetch(request, env) {
    const permitidos = (env.ORIGENES || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origen = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": permitidos.includes(origen) ? origen : permitidos[0] || "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const responder = (cuerpo, estado = 200) =>
      new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return responder({ error: "Usa POST." }, 405);
    if (!permitidos.includes(origen)) return responder({ error: "Este servicio solo atiende al sitio de la Red JANO." }, 403);
    if (!env.ANTHROPIC_API_KEY) return responder({ error: "El servicio no tiene configurada la clave de la API." }, 500);

    let datos;
    try { datos = await request.json(); } catch { return responder({ error: "La solicitud no es JSON válido." }, 400); }
    const imagen = typeof datos.imagen === "string" ? datos.imagen : "";
    if (!imagen || imagen.length > MAX_IMAGEN || !/^[A-Za-z0-9+/=]+$/.test(imagen.slice(0, 200))) {
      return responder({ error: "La foto falta o es demasiado grande. Usa una foto JPG de menos de 2 MB." }, 400);
    }
    // Solo se pasan los campos esperados, recortados, para que el servicio no sirva como proxy general.
    const d = datos.datos || {};
    const horizontes = (Array.isArray(d.horizontes) ? d.horizontes : []).slice(0, 8).map((h) => ({
      nombre: String(h.nombre || "").slice(0, 12), desde: Number(h.desde) || 0, hasta: Number(h.hasta) || 0,
      color_foto: h.color_foto ? String(h.color_foto).slice(0, 16) : null, color_campo: h.color_campo ? String(h.color_campo).slice(0, 16) : null,
      nota: String(h.nota || "").slice(0, 120)
    }));
    const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
    const contexto = JSON.stringify({
      horizontes, raices_cm: num(d.raices_cm),
      compactacion_cm: Array.isArray(d.compactacion_cm) ? d.compactacion_cm.slice(0, 2).map(num) : null,
      laboratorio: { ph: num(d.ph), ce_dS_m: num(d.ce), mo_pct: num(d.mo), caco3_pct: num(d.caco3) }
    });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.MODELO || "claude-sonnet-5-5",
        max_tokens: 1800,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imagen } },
          { type: "text", text: INSTRUCCIONES + "\n\nDatos del técnico: " + contexto }
        ] }]
      })
    });
    if (!r.ok) {
      const estado = r.status === 429 ? 429 : 502;
      return responder({ error: estado === 429 ? "El servicio está ocupado. Intenta en unos minutos." : "La IA no respondió. Intenta de nuevo." }, estado);
    }
    const j = await r.json();
    const texto = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const ini = texto.indexOf("{"), fin = texto.lastIndexOf("}");
    try {
      return responder({ resultado: JSON.parse(texto.slice(ini, fin + 1)) });
    } catch {
      return responder({ error: "La respuesta de la IA no llegó en el formato esperado. Intenta de nuevo." }, 502);
    }
  }
};
