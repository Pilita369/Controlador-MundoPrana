// Edge Function: interpreta una foto o PDF de una carta / lista de precios y devuelve
// una lista de productos en JSON. No escribe nada en la base de datos: el frontend
// muestra el resultado como previsualizacion editable antes de guardar (ver ImportarIA.tsx).
//
// Requiere el secret ANTHROPIC_API_KEY configurado en el proyecto de Supabase
// (Dashboard > Edge Functions > Manage secrets, o `supabase secrets set ANTHROPIC_API_KEY=...`).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `Analizá esta imagen o documento: es una carta, lista de precios o catálogo de
productos de un negocio de viandas saludables (Mundo Prana). Extraé cada producto o plato
que veas, uno por uno, incluso si el precio o alguna categoría no aparece.

Para cada producto devolvé:
- nombre: el nombre tal como aparece
- precio_venta: el precio en pesos argentinos, solo el número (sin "$" ni puntos de miles), o null si no aparece
- tipo: "fresco" o "congelado" si se puede inferir del contexto, o null
- categoria: "vegetariano" o "carne" si se puede inferir, o null

Respondé EXCLUSIVAMENTE con un JSON válido, sin texto adicional ni markdown, con este formato:
{"productos": [{"nombre": "...", "precio_venta": 1234, "tipo": null, "categoria": null}]}

Si no reconocés ningún producto, respondé {"productos": []}.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Falta configurar el secret ANTHROPIC_API_KEY en este proyecto de Supabase." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const { base64, mimeType } = await req.json();
    if (!base64 || !mimeType) {
      return new Response(JSON.stringify({ error: "Falta el archivo a analizar" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const esPdf = mimeType === "application/pdf";
    const contentBlock = esPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: PROMPT }] }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `Error de la API de Claude (${resp.status}): ${errText.slice(0, 500)}` }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const texto: string = data?.content?.[0]?.text ?? "";
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: "No se pudo interpretar la respuesta del modelo", crudo: texto.slice(0, 500) }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(match[0]);
    return new Response(JSON.stringify(parsed), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
