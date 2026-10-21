import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, onChildAdded, onDisconnect,
  query, limitToLast, serverTimestamp, connectDatabaseEmulator, remove, orderByValue, endAt, limitToFirst,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig, chaveFirebase, chaveDriveFixa } from "./config.js";
import { esperado, correcao, ehNovidade, emContagem, linkDoVideo, novoCodigo, codigoValido, limparTitulo, chaveValida, lerHash, montarHash } from "./sync.js";
import { buscarCapa } from "./capa.js";
import { abrirVideo } from "./video.js";
import { iniciarControles } from "./controles.js";

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
// Rodando no próprio computador (testes): usa o Firebase de mentira, nunca o de verdade.
const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const doLink = lerHash(location.hash);
// A chave vem do convite ou fica guardada neste aparelho depois da primeira vez.
let chave = local ? "teste" : chaveFirebase || doLink.chave || guardado("matine-chave");
if (doLink.chave) guardar("matine-chave", doLink.chave);

// Chave do Google Drive: quem abre a sala cola uma vez (fica neste aparelho) e ela vai junto na sala.
let minhaChaveDrive = chaveDriveFixa || guardado("matine-chave-drive");
const chaveDrive = () => info?.chaveDrive || minhaChaveDrive;
/** Lê a chave do Drive digitada (se tiver) antes de validar um link. */
function lerChaveDrive(campo) {
  const k = campo.value.trim();
  if (chaveValida(k)) { minhaChaveDrive = k; guardar("matine-chave-drive", k); campo.closest(".filme").querySelector(".campoDrive").hidden = true; }
}

let db, auth, offset = 0;
const agora = () => Date.now() + offset;
let codigo = doLink.codigo;
let uid = null, info = null, estado = null;
const r = (p) => ref(db, `salas/${codigo}/${p}`);

/** Primeira vez neste aparelho e sem convite: pede a chave uma vez só. */
function pedirChave(erro) {
  $("textoInicio").textContent = "Primeira vez aqui: cole a chave do Firebase. É só desta vez — depois ela vai junto nos convites.";
  $("campoChave").hidden = false;
  $("erroInicio").textContent = erro || "";
  $("entrar").hidden = true;
  $("chave").focus();
}
$("salvarChave").addEventListener("click", () => {
  const k = $("chave").value.trim();
  if (!chaveValida(k)) { $("erroInicio").textContent = "Essa chave não parece certa. Ela começa com AIza e tem 39 caracteres."; return; }
  guardar("matine-chave", k);
  location.reload();
});

(async function inicio() {
  if (!chaveValida(chave) && !local) { pedirChave(); return; }
  const app = initializeApp({ ...firebaseConfig, apiKey: chave });
  db = getDatabase(app);
  auth = getAuth(app);
  if (local) {
    connectDatabaseEmulator(db, "127.0.0.1", 9000);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
  try { uid = (await signInAnonymously(auth)).user.uid; varrerSalasVazias(); }
  catch (e) {
    console.error(e);
    if (/api-key|API key/i.test(String(e.code || e.message))) {
      try { localStorage.removeItem("matine-chave"); } catch {}
      pedirChave("Essa chave não funcionou. Confira e cole de novo.");
    } else $("textoInicio").textContent = "Não consegui entrar no Firebase. Confira a internet e tente de novo.";
    return;
  }

  if (codigoValido(codigo)) {
    const snap = await get(r("info")).catch(() => null);
    if (snap?.exists()) {
      info = snap.val();
      $("textoInicio").innerHTML = `Você foi chamado para assistir <b style="color:var(--accent)">${esc(info.titulo || "um filme")}</b>.`;
      cartaoCapa($("capaConvite"), info.capa);
      $("entrar").textContent = "Entrar na sala";
      $("entrar").disabled = false;
      return;
    }
    $("erroInicio").textContent = "Essa sala não existe mais. Abra uma nova abaixo.";
  }
  codigo = "";
  $("textoInicio").textContent = "Cole o link de um vídeo, abra a sala e mande o convite.";
  $("campoFilme").hidden = false;
  $("comCodigo").hidden = false;
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
    if (!codigo) await criarSala($("link").value, $("titulo").value, await novaCapa.pronta());
    await entrarNaSala();
  } catch (e) {
    $("erroInicio").textContent = e.message || "Algo deu errado. Tente de novo.";
    $("entrar").disabled = false;
  }
});
$("nome").addEventListener("keydown", (e) => { if (e.key === "Enter") $("entrar").click(); });

