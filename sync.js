// Lógica pura da sincronia (sem Firebase e sem DOM), para dar para testar com `node --test`.

/** Onde o filme deveria estar agora, segundo o estado da sala. `agora` é o relógio do servidor (ms). */
export function esperado(estado, agora) {
  if (!estado) return 0;
  const passou = estado.tocando ? Math.max(0, agora - estado.em) / 1000 : 0;
  return estado.pos + passou;
}

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

  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com")
    return { erro: "Vídeos do YouTube não dá para tocar aqui. Use um link direto do arquivo." };

  if (host === "drive.google.com" || host === "docs.google.com") {
    const id = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] || u.searchParams.get("id");
    if (!id) return { erro: "Não achei o arquivo nesse link do Drive." };
    if (!chaveDrive) return { erro: "Links do Drive precisam da chave do Google no config.js." };
    return { url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(chaveDrive)}`, drive: id };
  }

  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return { url: u.toString() };
  }

  return { url: u.toString() };
}

/** Código curto da sala, sem letras que confundem (0/O, 1/I/L). */
export function novoCodigo(aleatorio = Math.random) {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += letras[Math.floor(aleatorio() * letras.length)];
  return c;
}

export const codigoValido = (c) => /^[A-HJ-NP-Z2-9]{6}$/.test(c);
