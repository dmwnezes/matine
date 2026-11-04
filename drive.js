// Conversa com a API do Google Drive sem baixar o filme: dados do arquivo, teste do link e pastas.
import { linkDoVideo, motivoDoErro } from "./sync.js";

const API = "https://www.googleapis.com/drive/v3/files";

/** Campo `reason` do erro da API (a resposta pode nem ser JSON). */
const motivoDe = (resp) => resp.clone().json().then((j) => j?.error?.errors?.[0]?.reason || j?.error?.status || "").catch(() => "");

/** Tamanho, tipo e data do arquivo. Não conta como download. */
export async function dadosDoArquivo(id, chave) {
  const r = await fetch(`${API}/${id}?fields=size,mimeType,name,modifiedTime&supportsAllDrives=true&key=${encodeURIComponent(chave)}`);
  if (!r.ok) return { ok: false, texto: motivoDoErro(r.status, await motivoDe(r)) };
  const j = await r.json();
  return { ok: true, total: Number(j.size) || 0, tipo: j.mimeType || "video/mp4", nome: j.name || "", versao: j.modifiedTime || "" };
}

const tamanho = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace(".", ",")} GB` : `${Math.round(b / 1e6)} MB`);

/**
 * O link abre agora? Lê só 1 byte. Devolve { ok, texto }; ok = null quando o servidor não deixa testar daqui
 * (sem CORS), o que não quer dizer que o vídeo não toca.
 */
export async function testarLink(link, chave) {
  const v = linkDoVideo(link, chave);
  if (v.erro) return { ok: false, texto: v.erro };
  if (v.embed) return { ok: true, texto: `Toca no player do ${v.embed.tipo === "youtube" ? "YouTube" : "Vimeo"}.` };
  try {
    const r = await fetch(v.url, { headers: { Range: "bytes=0-0" } });
    if (!r.ok) return { ok: false, texto: motivoDoErro(r.status, await motivoDe(r)) };
    r.body?.cancel().catch(() => {});
    const dados = v.drive ? await dadosDoArquivo(v.drive, chave).catch(() => null) : null;
    return { ok: true, texto: dados?.total ? `Link funcionando · ${tamanho(dados.total)}` : "Link funcionando" };
  } catch { return { ok: null, texto: "Não deu para testar este link daqui, mas ele ainda pode tocar." }; }
}

const EH_VIDEO = /\.(mp4|m4v|mkv|webm|mov|ts|ogv)$/i;

/** Vídeos de uma pasta pública do Drive (sem subpastas), em ordem de nome. */
export async function listarPasta(id, chave) {
  const arquivos = [];
  let pagina = "";
  do {
    const q = new URLSearchParams({ q: `'${id}' in parents and trashed=false`, fields: "nextPageToken,files(id,name,mimeType)", orderBy: "name", pageSize: "200", supportsAllDrives: "true", includeItemsFromAllDrives: "true", key: chave });
    if (pagina) q.set("pageToken", pagina);
    const r = await fetch(`${API}?${q}`);
    if (!r.ok) throw new Error(motivoDoErro(r.status, await motivoDe(r)));
    const j = await r.json();
    arquivos.push(...(j.files || []));
    pagina = j.nextPageToken || "";
  } while (pagina);
  return arquivos.filter((a) => a.mimeType?.startsWith("video/") || EH_VIDEO.test(a.name || ""));
}