async function criarSala(link, titulo, capa) {
  lerChaveDrive($("chaveDrive"));
  const v = linkDoVideo(link, minhaChaveDrive);
  if (v.semChaveDrive) $("campoDrive").hidden = false;
  if (v.erro) throw new Error(v.erro);
  // A regra do banco não deixa sobrescrever uma sala que já existe: se o código já estiver em uso, tenta outro.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    codigo = novoCodigo();
    try {
      await set(r("info"), { dono: uid, link: link.trim(), titulo: titulo.trim() || nomeDoArquivo(link), capa: capa || null, chaveDrive: v.drive ? minhaChaveDrive : null, criada: serverTimestamp() });
      break;
    } catch (e) { if (tentativa === 4) throw new Error("Não consegui criar a sala. Confira as regras do banco (README)."); }
  }
  await set(r("estado"), { tocando: false, pos: 0, em: serverTimestamp(), por: uid });
  history.replaceState(null, "", montarHash(codigo, local || chaveFirebase ? "" : chave));
  info = (await get(r("info"))).val();
}
function nomeDoArquivo(link) {
  try { const n = decodeURIComponent(new URL(link).pathname.split("/").pop() || ""); return (n.includes(".") && limparTitulo(n)) || "Filme"; }
  catch { return "Filme"; }
}

// ---------- Entrar com código ----------
function entrarComCodigo() {
  const c = $("codigoDigitado").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!codigoValido(c)) { $("erroInicio").textContent = "O código tem 6 letras e números, como ABC234."; return; }
  location.hash = c; // o hashchange recarrega a página já na sala
}
$("irCodigo").addEventListener("click", entrarComCodigo);
$("codigoDigitado").addEventListener("keydown", (e) => { if (e.key === "Enter") entrarComCodigo(); });

// ---------- Capa do filme ----------
/** Mostra a capa em `el`. Os dados vêm do banco (escritos por quem abriu a sala): só aceita endereços da Wikipédia. */
function cartaoCapa(el, capa, aoRecusar) {
  const ok = capa && /^https:\/\/upload\.wikimedia\.org\//.test(capa.img) && /^https:\/\/pt\.wikipedia\.org\//.test(capa.pagina);
  el.hidden = !ok;
  el.replaceChildren();
  if (!ok) return;
  const img = Object.assign(document.createElement("img"), { src: capa.img, alt: "", loading: "lazy" });
  const txt = document.createElement("div");
  const t = document.createElement("b"); t.textContent = capa.titulo;
  const p = document.createElement("p"); p.textContent = capa.resumo;
  const fonte = document.createElement("small");
  fonte.append("Fonte: ", Object.assign(document.createElement("a"), { href: capa.pagina, target: "_blank", rel: "noopener", textContent: "Wikipédia" }));
  txt.append(t, p, fonte);
  if (aoRecusar) {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: "Não é esse filme" });
    b.onclick = aoRecusar;
    txt.append(b);
  }
  el.append(img, txt);
}

