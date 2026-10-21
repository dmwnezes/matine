// Capa e resumo do filme pela Wikipédia em português (sem chave, aceita pedidos de qualquer site).

/** Resultado da API da Wikipédia em { titulo, img, resumo, pagina } — ou null se não achou um filme com imagem. */
export function lerResposta(json) {
  const pagina = Object.values(json?.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
  if (!pagina?.thumbnail?.source) return null;
  return {
    titulo: String(pagina.title).slice(0, 120),
    img: pagina.thumbnail.source.split("?")[0],
    resumo: String(pagina.extract || "").slice(0, 400),
    pagina: `https://pt.wikipedia.org/?curid=${pagina.pageid}`,
  };
}

export async function buscarCapa(titulo) {
  if (!titulo || titulo.length < 2) return null;
  const q = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: `${titulo} filme`, gsrlimit: "1",
    prop: "pageimages|extracts", exintro: "1", explaintext: "1", exsentences: "2", pithumbsize: "500",
    format: "json", origin: "*",
  });
  try {
    // A Wikipédia pede que cada site se identifique (assim ela não confunde a Matinê com robô).
    const r = await fetch(`https://pt.wikipedia.org/w/api.php?${q}`, { headers: { "Api-User-Agent": "Matine/1.0 (https://dmwnezes.com/matine)" } });
    return r.ok ? lerResposta(await r.json()) : null;
  } catch { return null; }
}
