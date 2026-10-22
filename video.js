// Abre qualquer link de vídeo no <video>.
// 1. Se o navegador toca o arquivo como ele é (MP4/WebM comuns), usa o próprio <video>.
// 2. Se não (MKV, MOV, TS, HLS, áudio Dolby AC-3/E-AC-3, vídeo HEVC/AV1 que o aparelho não decodifica…),
//    converte em tempo real para MP4 fragmentado com o Mediabunny e entrega ao <video> pelo Media Source.
//    O que já é compatível é só copiado (rápido); só o que não é compatível é recodificado.

// "mediabunny" vem do mapa de importação do index.html: o módulo do Dolby (AC3) importa o mesmo endereço,
// e precisa ser a mesma cópia para o decodificador que ele registra valer na conversão.
import { embedDoLink } from "./sync.js";

const AC3 = "https://cdn.jsdelivr.net/npm/@mediabunny/ac3@1.62.0/dist/bundles/mediabunny-ac3.min.mjs";
const MS = globalThis.ManagedMediaSource || globalThis.MediaSource; // ManagedMediaSource = iPhone (iOS 17.1+)

const ADIANTE = 60; // segundos de filme guardados à frente; mais que isso, a conversão espera
const ATRAS = 30; // segundos já vistos que continuam guardados (voltar um pouco não reconverte)

/** Decide pelo que o navegador diz que toca: "probably"/"maybe" para o tipo com codecs. */
export const tocaNativo = (podeTocar, mime) => !!mime && podeTocar(mime) !== "";

/** Trechos guardados (TimeRanges) cobrem o instante t? */
export function guardado(ranges, t) {
  for (let i = 0; i < ranges.length; i++) if (t >= ranges.start(i) - 0.3 && t <= ranges.end(i)) return true;
  return false;
}

/** Quantos segundos à frente de t já estão guardados. */
export function adiante(ranges, t) {
  for (let i = 0; i < ranges.length; i++) if (t >= ranges.start(i) - 0.3 && t <= ranges.end(i)) return ranges.end(i) - t;
  return 0;
}

let mb = null;
const carregarMediabunny = () => (mb ??= import("mediabunny"));
let ac3 = null;
const carregarAc3 = () => (ac3 ??= import(AC3).then((m) => m.registerAc3Decoder()));

/**
 * Abre `url` no `video`. Devolve { fechar() }.
 * `aoFalhar(mensagem)` é chamado quando o aparelho não consegue tocar o arquivo de jeito nenhum.
 */
export async function abrirVideo(video, url, aoFalhar) {
  const emb = embedDoLink(url);
  if (emb) return (await import("./embed.js")).abrirEmbed(video, emb, aoFalhar);
  let m, input;
  try {
    m = await carregarMediabunny();
    input = new m.Input({ source: new m.UrlSource(url), formats: [...new Set([...m.ALL_FORMATS, ...m.HLS_FORMATS])] });
    const mime = await input.getMimeType();
    if (tocaNativo((t) => video.canPlayType(t), mime)) { input.dispose(); return nativo(video, url); }
  } catch (e) {
    // Sem como ler o arquivo daqui (servidor sem CORS, formato desconhecido como AVI…): tenta o <video> direto.
    console.warn("Matinê: leitura do arquivo falhou, tentando direto", e);
    input?.dispose();
    return nativo(video, url);
  }
  if (!MS) { input.dispose(); return nativo(video, url); }
  const conv = new Conversor(m, input, video, aoFalhar);
  return conv.abrir().catch((e) => {
    console.error("Matinê: não deu para preparar o vídeo", e);
    aoFalhar(mensagemDeErro(e));
    return conv;
  });
}

function nativo(video, url) {
  video.src = url;
  return { fechar() { video.removeAttribute("src"); video.load(); } };
}

class Conversor {
  constructor(m, input, video, aoFalhar) {
    Object.assign(this, { m, input, video, aoFalhar });
    this.geracao = 0;
    this.conversao = null;
    this.fila = Promise.resolve();
    this.aoBuscar = () => { if (!guardado(this.video.buffered, this.video.currentTime)) this.comecar(this.video.currentTime); };
  }