/** Busca a capa enquanto a pessoa digita o link ou o nome (espera ela parar de digitar). */
function capaAoDigitar(campoLink, campoTitulo, el) {
  let escolhida = null, busca = Promise.resolve(null), timer = 0, vez = 0;
  const buscar = () => {
    const termo = campoTitulo.value.trim() || (campoLink.value.trim() ? limparTitulo(nomeDoArquivo(campoLink.value)) : "");
    const minha = ++vez;
    busca = (termo && termo !== "Filme" ? buscarCapa(termo) : Promise.resolve(null)).then((c) => {
      if (minha !== vez) return escolhida;
      escolhida = c;
      cartaoCapa(el, c, () => { escolhida = null; cartaoCapa(el, null); });
      return escolhida;
    });
  };
  const agendar = () => { clearTimeout(timer); timer = setTimeout(buscar, 600); };
  campoLink.addEventListener("input", agendar);
  campoTitulo.addEventListener("input", agendar);
  return {
    // Na hora de salvar: termina a busca que estava esperando a pessoa parar de digitar.
    pronta() { if (timer) { clearTimeout(timer); timer = 0; buscar(); } return busca.then(() => escolhida); },
    limpar() { escolhida = null; cartaoCapa(el, null); },
  };
}
const novaCapa = capaAoDigitar($("link"), $("titulo"), $("capaNova"));
const capaDaTroca = capaAoDigitar($("novoLink"), $("novoTitulo"), $("capaTroca"));

// ---------- Dentro da sala ----------
let entrouEm = 0;
/** Apaga salas que ficaram vazias há mais de 10 min (as regras do banco só deixam se não tiver ninguém dentro). */
async function varrerSalasVazias() {
  try {
    const antigas = await get(query(ref(db, "vazias"), orderByValue(), endAt(agora() - 10 * 60 * 1000), limitToFirst(20)));
    antigas.forEach((x) => {
      remove(ref(db, `salas/${x.key}`)).then(() => remove(x.ref)).catch(() => remove(x.ref).catch(() => {}));
    });
  } catch (e) { console.warn("Matinê: limpeza de salas vazias falhou", e); }
}

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
    // Fim da sessão: quem sai marca a sala como vazia. Enquanto houver alguém dentro, a marca é apagada na hora;
    // se ninguém ficar, a sala (com chat e tudo) é apagada 10 min depois por quem abrir a Matinê.
    await onDisconnect(ref(db, `vazias/${codigo}`)).set(serverTimestamp()).catch(() => {}); // sem as regras novas: só não marca
    await set(eu, meusDados());
  });
  onValue(ref(db, `vazias/${codigo}`), (s) => { if (s.exists()) remove(s.ref).catch(() => {}); }, () => {});
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
  cartaoCapa($("capaFolha"), info.capa);
  video.poster = $("capaFolha").hidden ? "" : info.capa.img;
  $("trocar").hidden = info.dono !== uid;
  if (!trocou) return;
  const v = linkDoVideo(info.link, chaveDrive());
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
  else { filmeAberto = aberto; urlDoFilme = url; verTvDisponivel(); if (naTvApp) tvLigou(); }
}

