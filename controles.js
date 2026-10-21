// Controles próprios do player, iguais em todo aparelho, com gestos:
// toque mostra/esconde · toque duplo nos lados volta/avança 10 s (cada toque a mais soma 10) ·
// toque duplo no meio dá play/pausa · deslizar na esquerda muda o brilho, na direita o volume.
// Play, pausa e pulos passam pelo próprio <video>, então a sala sincroniza sozinha (app.js).

/** Lado da tela tocado: esquerda, meio ou direita (em terços). */
export const ladoDoToque = (x, largura) => (x < largura / 3 ? "esq" : x > (largura * 2) / 3 ? "dir" : "meio");

/** 83 → "1:23" · 3725 → "1:02:05". */
export function tempo(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${seg}` : `${m}:${seg}`;
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

export function iniciarControles(video, player) {
  const $ = (id) => document.getElementById(id);
  const app = window.Matine; // app Android: brilho e volume do próprio celular
  const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  let brilho = app?.brilhoAtual?.() ?? 1;
  let volume = app?.volumeAtual?.() ?? video.volume;

  // ---------- Mostrar e esconder ----------
  let esconderTimer = 0;
  function mostrar() {
    player.classList.add("com-controles");
    clearTimeout(esconderTimer);
    if (!video.paused) esconderTimer = setTimeout(() => player.classList.remove("com-controles"), 3000);
  }
  video.addEventListener("pause", mostrar);
  video.addEventListener("play", mostrar);
  player.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") mostrar(); });
  mostrar();

  // ---------- Botões e barra ----------
  const atualizarPlay = () => {
    $("cPlay").classList.toggle("tocando", !video.paused);
    $("cPlay").setAttribute("aria-label", video.paused ? "Tocar" : "Pausar");
  };
  video.addEventListener("play", atualizarPlay);
  video.addEventListener("pause", atualizarPlay);
  const alternar = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  $("cPlay").addEventListener("click", () => { alternar(); mostrar(); });

  let arrastandoBarra = false;
  const barra = $("cBarra");
  function atualizarBarra() {
    const d = video.duration;
    if (!arrastandoBarra && isFinite(d) && d > 0) barra.value = Math.round((video.currentTime / d) * 1000);
    $("cTempo").textContent = `${tempo(arrastandoBarra ? (barra.value / 1000) * d : video.currentTime)} / ${isFinite(d) ? tempo(d) : "--:--"}`;
    barra.style.setProperty("--p", `${barra.value / 10}%`);
  }
  video.addEventListener("timeupdate", atualizarBarra);
  video.addEventListener("durationchange", atualizarBarra);
  barra.addEventListener("input", () => { arrastandoBarra = true; atualizarBarra(); mostrar(); });
  barra.addEventListener("change", () => {
    arrastandoBarra = false;
    if (isFinite(video.duration)) video.currentTime = (barra.value / 1000) * video.duration;
  });

  // Carregando: rodinha no meio
  video.addEventListener("waiting", () => player.classList.add("carregando"));
  for (const ev of ["playing", "canplay", "seeked", "pause"]) video.addEventListener(ev, () => player.classList.remove("carregando"));

  // ---------- Tela cheia ----------
  const telaCheia = () => document.fullscreenElement || document.webkitFullscreenElement;
  $("cTela").addEventListener("click", async () => {
    try {
      if (telaCheia()) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (player.requestFullscreen) {
        await player.requestFullscreen({ navigationUI: "hide" });
        await screen.orientation?.lock?.("landscape").catch(() => {});
      } else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone: tela cheia do próprio sistema
    } catch {}
  });
  document.addEventListener("fullscreenchange", () => player.classList.toggle("cheia", !!telaCheia()));

  // ---------- Aviso no meio (±10 s, brilho, volume, play) ----------
  let avisoTimer = 0;
  function avisar(texto, lado = "meio") {
    const f = $("cAviso");
    f.textContent = texto;
    f.className = `aviso-gesto on ${lado}`;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => f.classList.remove("on"), 700);
  }

  // ---------- Gestos ----------
  const area = $("cGestos");
  let toque = null, ultimo = { t: 0, lado: "" }, umToqueTimer = 0, pulo = 0;
  area.addEventListener("pointerdown", (e) => {
    toque = { x: e.clientX, y: e.clientY, modo: "", inicio: 0 };
    area.setPointerCapture?.(e.pointerId);
  });
  area.addEventListener("pointermove", (e) => {
    if (!toque || e.pointerType === "mouse" && e.buttons === 0) return;
    const dx = e.clientX - toque.x, dy = e.clientY - toque.y;
    const r = area.getBoundingClientRect();
    if (!toque.modo && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      const esq = toque.x - r.left < r.width / 2;
      if (!esq && ehIphone && !app) { toque.modo = "nada"; return; } // o iPhone não deixa o site mudar o volume
      toque.modo = esq ? "brilho" : "volume";
      toque.inicio = esq ? brilho : volume;
    }
    if (toque.modo === "brilho") {
      brilho = limitar(toque.inicio - dy / (r.height * 0.8), 0.15, 1);
      if (app?.brilho) app.brilho(brilho); else video.style.filter = brilho < 1 ? `brightness(${brilho})` : "";
      avisar(`☀ ${Math.round(brilho * 100)}%`, "esq");
    } else if (toque.modo === "volume") {
      volume = limitar(toque.inicio - dy / (r.height * 0.8), 0, 1);
      if (app?.volume) app.volume(volume); else { video.volume = volume; video.muted = volume === 0; }
      avisar(`${volume === 0 ? "🔇" : "🔊"} ${Math.round(volume * 100)}%`, "dir");
    }
  });
  area.addEventListener("pointerup", (e) => {
    if (!toque) return;
    const arrastou = toque.modo !== "";
    toque = null;
    if (arrastou) return;
    const r = area.getBoundingClientRect();
    const lado = ladoDoToque(e.clientX - r.left, r.width);
    const agora = performance.now();
    const duplo = agora - ultimo.t < 320 && lado === ultimo.lado;
    // Seguindo os toques no mesmo lado logo depois de um pulo: soma mais 10 s.
    const emSequencia = pulo && agora - ultimo.t < 650 && lado === ultimo.lado && lado !== "meio";
    ultimo = { t: agora, lado };
    clearTimeout(umToqueTimer);
    if (duplo || emSequencia) {
      if (lado === "meio") { alternar(); avisar(video.paused ? "▶" : "❚❚"); return; }
      pulo += 10;
      const passo = lado === "esq" ? -10 : 10;
      if (isFinite(video.duration)) video.currentTime = limitar(video.currentTime + passo, 0, video.duration - 0.5);
      avisar(`${lado === "esq" ? "«" : "»"} ${pulo} s`, lado);
      umToqueTimer = setTimeout(() => { pulo = 0; }, 650);
      return;
    }
    pulo = 0;
    umToqueTimer = setTimeout(() => {
      if (player.classList.contains("com-controles") && !video.paused) { clearTimeout(esconderTimer); player.classList.remove("com-controles"); }
      else mostrar();
    }, 330);
  });
  area.addEventListener("pointercancel", () => { toque = null; });
  // Teclado (computador): espaço, setas e F
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || !document.getElementById("sala").classList.contains("on")) return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); alternar(); mostrar(); }
    else if (e.key === "ArrowLeft") { video.currentTime = Math.max(0, video.currentTime - 10); avisar("« 10 s", "esq"); }
    else if (e.key === "ArrowRight") { video.currentTime += 10; avisar("» 10 s", "dir"); }
    else if (e.key === "f") $("cTela").click();
  });

  atualizarPlay();
  atualizarBarra();
  return { mostrar };
}
