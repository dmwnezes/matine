import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, onChildAdded, onDisconnect,
  query, limitToLast, serverTimestamp, connectDatabaseEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig, chaveDrive } from "./config.js";
import { esperado, correcao, ehNovidade, linkDoVideo, novoCodigo, codigoValido } from "./sync.js";
import { abrirVideo } from "./video.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const REACOES = ["😂", "😱", "😍", "😢", "🔥", "👏"];

// ---------- Nome e foto (ficam guardados neste aparelho) ----------
const guardado = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const FOTOS = window.MATINE_AVATARS || [];
const svgDa = (k) => FOTOS.find((f) => f[0] === k)?.[2] || "";
let meuNome = guardado("matine-nome");
let minhaFoto = guardado("matine-foto");
if (!svgDa(minhaFoto) && FOTOS.length) minhaFoto = FOTOS[Math.floor(Math.random() * FOTOS.length)][0];

const cores = ["#8E6BE8", "#E8836B", "#5FB8A3", "#E8C14F", "#6FA8E8", "#E56F9C"];
const corDe = (nome) => { let h = 0; for (const c of nome.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) | 0; return cores[((h % cores.length) + cores.length) % cores.length]; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Bolinha da pessoa: a foto escolhida ou a inicial do nome na cor dela. */
const bolinha = (p) => svgDa(p.foto) ? `<span>${svgDa(p.foto)}</span>`
  : `<span style="background:${corDe(p.nome || "?")}">${esc((p.nome || "?").trim().charAt(0).toUpperCase())}</span>`;

$("nome").value = meuNome;
function desenharFotos() {
  $("minhaFoto").innerHTML = svgDa(minhaFoto);
  $("fotos").innerHTML = FOTOS.map(([k, rotulo, svg]) =>
    `<button type="button" data-k="${k}" aria-label="${esc(rotulo)}" aria-pressed="${k === minhaFoto}" class="${k === minhaFoto ? "on" : ""}">${svg}</button>`).join("");
}
$("fotos").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  minhaFoto = b.dataset.k; guardar("matine-foto", minhaFoto); desenharFotos();
});
desenharFotos();

let toastTimer = 0;
function toast(t) { $("toast").textContent = t; $("toast").classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("on"), 2200); }

// ---------- Firebase ----------
if (!firebaseConfig.databaseURL) {
  $("textoInicio").textContent = "Falta configurar o Firebase no config.js (veja o README).";
  throw new Error("config.js vazio");
}
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
// Rodando no próprio computador (npm run teste-sala): usa o Firebase de mentira, nunca o de verdade.
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
const agora = () => Date.now() + offset;

let codigo = decodeURIComponent(location.hash.slice(1)).toUpperCase().trim();
let uid = null, info = null, estado = null;
const r = (p) => ref(db, `salas/${codigo}/${p}`);

(async function inicio() {
  try { uid = (await signInAnonymously(auth)).user.uid; }
  catch (e) { $("textoInicio").textContent = "Não consegui entrar no Firebase. Confira o login anônimo (README, passo 2)."; console.error(e); return; }

  if (codigoValido(codigo)) {
    const snap = await get(r("info")).catch(() => null);
    if (snap?.exists()) {
      info = snap.val();
      $("textoInicio").innerHTML = `Você foi chamado para assistir <b style="color:var(--accent)">${esc(info.titulo || "um filme")}</b>.`;
      $("entrar").textContent = "Entrar na sala";
      $("entrar").disabled = false;
      return;
    }
    $("erroInicio").textContent = "Essa sala não existe mais. Abra uma nova abaixo.";
  }
  codigo = "";
  $("textoInicio").textContent = "Cole o link de um vídeo, abra a sala e mande o convite.";
  $("campoFilme").hidden = false;
  $("entrar").textContent = "Abrir sala";
  $("entrar").disabled = false;
})();

$("entrar").addEventListener("click", async () => {
  meuNome = $("nome").value.trim();
  if (!meuNome) { $("erroInicio").textContent = "Escreva seu nome."; $("nome").focus(); return; }
  guardar("matine-nome", meuNome);
  $("erroInicio").textContent = "";
  $("entrar").disabled = true;
  try {
    if (!codigo) await criarSala($("link").value, $("titulo").value);
    await entrarNaSala();
  } catch (e) {
    $("erroInicio").textContent = e.message || "Algo deu errado. Tente de novo.";
    $("entrar").disabled = false;
  }
});
$("nome").addEventListener("keydown", (e) => { if (e.key === "Enter") $("entrar").click(); });

