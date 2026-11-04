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
  let h = String(hash).replace(/^#/, "");
  try { h = decodeURIComponent(h); } catch {} // convite cortado no meio de um "%": não derruba o site
  h = h.trim();
  // Link da lista compartilhada: #lista=CODIGO16
  if (h.startsWith("lista=")) { const l = h.slice(6); return { codigo: "", chave: "", lista: /^[A-Za-z0-9]{16}$/.test(l) ? l : "" }; }
  const [c = "", k = ""] = h.split("~");
  return { codigo: c.toUpperCase(), chave: chaveValida(k) ? k : "", lista: "" };
}
export const montarHash = (codigo, chave) => "#" + codigo + (chave ? "~" + chave : "");

/** Nome de arquivo vira título para buscar a capa: "Interstellar.2014.1080p.BluRay.x264" → "Interstellar". */
export function limparTitulo(nome) {
  let t = String(nome).replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[._]+/g, " ");
  t = t.replace(/[\[(].*$/, ""); // "(2014)", "[YTS]"...
  t = t.split(/\s(?:19\d\d|20\d\d|480p|720p|1080p|2160p|4k|bluray|blu-ray|brrip|web-?dl|webrip|hdrip|dvdrip|x264|x265|h264|h265|hevc|dual|dublado|legendado|nacional)\b/i)[0];
  return t.replace(/\s+/g, " ").trim();
}

/** Quem escreve o "já" quando a sala está se preparando: quem pediu, ou (se saiu) o menor uid presente. */
export function quemDecide(pessoas, por) {
  if (pessoas?.[por]) return por;
  return Object.keys(pessoas || {}).sort()[0] || null;
}

/** Todos que estão assistindo já carregaram o ponto `prep`? Quem saiu da aba ou está com erro não segura a sala. */
export const todosProntos = (pessoas, prep) =>
  Object.values(pessoas || {}).every((p) => p.fora || p.erro || p.pronto === prep);

/** Link de pasta do Drive → id da pasta (ou ""). */
export function pastaDoDrive(texto) {
  try {
    const u = new URL(String(texto).trim());
    if (u.hostname.replace(/^www\./, "") !== "drive.google.com") return "";
    return u.pathname.match(/\/folders\/([\w-]{10,})/)?.[1] || "";
  } catch { return ""; }
}

/** Próximo bloco que falta baixar: o primeiro a partir de `cursor`; no fim, volta para o começo. */
export function proximoBloco(tem, cursor, total) {
  for (let i = 0; i < total; i++) { const k = (cursor + i) % total; if (!tem.has(k)) return k; }
  return null;
}

/**
 * Cabeçalho Range → { ini, fim } dentro do arquivo, entregando no máximo `max` bytes (resposta menor que o pedido
 * é válida em HTTP: o <video> pede o resto depois). Devolve null se a faixa não existe.
 */
export function faixaPedida(range, total, max) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || "bytes=0-").trim());
  if (!m || (!m[1] && !m[2])) return null;
  const ini = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
  const pedido = m[1] && m[2] ? Number(m[2]) : total - 1;
  if (ini >= total || pedido < ini) return null;
  return { ini, fim: Math.min(pedido, total - 1, ini + max - 1) };
}

/** O que o Drive respondeu → frase para a tela. `motivo` é o campo reason do erro da API. */
export function motivoDoErro(status, motivo = "") {
  if (/QuotaExceeded|sharingRateLimit/i.test(motivo)) return "O Google bloqueou este arquivo por excesso de downloads. Costuma voltar em até 24 h. Para ver antes, faça uma cópia do arquivo no Drive e use o link da cópia.";
  if (/rateLimit|dailyLimit/i.test(motivo) || status === 429) return "Muitos pedidos ao Drive neste minuto. Espere um pouco e tente de novo.";
  if (/ipRefererBlocked|keyInvalid|keyExpired|API_KEY/i.test(motivo) || status === 400) return "A chave do Google Drive recusou este site. Confira a chave no Google Cloud.";
  if (status === 404 || motivo === "notFound") return "Arquivo não encontrado. Ele foi apagado ou não está como \"qualquer pessoa com o link\".";
  if (status === 401 || status === 403) return "Sem permissão para abrir. Compartilhe o arquivo como \"qualquer pessoa com o link\".";
  if (status >= 500) return "O servidor do vídeo está com problema agora. Tente de novo em instantes.";
  return `O servidor do vídeo recusou o pedido (erro ${status}).`;
}
