// Vídeo de outro site (YouTube, Vimeo) tocando no player do próprio site, dentro de um iframe.
// O truque: o <video> da Matinê passa a "fingir" que é esse player. Play, pausa, posição, duração e volume
// do <video> viram comandos do iframe, e os eventos do iframe (play, pause, seeked…) saem pelo <video>.
// Assim a sincronia (app.js) e os controles (controles.js) funcionam sem saber que é um embed.
// O iframe não recebe toques: tudo passa pelos controles da Matinê, para a sala ficar sabendo.

const scripts = {};
function carregarScript(src, pronto) {
  return (scripts[src] ??= new Promise((ok, falha) => {
    if (pronto()) return ok();
    const s = Object.assign(document.createElement("script"), { src, async: true });
    s.onload = () => (pronto() ? ok() : null); // o YouTube avisa pelo onYouTubeIframeAPIReady
    s.onerror = () => { delete scripts[src]; falha(new Error("script")); };
    document.head.append(s);
    if (src.includes("youtube")) {
      const antes = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { antes?.(); ok(); };
    }
  }));
}

const ERRO_YT = {
  2: "Esse link do YouTube não aponta para um vídeo.",
  5: "Esse vídeo do YouTube não toca neste aparelho.",
  100: "Esse vídeo do YouTube foi removido ou é privado.",
  101: "O dono desse vídeo não deixa ele tocar fora do YouTube.",
  150: "O dono desse vídeo não deixa ele tocar fora do YouTube.",
};

/** Cada site vira o mesmo conjunto de comandos; `av` recebe estado ("tocando", "pausado", "carregando", "fim") e erros. */
export const sites = {
  async youtube(lugar, { id }, av) {
    await carregarScript("https://www.youtube.com/iframe_api", () => window.YT?.Player);
    return new Promise((ok) => {
      const p = new YT.Player(lugar, {
        videoId: id,
        width: "100%", height: "100%",
        playerVars: { controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => ok({
            tocar: () => p.playVideo(), pausar: () => p.pauseVideo(), ir: (t) => p.seekTo(t, true),
            volume: (v, mudo) => { p.setVolume(Math.round(v * 100)); mudo ? p.mute() : p.unMute(); },
            tempo: () => p.getCurrentTime(), duracao: () => p.getDuration(), fechar: () => p.destroy(),
          }),
          // -1 não começou · 0 fim · 1 tocando · 2 pausado · 3 carregando · 5 pronto (parado)
          onStateChange: (e) => av.estado({ 0: "fim", 1: "tocando", 2: "pausado", 3: "carregando", 5: "pausado" }[e.data]),
          onError: (e) => av.erro(ERRO_YT[e.data] || "O YouTube não deixou tocar esse vídeo."),
        },
      });
    });
  },

  async vimeo(lugar, { id, h }, av) {
    await carregarScript("https://player.vimeo.com/api/player.js", () => window.Vimeo?.Player);
    const p = new Vimeo.Player(lugar, { url: `https://vimeo.com/${id}${h ? "/" + h : ""}`, controls: false, playsinline: true, autopause: false, dnt: true });
    let tocando = false;
    p.on("play", () => { tocando = true; av.estado("tocando"); });
    p.on("playing", () => { tocando = true; av.estado("tocando"); });
    p.on("pause", () => { tocando = false; av.estado("pausado"); });
    p.on("ended", () => { tocando = false; av.estado("fim"); });
    p.on("bufferstart", () => av.estado("carregando"));
    p.on("bufferend", () => av.estado(tocando ? "tocando" : "pausado"));
    // Play recusado pelo navegador também chega aqui; esse a Matinê já trata (botão "Entrar no ritmo").
    p.on("error", (e) => {
      if (["NotAllowedError", "PlayInterrupted", "RangeError"].includes(e?.name)) return;
      av.erro(e?.name === "PasswordError" ? "Esse vídeo do Vimeo tem senha." : "O Vimeo não deixou tocar esse vídeo.");
    });
    await p.ready();
    return {
      tocar: () => p.play().catch(() => {}), pausar: () => p.pause().catch(() => {}), ir: (t) => p.setCurrentTime(t).catch(() => {}),
      volume: (v, mudo) => { p.setVolume(mudo ? 0 : v).catch(() => {}); },
      tempo: () => p.getCurrentTime(), duracao: () => p.getDuration(), fechar: () => p.destroy().catch(() => {}),
    };
  },
};