async function criarSala(link, titulo) {
  const v = linkDoVideo(link, chaveDrive);
  if (v.erro) throw new Error(v.erro);
  // A regra do banco não deixa sobrescrever uma sala que já existe: se o código já estiver em uso, tenta outro.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    codigo = novoCodigo();
    try {
      await set(r("info"), { dono: uid, link: link.trim(), titulo: titulo.trim() || nomeDoArquivo(link), criada: serverTimestamp() });
      break;
    } catch (e) { if (tentativa === 4) throw new Error("Não consegui criar a sala. Confira as regras do banco (README)."); }
  }
  await set(r("estado"), { tocando: false, pos: 0, em: serverTimestamp(), por: uid });
  history.replaceState(null, "", "#" + codigo);
  info = (await get(r("info"))).val();
}
function nomeDoArquivo(link) {
  try { const n = decodeURIComponent(new URL(link).pathname.split("/").pop() || ""); return n.includes(".") ? n.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ") : "Filme"; }
  catch { return "Filme"; }
}

// ---------- Dentro da sala ----------
let entrouEm = 0;
async function entrarNaSala() {
  const eu = r(`pessoas/${uid}`);
  const meusDados = () => ({ nome: meuNome, foto: minhaFoto, entrou: serverTimestamp(), digitando: false });
  // Quando a conexão volta, marca presença de novo (e combina sair sozinho se ela cair).
  onValue(ref(db, ".info/connected"), async (s) => {
    const on = s.val() === true;
    $("sync").textContent = on ? "ao vivo" : "sem conexão";
    $("sync").className = "sync " + (on ? "ok" : "off");
    if (!on) return;
    await onDisconnect(eu).remove();
    await set(eu, meusDados());
  });
  entrouEm = agora();

  $("inicio").hidden = true;
  $("sala").classList.add("on");
  ajustarTela();

  onValue(r("info"), (s) => { if (s.exists()) mudouInfo(s.val()); });
  onValue(r("estado"), (s) => { if (s.exists()) { estado = s.val(); aplicar(); } });
  onValue(r("pessoas"), (s) => mudouPessoas(s.val() || {}));
  onChildAdded(query(r("chat"), limitToLast(100)), (s) => mostrarMensagem(s.val()));
  onChildAdded(query(r("reacoes"), limitToLast(1)), (s) => { const x = s.val(); if (x.em >= entrouEm - 2000) flutuar(x); });
}

function mudouInfo(novo) {
  const trocou = !info || novo.link !== info.link || !video.src;
  info = novo;
  $("tituloMini").textContent = info.titulo || "Filme";
  $("codigoMini").textContent = codigo;
  document.title = `${info.titulo || "Filme"} · Matinê`;
  $("trocar").hidden = info.dono !== uid;
  if (!trocou) return;
  const v = linkDoVideo(info.link, chaveDrive);
  if (v.erro) { avisar(v.erro); return; }
  carregarFilme(v.url);
}

let filmeAberto = null;
async function carregarFilme(url) {
  esconderAviso();
  filmeAberto?.fechar();
  filmeAberto = null;
  const meu = (carregarFilme.vez = (carregarFilme.vez || 0) + 1);
  const aberto = await abrirVideo(video, url, (msg) => avisar(msg, "Tentar de novo", () => carregarFilme(url)));
  if (meu !== carregarFilme.vez) aberto.fechar(); // trocaram o filme enquanto este abria
  else filmeAberto = aberto;
}

// ---------- Sincronia do vídeo ----------
// Regra de ouro: o vídeo daqui só manda algo para a sala quando faz uma coisa que a sala ainda não sabe.
// Quando ele está só obedecendo a sala, ehNovidade() dá falso e nada volta (sem eco, sem marcas com tempo).
function aplicar() {
  if (!estado || video.readyState < 1) return; // loadedmetadata chama de novo
  const alvo = esperado(estado, agora());
  if (!estado.tocando) {
    video.playbackRate = 1;
    if (!video.paused) video.pause();
    if (Math.abs(video.currentTime - alvo) > 0.3) irPara(alvo);
    return;
  }
  if (Math.abs(video.currentTime - alvo) > 1.5) irPara(alvo);
  if (video.paused && !document.hidden) {
    video.play().then(esconderAviso).catch((e) => {
      if (e.name === "NotAllowedError") avisar("A sala já está passando o filme.", "Entrar no ritmo", () => video.play().then(esconderAviso).catch(() => {}));
    });
  }
}
// Pulo que a sala mandou: o "seeked" dele não volta para a sala, nem se o vídeo cair em outro ponto
// (link sem suporte a pulo cai no 0 — e mandar esse 0 para a sala jogaria todo mundo para o começo).
let pulando = false;
function irPara(t) { pulando = true; video.currentTime = t; }
function enviar(tocando) {
  const s = { tocando, pos: video.currentTime, em: serverTimestamp(), por: uid };
  estado = { ...s, em: agora() }; // já vale aqui, antes da volta do servidor
  set(r("estado"), s).catch(() => toast("Não consegui avisar a sala."));
}

video.addEventListener("loadedmetadata", aplicar);
video.addEventListener("play", () => { if (estado && ehNovidade(estado, true, video.currentTime, agora())) enviar(true); });
video.addEventListener("pause", () => {
  // Tela bloqueada ou app trocado: o sistema pausa sozinho, isso não pausa a sala.
  if (document.hidden || video.readyState < 1) return;
  if (estado && ehNovidade(estado, false, video.currentTime, agora())) enviar(false);
});
video.addEventListener("seeked", () => {
  if (pulando) { pulando = false; return; }
  if (estado && ehNovidade(estado, !video.paused, video.currentTime, agora())) enviar(!video.paused);
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) aplicar(); });