// ---------- Sincronia do vídeo ----------
// Regra de ouro: o vídeo daqui só manda algo para a sala quando faz uma coisa que a sala ainda não sabe.
// Quando ele está só obedecendo a sala, ehNovidade() dá falso e nada volta (sem eco, sem marcas com tempo).
function aplicar() {
  if (!estado || video.readyState < 1) return; // loadedmetadata chama de novo
  const alvo = esperado(estado, agora());
  if (naTvApp) window.Matine.tvEstado(estado.tocando && !emContagem(estado, agora()), alvo); // a TV segue a sala
  // Play com contagem: todo mundo espera parado no ponto certo e começa junto quando o relógio chegar.
  if (emContagem(estado, agora())) {
    video.playbackRate = 1;
    if (!video.paused) video.pause();
    if (Math.abs(video.currentTime - alvo) > 0.3) irPara(alvo);
    mostrarContagem();
    return;
  }
  esconderContagem();
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
/** `daquiA` (ms): o estado só começa a valer depois desse tempo — é a contagem 3, 2, 1. */
function enviar(tocando, daquiA = 0) {
  const em = daquiA ? agora() + daquiA : serverTimestamp();
  const s = { tocando, pos: video.currentTime, em, por: uid };
  estado = { ...s, em: daquiA ? em : agora() }; // já vale aqui, antes da volta do servidor
  set(r("estado"), s).catch(() => toast("Não consegui avisar a sala."));
  aplicar();
}

video.addEventListener("loadedmetadata", aplicar);
video.addEventListener("play", () => {
  if (!estado) return;
  if (emContagem(estado, agora())) { video.pause(); return; } // já está contando: espera o "já"
  if (!ehNovidade(estado, true, video.currentTime, agora())) return;
  // Sala parada e alguém deu play: conta 3, 2, 1 para todos. Sala já tocando (ex.: voltei de uma travada): só alcança.
  if (!estado.tocando) enviar(true, 3000);
  else enviar(true);
});
video.addEventListener("pause", () => {
  // Tela bloqueada ou app trocado: o sistema pausa sozinho, isso não pausa a sala.
  if (document.hidden || video.readyState < 1) return;
  if (estado && emContagem(estado, agora())) return; // pausa da própria contagem
  if (estado && ehNovidade(estado, false, video.currentTime, agora())) enviar(false);
});
video.addEventListener("seeked", () => {
  if (pulando) { pulando = false; return; }
  if (estado && emContagem(estado, agora())) { aplicar(); return; } // mexer na barra durante a contagem não vale
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
  avisar(motivo, "Tentar de novo", () => { const v = linkDoVideo(info?.link, chaveDrive()); if (v.url) carregarFilme(v.url); });
});

// ---------- Contagem 3, 2, 1 ----------
let contagemTimer = 0, numeroMostrado = 0;
function mostrarContagem() {
  const quem = estado.por === uid ? "" : pessoas[estado.por]?.nome;
  $("textoContagem").textContent = quem ? `${quem} deu o play` : "Começando junto…";
  $("contagem").classList.add("on");
  if (contagemTimer) return;
  numeroMostrado = 0;
  contagemTimer = setInterval(() => {
    const falta = estado.em - agora();
    if (falta <= 0) { esconderContagem(); aplicar(); return; }
    const n = Math.min(3, Math.ceil(falta / 1000));
    if (n === numeroMostrado) return;
    numeroMostrado = n;
    const b = $("numeroContagem");
    b.textContent = n;
    b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    try { navigator.vibrate?.(30); } catch {}
  }, 50);
}
function esconderContagem() {
  clearInterval(contagemTimer);
  contagemTimer = 0;
  $("contagem").classList.remove("on");
}

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
    linha.dataset.nome = m.uid === uid ? meuNome : m.nome || "?";
    linha.dataset.texto = m.texto;
    const b = document.createElement("div");
    b.className = "bubble";
    if (m.uid !== uid) { const n = document.createElement("small"); n.style.color = corDe(m.nome || "?"); n.textContent = m.nome || "?"; b.appendChild(n); }
    if (m.resp?.texto) {
      const cita = document.createElement("div");
      cita.className = "cita";
      const quem = document.createElement("b"); quem.textContent = String(m.resp.nome || "?").slice(0, 24);
      cita.append(quem, String(m.resp.texto).slice(0, 80));
      b.appendChild(cita);
    }
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
  push(r("chat"), { uid, nome: meuNome, texto, resp: respondendo, em: serverTimestamp() }).catch(() => toast("A mensagem não foi."));
  responder(null);
  $("texto").value = "";
  $("enviar").classList.remove("on");
  clearTimeout(digitandoTimer); digitandoTimer = 0; marcarDigitando(false);
});

