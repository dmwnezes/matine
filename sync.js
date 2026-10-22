// Lógica pura da sincronia (sem Firebase e sem DOM), para dar para testar com `node --test`.

/** Onde o filme deveria estar agora, segundo o estado da sala. `agora` é o relógio do servidor (ms). */
export function esperado(estado, agora) {
  if (!estado) return 0;
  const passou = estado.tocando ? Math.max(0, agora - estado.em) / 1000 : 0;
  return estado.pos + passou;
}

/** A sala mandou tocar, mas o "já" ainda não chegou (contagem 3, 2, 1 rolando). */
export const emContagem = (estado, agora) => !!estado?.tocando && estado.em > agora;

/**
 * O que fazer com o vídeo local para alcançar a sala.
 * `diff` = posição local − posição esperada (segundos).
 * Diferença grande: pula. Pequena: acelera ou freia de leve até encostar (sem tranco),
 * mais forte quanto mais longe (no máximo 10%), e para de mexer abaixo de 0,05 s.
 */
export function correcao(diff) {
  const d = Math.abs(diff);
  if (d > 1.5) return { pular: true, velocidade: 1 };
  if (d < 0.05) return { pular: false, velocidade: 1 };
  const ajuste = Math.min(0.1, d / 4);
  return { pular: false, velocidade: +(diff > 0 ? 1 - ajuste : 1 + ajuste).toFixed(3) };
}

/**
 * Um evento do vídeo daqui (play, pause, pulo) é novidade para a sala?
 * Se o vídeo só está obedecendo a sala, não manda nada — é isso que evita o eco.
 */
export function ehNovidade(estado, tocando, pos, agora) {
  if (!estado) return true;
  if (estado.tocando !== tocando) return true;
  return Math.abs(pos - esperado(estado, agora)) > 1.5;
}

/**
 * Transforma o link colado num endereço que o <video> consegue tocar.
 * Devolve { url } ou { erro }.
 */
export function linkDoVideo(texto, chaveDrive) {
  let u;
  try { u = new URL(String(texto).trim()); } catch { return { erro: "Isso não parece um link." }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { erro: "O link precisa começar com https://" };
  const host = u.hostname.replace(/^www\./, "");

  const embed = embedDoLink(u);
  if (embed) return { url: u.toString(), embed };

  if (host === "drive.google.com" || host === "docs.google.com") {
    const id = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] || u.searchParams.get("id");
    if (!id) return { erro: "Não achei o arquivo nesse link do Drive." };
    if (!chaveDrive) return { erro: "Para links do Google Drive, cole a chave do Google Drive (só uma vez).", semChaveDrive: true };
    return { url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(chaveDrive)}`, drive: id };
  }

  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return { url: u.toString() };
  }

  return { url: u.toString() };
}

/**
 * Link de um site com player próprio que dá para comandar de fora (play, pausa, pulo): YouTube e Vimeo.
 * Devolve { tipo, id, h? } ou null. `h` é a chave dos vídeos "não listados" do Vimeo.
 */
export function embedDoLink(link) {
  let u;
  try { u = new URL(link); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  const partes = u.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = host === "youtu.be" ? partes[0]
      : partes[0] === "watch" ? u.searchParams.get("v")
      : ["shorts", "embed", "live", "v"].includes(partes[0]) ? partes[1] : null;
    return /^[\w-]{11}$/.test(id || "") ? { tipo: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const i = partes.findIndex((p) => /^\d+$/.test(p));
    if (i < 0) return null;
    const h = u.searchParams.get("h") || (/^[\da-f]{6,}$/i.test(partes[i + 1] || "") ? partes[i + 1] : "");
    return { tipo: "vimeo", id: partes[i], ...(h && { h }) };
  }
  return null;
}

/** Código curto da sala, sem letras que confundem (0/O, 1/I/L). */
export function novoCodigo(aleatorio = Math.random) {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += letras[Math.floor(aleatorio() * letras.length)];
  return c;
}

export const codigoValido = (c) => /^[A-HJ-NP-Z2-9]{6}$/.test(c);

/** Chave da Web do Firebase (sempre "AIza" + 35 letras/números/-/_). */
export const chaveValida = (k) => /^AIza[0-9A-Za-z_-]{35}$/.test(k || "");

/**
 * Link da sala: "#CODIGO~CHAVE". A chave vai junto no convite para quem entra não precisar digitar nada
 * (como na Estante, que levava o banco no link). A chave não é segredo: só funciona no dmwnezes.com.
 */
export function lerHash(hash) {
  const [c = "", k = ""] = decodeURIComponent(String(hash).replace(/^#/, "")).trim().split("~");
  return { codigo: c.toUpperCase(), chave: chaveValida(k) ? k : "" };
}
export const montarHash = (codigo, chave) => "#" + codigo + (chave ? "~" + chave : "");

/** Nome de arquivo vira título para buscar a capa: "Interstellar.2014.1080p.BluRay.x264" → "Interstellar". */
export function limparTitulo(nome) {
  let t = String(nome).replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[._]+/g, " ");
  t = t.replace(/[\[(].*$/, ""); // "(2014)", "[YTS]"...
  t = t.split(/\s(?:19\d\d|20\d\d|480p|720p|1080p|2160p|4k|bluray|blu-ray|brrip|web-?dl|webrip|hdrip|dvdrip|x264|x265|h264|h265|hevc|dual|dublado|legendado|nacional)\b/i)[0];
  return t.replace(/\s+/g, " ").trim();
}