// A cada segundo, encosta na sala acelerando/freando de leve; se estiver muito longe, pula.
setInterval(() => {
  if (!estado?.tocando || video.paused || video.seeking || video.readyState < 3) return;
  const c = correcao(video.currentTime - esperado(estado, agora()));
  if (c.pular) irPara(esperado(estado, agora()));
  else video.playbackRate = c.velocidade;
}, 1000);

video.addEventListener("error", () => {
  const motivo = {
    2: "A internet caiu no meio do carregamento.",
    3: "O arquivo veio com defeito.",
    4: "Não consegui abrir esse vídeo. O link pode ser privado, ter passado do limite de downloads do Google Drive ou estar num formato que este aparelho não toca.",
  }[video.error?.code] || "Não consegui tocar o vídeo.";
  avisar(motivo, "Tentar de novo", () => { const v = linkDoVideo(info?.link, chaveDrive); if (v.url) carregarFilme(v.url); });
});

function avisar(texto, botao, acao) {
  const a = $("aviso");
  a.innerHTML = `<p>${esc(texto)}</p>` + (botao ? `<button class="btn" type="button">${esc(botao)}</button>` : "");
  if (botao) a.querySelector("button").onclick = acao;
  a.classList.add("show");
}
function esconderAviso() { $("aviso").classList.remove("show"); }

// ---------- Pessoas ----------
let pessoas = {}, primeiraLista = true;
function mudouPessoas(novas) {
  if (!primeiraLista) {
    for (const [id, p] of Object.entries(novas)) if (!pessoas[id] && id !== uid) linhaSistema(`${p.nome} entrou`);
    for (const [id, p] of Object.entries(pessoas)) if (!novas[id] && id !== uid) linhaSistema(`${p.nome} saiu`);
  }
  primeiraLista = false;
  pessoas = novas;
  const lista = Object.entries(pessoas).sort(([a], [b]) => (a === uid ? -1 : b === uid ? 1 : 0));
  $("bolas").innerHTML = lista.slice(0, 4).map(([, p]) => bolinha(p)).join("");
  $("nomes").textContent = lista.length > 1 ? lista.map(([id, p]) => id === uid ? "Você" : p.nome).join(", ") : "Só você por enquanto";
  $("quem").innerHTML = lista.map(([id, p]) => `<div class="p ${id === uid ? "eu" : ""}">${bolinha(p)}<div>${id === uid ? "Você" : esc(p.nome)}</div></div>`).join("");
  const digitando = lista.filter(([id, p]) => id !== uid && p.digitando).map(([, p]) => p.nome);
  $("digitando").classList.toggle("on", digitando.length > 0);
  $("textoDigitando").textContent = digitando.length ? `${digitando.join(", ")} ${digitando.length > 1 ? "estão" : "está"} digitando…` : "";
}

// ---------- Chat ----------
function rolarSeNoFim(fn) {
  const c = $("chat"), noFim = c.scrollHeight - c.scrollTop - c.clientHeight < 60;
  c.querySelector(".empty")?.remove();
  fn(c);
  if (noFim) c.scrollTop = c.scrollHeight;
}
function mostrarMensagem(m) {
  rolarSeNoFim((c) => {
    const linha = document.createElement("div");
    linha.className = "msg" + (m.uid === uid ? " mine" : "");
    const b = document.createElement("div");
    b.className = "bubble";
    if (m.uid !== uid) { const n = document.createElement("small"); n.style.color = corDe(m.nome || "?"); n.textContent = m.nome || "?"; b.appendChild(n); }
    b.appendChild(document.createTextNode(m.texto));
    linha.appendChild(b);
    c.appendChild(linha);
  });
}
function linhaSistema(t) { rolarSeNoFim((c) => { const d = document.createElement("div"); d.className = "sys"; d.textContent = t; c.appendChild(d); }); }