// ---------- Responder uma mensagem (arrastar para o lado ou toque duplo) ----------
let respondendo = null;
function responder(linha) {
  respondendo = linha ? { nome: linha.dataset.nome, texto: linha.dataset.texto.slice(0, 80) } : null;
  $("resposta").hidden = !respondendo;
  if (!respondendo) return;
  $("respostaNome").textContent = respondendo.nome;
  $("respostaTexto").textContent = respondendo.texto;
  $("texto").focus();
}
$("cancelarResposta").addEventListener("click", () => responder(null));
$("chat").addEventListener("dblclick", (e) => { const l = e.target.closest(".msg"); if (l) responder(l); });
let arrasto = null;
$("chat").addEventListener("pointerdown", (e) => {
  const linha = e.target.closest(".msg");
  if (linha && e.pointerType !== "mouse") arrasto = { linha, x: e.clientX, y: e.clientY, dx: 0 };
});
$("chat").addEventListener("pointermove", (e) => {
  if (!arrasto) return;
  const dx = e.clientX - arrasto.x;
  if (Math.abs(e.clientY - arrasto.y) > 30) { soltar(); return; } // está rolando o chat, não arrastando
  arrasto.dx = Math.max(0, Math.min(80, dx));
  arrasto.linha.style.transform = `translateX(${arrasto.dx}px)`;
});
function soltar() {
  if (!arrasto) return;
  const { linha, dx } = arrasto;
  arrasto = null;
  linha.style.transform = "";
  if (dx > 55) { try { navigator.vibrate?.(15); } catch {} responder(linha); }
}
$("chat").addEventListener("pointerup", soltar);
$("chat").addEventListener("pointercancel", soltar);

// ---------- Tela acesa e janelinha flutuante ----------
let trava = null;
async function manterTelaAcesa(sim) {
  window.Matine?.tocando?.(sim); // app Android: decide se vira janelinha ao sair
  try {
    if (sim && !trava && navigator.wakeLock && !document.hidden) {
      trava = await navigator.wakeLock.request("screen");
      trava.addEventListener("release", () => { trava = null; });
    } else if (!sim && trava) { await trava.release(); trava = null; }
  } catch {} // sem suporte ou bateria fraca: só não segura a tela
}
video.addEventListener("playing", () => manterTelaAcesa(true));
video.addEventListener("pause", () => manterTelaAcesa(false));
video.addEventListener("ended", () => manterTelaAcesa(false));
document.addEventListener("visibilitychange", () => { if (!document.hidden && !video.paused) manterTelaAcesa(true); });

const controles = iniciarControles(video, document.querySelector(".player"));

const temPip = document.pictureInPictureEnabled || video.webkitSupportsPresentationMode?.("picture-in-picture");
$("pip").hidden = !temPip;
$("pip").addEventListener("click", async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (video.requestPictureInPicture) await video.requestPictureInPicture();
    else video.webkitSetPresentationMode("picture-in-picture"); // Safari do iPhone
  } catch { toast("A janelinha só abre com o filme carregado."); }
});