/** Abre o embed `emb` ({ tipo, id }) no lugar do `video`. Devolve { fechar() }. */
export async function abrirEmbed(video, emb, aoFalhar) {
  const caixa = Object.assign(document.createElement("div"), { className: "embed" });
  const lugar = document.createElement("div");
  caixa.append(lugar);
  video.after(caixa);
  video.hidden = true;
  const tinhaRemoto = video.disableRemotePlayback;
  video.disableRemotePlayback = true; // TV só com arquivo de verdade; esconde o botão

  const s = { pausado: true, carregando: false, buscando: false, segurar: false, t: 0, em: 0, dur: NaN, pronto: false, vel: 1, vol: video.volume, mudo: video.muted };
  let p = null, fechado = false, relogio = 0, buscaTimer = 0;
  const solta = (nome) => video.dispatchEvent(new Event(nome));
  const marcar = (t) => { s.t = t; s.em = performance.now(); };
  const agoraT = () => (s.pausado || s.carregando || s.buscando ? s.t : s.t + ((performance.now() - s.em) / 1000));

  const av = {
    estado(e) {
      if (fechado || !e) return;
      if (e === "carregando") { s.carregando = true; solta("waiting"); return; }
      s.carregando = false;
      if (e === "tocando") {
        // Pular com o vídeo parado faz o YouTube começar a tocar sozinho: segura parado, sem avisar a sala.
        if (s.segurar) { p?.pausar(); return; }
        marcar(s.t);
        if (s.pausado) { s.pausado = false; solta("play"); }
        solta("playing");
      } else {
        if (!s.pausado) { marcar(agoraT()); s.pausado = true; solta("pause"); }
        if (e === "fim") solta("ended");
      }
    },
    erro(msg) { if (!fechado) aoFalhar(msg); },
  };

  function ir(t) {
    t = Math.max(0, Math.min(+t || 0, isFinite(s.dur) ? s.dur - 0.5 : Infinity));
    marcar(t);
    s.buscando = true;
    if (s.pausado) s.segurar = true;
    solta("seeking");
    p?.ir(t);
    clearTimeout(buscaTimer);
    const prazo = Date.now() + 4000;
    const ver = async () => {
      if (fechado) return;
      const x = await p.tempo();
      if (Math.abs(x - t) < 1.5 || Date.now() > prazo) {
        marcar(x); s.buscando = false;
        solta("seeked"); solta("timeupdate");
        if (s.pausado) setTimeout(() => { s.segurar = false; }, 1500); // o "tocar" atrasado do YouTube ainda é barrado
      } else buscaTimer = setTimeout(ver, 200);
    };
    buscaTimer = setTimeout(ver, 200);
  }

  function tocar() {
    if (!p) return Promise.reject(new DOMException("ainda abrindo", "AbortError"));
    s.segurar = false;
    if (!s.pausado) return Promise.resolve();
    p.tocar();
    // Igual ao <video>: se o navegador não deixar tocar sem um toque (celular), rejeita com NotAllowedError.
    return new Promise((ok, falha) => {
      let prazo = Date.now() + 2500;
      const fim = Date.now() + 15000;
      const ver = () => {
        if (fechado) return falha(new DOMException("fechado", "AbortError"));
        if (!s.pausado) return ok();
        if (s.carregando && Date.now() < fim) prazo = Math.max(prazo, Date.now() + 1000);
        if (Date.now() > prazo) return falha(new DOMException("o site não deixou tocar", "NotAllowedError"));
        setTimeout(ver, 150);
      };
      ver();
    });
  }

  // O <video> passa a responder com o estado do embed (propriedades próprias, que tapam as do navegador).
  const props = {
    paused: { get: () => s.pausado },
    currentTime: { get: agoraT, set: ir },
    duration: { get: () => s.dur },
    readyState: { get: () => (!s.pronto ? 0 : s.carregando ? 2 : 4) },
    seeking: { get: () => s.buscando },
    // shortcut: YouTube e Vimeo não aceitam velocidade fina (1,03×); a sincronia só pula quando passa de 1,5 s.
    playbackRate: { get: () => s.vel, set: (v) => { s.vel = v; } },
    volume: { get: () => s.vol, set: (v) => { s.vol = v; p?.volume(s.vol, s.mudo); } },
    muted: { get: () => s.mudo, set: (m) => { s.mudo = !!m; p?.volume(s.vol, s.mudo); } },
    src: { get: () => `embed:${emb.tipo}:${emb.id}` },
    error: { get: () => null },
    play: { value: tocar },
    pause: { value: () => { s.segurar = false; p?.pausar(); } },
    requestPictureInPicture: { value: () => Promise.reject(new Error("embed")) },
  };
  for (const [k, d] of Object.entries(props)) Object.defineProperty(video, k, { ...d, configurable: true });

  const embed = {
    fechar() {
      if (fechado) return;
      fechado = true;
      clearInterval(relogio); clearTimeout(buscaTimer);
      try { p?.fechar(); } catch {}
      caixa.remove();
      for (const k of Object.keys(props)) delete video[k];
      video.hidden = false;
      video.disableRemotePlayback = tinhaRemoto;
    },
  };

  try {
    p = await sites[emb.tipo](lugar, emb, av);
  } catch (e) {
    console.error("Matinê: embed falhou", e);
    if (!fechado) aoFalhar(`Não consegui abrir o player do ${emb.tipo === "youtube" ? "YouTube" : "Vimeo"}. Confira a internet e tente de novo.`);
    return embed;
  }
  if (fechado) { try { p.fechar(); } catch {} return embed; }
  p.volume(s.vol, s.mudo);
  s.dur = (await p.duracao()) || NaN;
  s.pronto = true;
  solta("loadedmetadata"); solta("durationchange"); solta("canplay");

  // Posição e duração lidas do player a cada 250 ms; entre uma leitura e outra, o relógio daqui completa.
  relogio = setInterval(async () => {
    if (fechado) return;
    const [t, d] = await Promise.all([p.tempo(), p.duracao()]).catch(() => [null, null]);
    if (fechado) return;
    if (d && d !== s.dur) { s.dur = d; solta("durationchange"); }
    if (t != null && !s.buscando) marcar(t);
    if (!s.pausado) solta("timeupdate");
  }, 250);
  return embed;
}