let digitandoTimer = 0;
function marcarDigitando(sim) { if (uid && codigo) update(r(`pessoas/${uid}`), { digitando: sim }).catch(() => {}); }
$("texto").addEventListener("input", () => {
  $("enviar").classList.toggle("on", $("texto").value.trim() !== "");
  if (!digitandoTimer) marcarDigitando(true);
  clearTimeout(digitandoTimer);
  digitandoTimer = setTimeout(() => { digitandoTimer = 0; marcarDigitando(false); }, 2500);
});
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = $("texto").value.trim();
  if (!texto) return;
  push(r("chat"), { uid, nome: meuNome, texto, em: serverTimestamp() }).catch(() => toast("A mensagem não foi."));
  $("texto").value = "";
  $("enviar").classList.remove("on");
  clearTimeout(digitandoTimer); digitandoTimer = 0; marcarDigitando(false);
});

// ---------- Reações ----------
$("reacoes").innerHTML = REACOES.map((e) => `<button type="button" aria-label="Reagir ${e}">${e}</button>`).join("");
$("reacoes").addEventListener("click", (ev) => {
  const b = ev.target.closest("button"); if (!b) return;
  push(r("reacoes"), { uid, nome: meuNome, e: b.textContent, em: serverTimestamp() }).catch(() => {});
});
function flutuar(x) {
  if (!REACOES.includes(x.e)) return;
  const f = document.createElement("div");
  f.className = "float";
  f.style.left = `${10 + Math.random() * 75}%`;
  f.innerHTML = `<b>${x.e}</b><span>${esc(x.uid === uid ? "você" : x.nome || "")}</span>`;
  $("flutuantes").appendChild(f);
  setTimeout(() => f.remove(), 2700);
}

// ---------- Folha: convidar e trocar filme ----------
$("mini").addEventListener("click", () => { $("codigoFolha").textContent = codigo; $("trocaFilme").hidden = true; $("folha").classList.add("show"); });
$("fechar").addEventListener("click", () => $("folha").classList.remove("show"));
$("folha").addEventListener("click", (e) => { if (e.target.id === "folha") $("folha").classList.remove("show"); });
$("convidar").addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}#${codigo}`;
  const texto = `Vem assistir ${info?.titulo || "um filme"} comigo na Matinê: ${link}`;
  if (window.Matine?.compartilhar) { window.Matine.compartilhar(texto); return; } // app Android
  if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(link); toast("Link copiado"); }
  catch { prompt("Copie o link da sala:", link); }
});
$("trocar").addEventListener("click", () => { $("trocaFilme").hidden = false; $("novoLink").focus(); });
$("salvarFilme").addEventListener("click", async () => {
  const link = $("novoLink").value;
  const v = linkDoVideo(link, chaveDrive);
  if (v.erro) { $("erroTroca").textContent = v.erro; return; }
  $("erroTroca").textContent = "";
  try {
    await update(r("info"), { link: link.trim(), titulo: $("novoTitulo").value.trim() || nomeDoArquivo(link) });
    await set(r("estado"), { tocando: false, pos: 0, em: serverTimestamp(), por: uid });
    $("folha").classList.remove("show");
    $("novoLink").value = ""; $("novoTitulo").value = "";
  } catch { $("erroTroca").textContent = "Não consegui trocar o filme."; }
});

// ---------- Layout: teclado aberto e celular deitado ----------
const vv = window.visualViewport;
const deitado = matchMedia("(orientation: landscape)");
const toque = matchMedia("(pointer: coarse)");
function ajustarTela() {
  const st = document.documentElement.style;
  st.setProperty("--vv-h", `${vv ? vv.height : innerHeight}px`);
  st.setProperty("--vv-top", `${vv ? vv.offsetTop : 0}px`);
  document.body.classList.toggle("kb", toque.matches && document.activeElement === $("texto"));
  document.body.classList.toggle("land", deitado.matches);
}
vv?.addEventListener("resize", ajustarTela);
vv?.addEventListener("scroll", ajustarTela);
addEventListener("resize", ajustarTela);
deitado.addEventListener("change", ajustarTela);
$("texto").addEventListener("focus", () => setTimeout(ajustarTela, 50));
$("texto").addEventListener("blur", () => setTimeout(ajustarTela, 50));
addEventListener("hashchange", () => location.reload());