// ---------- Transmitir para a TV ----------
// No app Android: Google Cast nativo (o celular fica mudo e vira controle; a TV segue a sala).
// No Chrome: Remote Playback (o próprio vídeo passa a tocar na TV). No iPhone: AirPlay.
// Só vai para a TV o arquivo original: vídeo convertido na hora (MKV, Dolby…) não dá.
let urlDoFilme = "", naTvApp = false;
const appTv = !!window.Matine?.transmitir && window.Matine.podeTransmitir?.();
const convertido = () => video.src.startsWith("blob:");
function verTvDisponivel() {
  if (appTv) { $("cTv").hidden = false; return; }
  if (video.remote?.watchAvailability && !convertido()) {
    video.remote.cancelWatchAvailability?.().catch(() => {});
    video.remote.watchAvailability((tem) => { $("cTv").hidden = !tem; }).catch(() => { $("cTv").hidden = true; });
  }
}
video.addEventListener("webkitplaybacktargetavailabilitychanged", (e) => { $("cTv").hidden = e.availability !== "available"; });
$("cTv").addEventListener("click", () => {
  if (naTvApp) { window.Matine.pararTv(); return; } // tocar de novo no botão para de transmitir
  if (convertido()) { toast("Esse formato não vai para a TV. Use um link de MP4."); return; }
  if (appTv) { window.Matine.transmitir(urlDoFilme, info?.titulo || "Matinê", info?.capa?.img || "", esperado(estado, agora()), !!estado?.tocando); return; }
  if (video.webkitShowPlaybackTargetPicker) { video.webkitShowPlaybackTargetPicker(); return; }
  video.remote?.prompt().catch((e) => { if (e.name !== "NotAllowedError" && e.name !== "AbortError") toast("Não achei uma TV na sua rede."); });
});
function marcarNaTv(sim) {
  document.body.classList.toggle("na-tv", sim);
  $("textoTv").textContent = sim ? `Passando na TV · ${info?.titulo || ""}` : "";
  controles.mostrar();
}
for (const ev of ["connect", "disconnect"]) video.remote?.addEventListener(ev, () => marcarNaTv(video.remote.state === "connected"));
// Chamados pelo app Android
function tvLigou() { naTvApp = true; video.muted = true; marcarNaTv(true); aplicar(); }
window.tvLigou = tvLigou;
window.tvDesligou = () => { naTvApp = false; video.muted = false; marcarNaTv(false); aplicar(); };
window.tvFalhou = (msg) => { window.tvDesligou(); toast(msg || "A TV não conseguiu tocar esse vídeo."); };
// Alguém mexeu pelo controle da TV: vale como se tivesse mexido aqui (o vídeo daqui avisa a sala).
window.daTv = (tocando, pos) => {
  if (Math.abs(video.currentTime - pos) > 3) video.currentTime = pos;
  if (tocando && video.paused) video.play().catch(() => {});
  else if (!tocando && !video.paused) video.pause();
};
// A TV pode escorregar alguns segundos: a cada 4 s o app confere e acerta.
setInterval(() => { if (naTvApp && estado) window.Matine.tvEstado(estado.tocando && !emContagem(estado, agora()), esperado(estado, agora())); }, 4000);

// ---------- Instalar como app (iPhone) ----------
const noIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
if (noIphone && !instalado && !guardado("matine-dica-instalar")) {
  $("dicaInstalar").hidden = false;
  $("fecharDica").addEventListener("click", () => { $("dicaInstalar").hidden = true; guardar("matine-dica-instalar", "1"); });
}

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
  // Link curto (dmwnezes.com/matine/ABC234); o 404.html leva para a sala. Sem chave fixa, a chave vai no #.
  const levaChave = !local && !chaveFirebase;
  const link = levaChave ? `${location.origin}${location.pathname}${montarHash(codigo, chave)}` : `${location.origin}${location.pathname}${codigo}`;
  const texto = `Vem assistir ${info?.titulo || "um filme"} comigo na Matinê: ${link}`;
  if (window.Matine?.compartilhar) { window.Matine.compartilhar(texto); return; } // app Android
  if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(link); toast("Link copiado"); }
  catch { prompt("Copie o link da sala:", link); }
});
$("trocar").addEventListener("click", () => { $("trocaFilme").hidden = false; $("novoLink").focus(); });
$("salvarFilme").addEventListener("click", async () => {
  const link = $("novoLink").value;
  lerChaveDrive($("novaChaveDrive"));
  const v = linkDoVideo(link, minhaChaveDrive);
  if (v.semChaveDrive) $("campoDriveTroca").hidden = false;
  if (v.erro) { $("erroTroca").textContent = v.erro; return; }
  $("erroTroca").textContent = "";
  try {
    await update(r("info"), { link: link.trim(), titulo: $("novoTitulo").value.trim() || nomeDoArquivo(link), capa: (await capaDaTroca.pronta()) || null, chaveDrive: v.drive ? minhaChaveDrive : null });
    await set(r("estado"), { tocando: false, pos: 0, em: serverTimestamp(), por: uid });
    $("folha").classList.remove("show");
    $("novoLink").value = ""; $("novoTitulo").value = ""; capaDaTroca.limpar();
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