  async abrir() {
    const { m, input, video } = this;
    const [vt, at] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    if (!vt && !at) { this.aoFalhar("Esse arquivo não tem vídeo nem áudio que eu consiga ler."); return this; }
    const suporta = async (t, tipo) => {
      const c = t && await t.getCodecParameterString();
      return !!c && MS.isTypeSupported(`${tipo}/mp4; codecs="${c}"`);
    };
    this.copiaVideo = await suporta(vt, "video");
    this.copiaAudio = await suporta(at, "audio");
    if (at && !this.copiaAudio && (at.codec === "ac3" || at.codec === "eac3")) await carregarAc3();
    // Para o que não dá para copiar, escolhe o primeiro formato que este aparelho sabe gerar
    // (nem todo navegador gera AAC; o Opus serve de reserva).
    this.alvoVideo = vt && !this.copiaVideo
      ? await m.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: vt.codedWidth, height: vt.codedHeight }) : null;
    this.alvoAudio = at && !this.copiaAudio
      ? await m.getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: Math.min(2, at.numberOfChannels), sampleRate: at.sampleRate }) : null;
    // Filme sem imagem ou sem som não serve: avisa em vez de tocar pela metade.
    if (vt && !this.copiaVideo && !(await vt.canDecode() && this.alvoVideo)) throw new Error("invalida:video");
    if (at && !this.copiaAudio && !(await at.canDecode() && this.alvoAudio)) throw new Error("invalida:audio");
    this.duracao = await input.computeDuration();

    this.ms = new MS();
    if (globalThis.ManagedMediaSource) video.disableRemotePlayback = true;
    video.src = URL.createObjectURL(this.ms);
    await new Promise((ok) => this.ms.addEventListener("sourceopen", ok, { once: true }));
    video.addEventListener("seeking", this.aoBuscar);
    this.comecar(0);
    return this;
  }

  /** (Re)começa a conversão a partir de `inicio` segundos. Uma conversão nova cancela a anterior. */
  comecar(inicio) {
    const ger = ++this.geracao;
    const anterior = this.conversao;
    this.fila = this.fila.then(async () => {
      if (anterior) await anterior.cancel().catch(() => {});
      if (ger !== this.geracao) return;
      const sb = this.sb;
      if (sb) {
        await this.esperar(sb);
        if (this.ms.readyState === "open") sb.abort();
        if (sb.buffered.length) { sb.remove(0, Infinity); await this.esperar(sb); }
        sb.timestampOffset = inicio; // a saída cortada começa em 0; isso a recoloca no tempo do filme
      } else this.inicioPendente = inicio;
      await this.converter(inicio, ger);
    }).catch((e) => {
      if (ger !== this.geracao) return; // cancelada de propósito
      console.error("Matinê: conversão falhou", e);
      this.aoFalhar(mensagemDeErro(e));
    });
  }

  async converter(inicio, ger) {
    const { m, input } = this;
    const eu = this;
    const output = new m.Output({
      format: new m.Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 2 }),
      target: new m.StreamTarget(new WritableStream({
        async write(pedaco) {
          if (ger !== eu.geracao) throw new Error("cancelada");
          // Espera o filme andar quando já tem bastante guardado à frente (não enche a memória).
          while (adiante(eu.video.buffered, eu.video.currentTime) > ADIANTE && ger === eu.geracao) await dormir(500);
          if (ger !== eu.geracao) throw new Error("cancelada");
          await eu.anexar(pedaco.data, output);
        },
      })),
    });
    const conversao = await m.Conversion.init({
      input, output, tracks: "primary",
      video: this.copiaVideo ? {} : this.alvoVideo ? { codec: this.alvoVideo, bitrate: m.QUALITY_MEDIUM } : { discard: true },
      // Som de cinema (5.1/7.1) vira estéreo: celular e notebook tocam em 2 canais de qualquer jeito.
      audio: this.copiaAudio ? {} : this.alvoAudio ? { codec: this.alvoAudio, bitrate: m.QUALITY_MEDIUM, numberOfChannels: 2 } : { discard: true },
      showWarnings: false,
      trim: inicio > 0 ? { start: inicio } : undefined,
    });
    if (!conversao.isValid) throw new Error("invalida:" + conversao.discardedTracks.map((d) => `${d.track.type}:${d.reason}`).join(","));
    this.conversao = conversao;
    await conversao.execute();
    if (ger === this.geracao && this.sb) { await this.esperar(this.sb); if (this.ms.readyState === "open") this.ms.endOfStream(); }
  }

  async anexar(dados, output) {
    if (!this.sb) {
      this.sb = this.ms.addSourceBuffer(await output.getMimeType());
      this.sb.mode = "segments";
      this.sb.timestampOffset = this.inicioPendente || 0;
      if (isFinite(this.duracao) && this.duracao > 0) this.ms.duration = this.duracao;
    }
    const sb = this.sb;
    await this.esperar(sb);
    this.limparAtras(sb);
    await this.esperar(sb);
    try { sb.appendBuffer(dados); }
    catch (e) {
      if (e.name !== "QuotaExceededError") throw e;
      // Memória cheia: solta o que já passou e tenta de novo uma vez.
      sb.remove(0, Math.max(0, this.video.currentTime - 2));
      await this.esperar(sb);
      sb.appendBuffer(dados);
    }
    await this.esperar(sb);
  }

  limparAtras(sb) {
    const ate = this.video.currentTime - ATRAS;
    if (sb.buffered.length && sb.buffered.start(0) < ate) sb.remove(0, ate);
  }

  esperar(sb) {
    return sb.updating ? new Promise((ok) => sb.addEventListener("updateend", ok, { once: true })) : Promise.resolve();
  }

  fechar() {
    this.geracao++;
    this.conversao?.cancel().catch(() => {});
    this.video.removeEventListener("seeking", this.aoBuscar);
    this.input.dispose();
    this.video.removeAttribute("src");
    this.video.load();
  }
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

function mensagemDeErro(e) {
  const t = String(e?.message || e);
  if (t.startsWith("invalida:")) {
    return t.includes("video")
      ? "Este aparelho não consegue tocar o vídeo deste arquivo. Tente uma versão em MP4 (H.264)."
      : "Este aparelho não consegue tocar o áudio deste arquivo. Tente uma versão em MP4 (AAC).";
  }
  return "Não consegui preparar este vídeo para tocar aqui.";
}
