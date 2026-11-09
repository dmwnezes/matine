import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, onChildAdded, onDisconnect,
  query, limitToLast, serverTimestamp, connectDatabaseEmulator, remove,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig, chaveFirebase, chaveDriveFixa } from "./config.js";
import { esperado, correcao, emContagem, linkDoVideo, novoCodigo, codigoValido, limparTitulo, chaveValida, lerHash, montarHash, quemDecide, todosProntos, pastaDoDrive } from "./sync.js";
import { buscarCapa, capaValida, anoDoNome } from "./capa.js";
import { abrirVideo, adiante } from "./video.js";
import { abrirCofre, apagarCofre, iniciarServiceWorker } from "./cofre.js";
import { testarLink, listarPasta } from "./drive.js";
import { iniciarControles, tempo } from "./controles.js";
import { iniciarBrotos, comandoBrotos } from "./brotos.js";
import { comandoEfeito, sortearValor, valorValido, textoDoEfeito, rodarEfeito } from "./efeitos.js";
import { fotoParaChat, fotoValida } from "./fotos.js";
import { novaLista, listaValida, organizar, jaNaFila } from "./lista.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const REACOES = ["😂", "😱", "😍", "😢", "🔥", "👏"];
iniciarServiceWorker();

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
const bolinha = (p, id = "") => svgDa(p.foto) ? `<span data-uid="${esc(id)}">${svgDa(p.foto)}</span>`
  : `<span data-uid="${esc(id)}" style="background:${corDe(p.nome || "?")}">${esc((p.nome || "?").trim().charAt(0).toUpperCase())}</span>`;

// ---------- Ajustes (ficam neste aparelho) ----------
const CORES_BALAO = ["#9B8CFF", "#E6C14F", "#5FB873", "#6FA8E8", "#E8839E", "#E8A06B"];
let corBalao = CORES_BALAO.includes(guardado("matine-cor")) ? guardado("matine-cor") : CORES_BALAO[0];
const aplicarLetra = () => { document.body.dataset.letra = ["p", "m", "g"].includes(guardado("matine-letra")) ? guardado("matine-letra") : "m"; };
aplicarLetra();
const vibrar = (ms) => { if (guardado("matine-vibrar") !== "nao") try { navigator.vibrate?.(ms); } catch {} };

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
  // Sem convite: a tela inicial é a lista compartilhada "Para ver depois".
  if ($("erroInicio").textContent) toast($("erroInicio").textContent);
  await abrirCasa();
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

async function criarSala(link, titulo, capa, daLista = null, pos = 0) {
  lerChaveDrive($("chaveDrive"));
  const v = linkDoVideo(link, minhaChaveDrive);
  if (v.semChaveDrive) $("campoDrive").hidden = false;
  if (v.erro) throw new Error(v.erro);
  // A regra do banco não deixa sobrescrever uma sala que já existe: se o código já estiver em uso, tenta outro.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    codigo = novoCodigo();
    try {
      await set(r("info"), { dono: uid, link: link.trim(), titulo: titulo.trim() || nomeDoArquivo(link), capa: capa || null, chaveDrive: v.drive ? minhaChaveDrive : null, criada: serverTimestamp(), lista: listaValida(minhaLista) ? minhaLista : null, item: daLista });
      break;
    } catch (e) { if (tentativa === 4) throw new Error("Não consegui criar a sala. Confira as regras do banco (README)."); }
  }
  await set(r("estado"), { tocando: false, pos, em: serverTimestamp(), por: uid });
  lembrarSala(codigo);
  // Já nasce marcada como vazia: se o app fechar antes de entrar, a sala não fica para sempre no banco.
  await set(ref(db, `vazias/${codigo}`), serverTimestamp()).catch(() => {});
  history.replaceState(null, "", montarHash(codigo, local || chaveFirebase ? "" : chave));
  info = (await get(r("info"))).val();
}
function nomeDoArquivo(link) {
  try { const n = decodeURIComponent(new URL(link).pathname.split("/").pop() || ""); return (n.includes(".") && limparTitulo(n)) || "Filme"; }
  catch { return "Filme"; }
}

// ---------- Tela inicial: lista compartilhada "Para ver depois" ----------
// A lista mora no banco em listas/<código>. Quem entra numa sala aberta pela lista passa a ver a mesma
// lista (o código vai junto na sala); dá também para mandar o link "#lista=…".
let minhaLista = guardado("matine-lista");
let filmes = {}, paraAbrir = null, desligarLista = null;
const fl = (p = "") => ref(db, `listas/${minhaLista}/filmes${p}`);

/** Passa a usar a lista [nova]; o que estava só na lista antiga deste aparelho vai junto. */
async function adotarLista(nova) {
  if (!listaValida(nova) || nova === minhaLista) return;
  const velha = minhaLista;
  minhaLista = nova; guardar("matine-lista", nova);
  if (!listaValida(velha)) return;
  try {
    const antigos = (await get(ref(db, `listas/${velha}/filmes`))).val() || {};
    const atuais = (await get(fl())).val() || {};
    for (const f of Object.values(antigos)) if (!f.visto && !jaNaFila(atuais, f.link)) await push(fl(), f);
  } catch (e) { console.warn("Matinê: não consegui juntar as listas", e); }
}

async function abrirCasa() {
  if (doLink.lista) { await adotarLista(doLink.lista); history.replaceState(null, "", location.pathname); }
  if (!listaValida(minhaLista)) { minhaLista = novaLista(); guardar("matine-lista", minhaLista); }
  $("inicio").hidden = true;
  $("casa").hidden = false;
  $("casaEu").innerHTML = svgDa(minhaFoto);
  desligarLista?.();
  desligarLista = onValue(fl(), (s) => { filmes = s.val() || {}; desenharCasa(); }, (e) => {
    console.error(e);
    toast("Não consegui abrir a lista. Confira as regras do banco (README).");
  });
}

const CORES_CAPA = [["#3b2a7a", "#e5737a"], ["#16405b", "#5fb8a3"], ["#2b2140", "#e6c14f"], ["#3a1f4f", "#9b8cff"], ["#1d3a2a", "#5fb873"], ["#4a2a1a", "#e8836b"]];
const capaOk = capaValida;
/** Capa do filme (do TMDB) ou, sem capa, um cartaz com a inicial do título. */
function poster(f) {
  const el = document.createElement("div");
  el.className = "poster";
  let h = 0; for (const ch of f.titulo || "") h = (h * 31 + ch.charCodeAt(0)) | 0;
  const [a, b] = CORES_CAPA[Math.abs(h) % CORES_CAPA.length];
  el.style.setProperty("--c1", a); el.style.setProperty("--c2", b);
  if (capaOk(f.capa)) el.append(Object.assign(document.createElement("img"), { src: f.capa.img, alt: "", loading: "lazy" }));
  else el.append(Object.assign(document.createElement("span"), { className: "letra", textContent: (f.titulo || "?").trim().charAt(0).toUpperCase() }));
  return el;
}
const quando = (ms) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
function itemLista(f, legenda) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "item-lista";
  b.setAttribute("aria-label", f.titulo);
  const t = document.createElement("b"); t.textContent = f.titulo;
  const s = document.createElement("small"); s.textContent = legenda;
  b.append(poster(f), t, s);
  b.onclick = () => abrirDetalhe(f);
  return b;
}

function desenharCasa() {
  const { proxima, fila, vistos } = organizar(filmes);
  $("abaVer").textContent = `Para ver · ${fila.length + (proxima ? 1 : 0)}`;
  $("abaVistos").textContent = `Já vimos · ${vistos.length}`;
  $("marquise").hidden = !proxima;
  $("vazio").hidden = !!proxima;
  if (proxima) {
    $("marquise").style.backgroundImage = capaOk(proxima.capa) ? `url("${proxima.capa.img}")` : "";
    $("proxTitulo").textContent = proxima.titulo;
    $("proxQuem").textContent = [proxima.nome && `Guardado por ${proxima.nome}`, proxima.parou && `parou em ${tempo(proxima.parou.pos)}`].filter(Boolean).join(" · ");
  }
  $("filaTitulo").hidden = !fila.length;
  $("fila").replaceChildren(...fila.map((f) => itemLista(f, f.nome ? `por ${f.nome}` : "")));
  $("gradeVistos").replaceChildren(...vistos.map((f) => itemLista(f, `Visto em ${quando(f.visto)}`)));
  $("vazioVistos").hidden = vistos.length > 0;
  paraAbrir = proxima;
}

function mostrarAba(vistos) {
  $("paraVer").hidden = vistos; $("vistos").hidden = !vistos;
  $("abaVer").classList.toggle("on", !vistos); $("abaVistos").classList.toggle("on", vistos);
  $("abaVer").setAttribute("aria-selected", !vistos); $("abaVistos").setAttribute("aria-selected", vistos);
}
$("abaVer").addEventListener("click", () => mostrarAba(false));
$("abaVistos").addEventListener("click", () => mostrarAba(true));
$("casaEu").addEventListener("click", () => abrirAjustes());
$("abrirAjustesCasa").addEventListener("click", () => abrirAjustes());
$("proxAbrir").addEventListener("click", () => paraAbrir && abrirSalaDaLista(paraAbrir));
$("proxMais").addEventListener("click", () => paraAbrir && abrirDetalhe(paraAbrir));

/** Abre a sala com um filme da lista (o nome é obrigatório para entrar). */
async function abrirSalaDaLista(f) {
  if (!meuNome) { toast("Escreva seu nome primeiro"); abrirAjustes(); $("ajNome").focus(); return; }
  try {
    const pos = f.parou?.pos || 0;
    await criarSala(f.link, f.titulo, f.capa || null, f.id, pos);
    if (pos) toast(`Continuando de ${tempo(pos)}`);
    $("detalhe").classList.remove("show"); $("novo").classList.remove("show");
    desligarLista?.(); desligarLista = null;
    $("casa").hidden = true;
    await entrarNaSala();
  } catch (e) { toast(e.message || "Não consegui abrir a sala."); }
}

// Detalhes de um filme da lista
let noDetalhe = null;
function abrirDetalhe(f) {
  noDetalhe = f;
  $("detCapa").replaceChildren(poster(f));
  $("detNome").value = f.titulo;
  $("detInfo").textContent = [f.nome && `Guardado por ${f.nome}`, f.visto && `visto em ${quando(f.visto)}`, f.parou && `parou em ${tempo(f.parou.pos)}`].filter(Boolean).join(" · ");
  $("detAbrir").textContent = f.parou ? `▶ Continuar de ${tempo(f.parou.pos)}` : "▶ Abrir sala";
  $("detStatus").textContent = "Testando o link…"; $("detStatus").className = "det-status";
  testarLink(f.link, minhaChaveDrive).then((t) => {
    if (noDetalhe?.id !== f.id) return;
    $("detStatus").textContent = t.texto;
    $("detStatus").className = `det-status ${t.ok ? "ok" : t.ok === false ? "ruim" : ""}`;
  });
  $("detResumo").textContent = f.capa?.resumo || "";
  $("detVisto").textContent = f.visto ? "Voltar para “Para ver”" : "Já vimos ✓";
  $("detRemover").textContent = "Tirar da lista"; $("detRemover").dataset.confirma = "";
  $("detalhe").classList.add("show");
}
const fecharDetalhe = () => $("detalhe").classList.remove("show");
/** Trocar a capa de um filme da lista: o nome passa a ser o do filme escolhido. */
function trocarCapaDoDetalhe() {
  if (!noDetalhe) return;
  const f = noDetalhe;
  escolherCapa(f.titulo, 0, f.capa, (c) => {
    // O nome acompanha a capa, a não ser que a pessoa tenha dado um nome próprio ao filme.
    const nomeProprio = f.capa && f.titulo !== f.capa.titulo;
    const novo = { capa: c, titulo: (nomeProprio ? f.titulo : c?.titulo || f.titulo).slice(0, 120) };
    update(fl(`/${f.id}`), novo).then(() => abrirDetalhe({ ...f, ...novo })).catch(() => toast("Não consegui trocar a capa."));
  });
}
$("detCapa").addEventListener("click", trocarCapaDoDetalhe);
$("detTrocarCapa").addEventListener("click", trocarCapaDoDetalhe);
$("detNome").addEventListener("change", () => {
  const n = $("detNome").value.trim().slice(0, 120);
  if (!noDetalhe || !n) { $("detNome").value = noDetalhe?.titulo || ""; return; }
  noDetalhe = { ...noDetalhe, titulo: n };
  update(fl(`/${noDetalhe.id}`), { titulo: n }).then(() => toast("Nome salvo")).catch(() => toast("Não consegui salvar o nome."));
});
$("detNome").addEventListener("keydown", (e) => { if (e.key === "Enter") $("detNome").blur(); });
$("detFechar").addEventListener("click", fecharDetalhe);
$("detalhe").addEventListener("click", (e) => { if (e.target.id === "detalhe") fecharDetalhe(); });
$("detAbrir").addEventListener("click", () => noDetalhe && abrirSalaDaLista(noDetalhe));
$("detVisto").addEventListener("click", () => {
  if (!noDetalhe) return;
  update(fl(`/${noDetalhe.id}`), { visto: noDetalhe.visto ? null : serverTimestamp(), parou: null }).catch(() => toast("Não consegui salvar."));
  fecharDetalhe();
});
$("detRemover").addEventListener("click", () => {
  const b = $("detRemover");
  if (!b.dataset.confirma) { b.dataset.confirma = "1"; b.textContent = "Toque de novo para tirar"; return; }
  remove(fl(`/${noDetalhe.id}`)).catch(() => toast("Não consegui tirar."));
  fecharDetalhe();
});

// Gaveta "+": colar o link, ver a capa e guardar (ou já abrir a sala)
$("adicionar").addEventListener("click", () => { $("erroNovo").textContent = ""; $("novo").classList.add("show"); $("link").focus(); });
$("novo").addEventListener("click", (e) => { if (e.target.id === "novo") $("novo").classList.remove("show"); });
/** Valida o link e guarda na lista; devolve o filme guardado (ou null se deu erro). */
async function guardarNovo() {
  const link = $("link").value.trim();
  lerChaveDrive($("chaveDrive"));
  const v = linkDoVideo(link, minhaChaveDrive);
  if (v.semChaveDrive) $("campoDrive").hidden = false;
  if (v.erro) { $("erroNovo").textContent = v.erro; return null; }
  if (jaNaFila(filmes, link)) { $("erroNovo").textContent = "Esse filme já está na lista."; return null; }
  $("erroNovo").textContent = "";
  const capa = (await novaCapa.pronta()) || null;
  const f = { link, titulo: ($("titulo").value.trim() || capa?.titulo || nomeDoArquivo(link)).slice(0, 120), capa, nome: meuNome || null, por: uid, em: serverTimestamp() };
  try {
    const novo = await push(fl(), f);
    $("link").value = ""; $("titulo").value = ""; novaCapa.limpar();
    $("novo").classList.remove("show");
    return { ...f, id: novo.key };
  } catch { $("erroNovo").textContent = "Não consegui guardar. Confira a internet."; return null; }
}
$("novoGuardar").addEventListener("click", async () => { if (await guardarNovo()) toast("Guardado na lista"); });

// Link de pasta do Drive: lista os vídeos para escolher quais guardar de uma vez.
let vezPasta = 0;
function mostrarModoPasta(sim) {
  $("pasta").hidden = !sim; $("pastaGuardar").hidden = !sim;
  $("novoGuardar").hidden = sim; $("novoAssistir").hidden = sim;
}
$("link").addEventListener("input", async () => {
  const id = pastaDoDrive($("link").value), minha = ++vezPasta;
  mostrarModoPasta(!!id);
  $("erroNovo").textContent = "";
  if (!id) return;
  lerChaveDrive($("chaveDrive"));
  if (!minhaChaveDrive) { $("campoDrive").hidden = false; $("erroNovo").textContent = "Para pastas do Drive, cole a chave do Google Drive (só uma vez)."; return; }
  $("pasta").textContent = "Abrindo a pasta…";
  $("pastaGuardar").disabled = true;
  try {
    const arquivos = await listarPasta(id, minhaChaveDrive);
    if (minha !== vezPasta) return;
    if (!arquivos.length) { $("pasta").textContent = "Nenhum vídeo nesta pasta (subpastas não entram)."; return; }
    $("pasta").replaceChildren(...arquivos.map((a) => {
      const l = document.createElement("label");
      const c = Object.assign(document.createElement("input"), { type: "checkbox", checked: true });
      c.dataset.id = a.id; c.dataset.nome = a.name;
      l.append(c, Object.assign(document.createElement("span"), { textContent: a.name }));
      return l;
    }));
    $("pastaGuardar").disabled = false;
    $("pastaGuardar").textContent = `Guardar ${arquivos.length} ${arquivos.length > 1 ? "filmes" : "filme"}`;
  } catch (e) { if (minha === vezPasta) $("pasta").textContent = e.message || "Não consegui abrir a pasta. Ela está como \"qualquer pessoa com o link\"?"; }
});
$("pasta").addEventListener("change", () => {
  const n = $("pasta").querySelectorAll("input:checked").length;
  $("pastaGuardar").disabled = !n;
  $("pastaGuardar").textContent = `Guardar ${n} ${n === 1 ? "filme" : "filmes"}`;
});
$("pastaGuardar").addEventListener("click", async () => {
  const marcados = [...$("pasta").querySelectorAll("input:checked")];
  const b = $("pastaGuardar");
  b.disabled = true;
  let feitos = 0;
  try {
    for (const c of marcados) {
      b.textContent = `Guardando ${++feitos} de ${marcados.length}…`;
      const link = `https://drive.google.com/file/d/${c.dataset.id}/view`;
      if (jaNaFila(filmes, link)) continue;
      const capa = (await buscarCapa(limparTitulo(c.dataset.nome), anoDoNome(c.dataset.nome)).catch(() => []))[0] || null;
      await push(fl(), { link, titulo: (capa?.titulo || limparTitulo(c.dataset.nome) || "Filme").slice(0, 120), capa, nome: meuNome || null, por: uid, em: serverTimestamp() });
    }
    $("link").value = ""; mostrarModoPasta(false); novaCapa.limpar();
    $("novo").classList.remove("show");
    toast(`${marcados.length} ${marcados.length > 1 ? "filmes guardados" : "filme guardado"} na lista`);
  } catch { $("erroNovo").textContent = "Não consegui guardar todos. Confira a internet."; b.disabled = false; }
});
$("novoAssistir").addEventListener("click", async () => { const f = await guardarNovo(); if (f) abrirSalaDaLista(f); });

$("compartilharLista").addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}#lista=${minhaLista}`;
  const texto = `Nossa lista de filmes para ver na Matinê: ${link}`;
  if (window.Matine?.compartilhar) { window.Matine.compartilhar(texto); return; }
  if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(link); toast("Link da lista copiado"); } catch { prompt("Copie o link da lista:", link); }
});

// ---------- Entrar com código ----------
function entrarComCodigo() {
  const c = $("codigoDigitado").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!codigoValido(c)) { $("erroInicio").textContent = "O código tem 6 letras e números, como ABC234."; return; }
  location.hash = c; // o hashchange recarrega a página já na sala
}
$("irCodigo").addEventListener("click", entrarComCodigo);
$("irCodigoCasa").addEventListener("click", () => { $("codigoDigitado").value = $("codigoCasa").value; entrarComCodigo(); });
$("codigoCasa").addEventListener("keydown", (e) => { if (e.key === "Enter") $("irCodigoCasa").click(); });
$("codigoDigitado").addEventListener("keydown", (e) => { if (e.key === "Enter") entrarComCodigo(); });

// ---------- Capa do filme ----------
/** Mostra a capa em `el`. Os dados vêm do banco (escritos por quem abriu a sala): só aceita endereços do TMDB/IMDb/Wikipédia. */
function cartaoCapa(el, capa, aoRecusar) {
  const ok = capaValida(capa);
  el.hidden = !ok;
  el.replaceChildren();
  if (!ok) return;
  const img = Object.assign(document.createElement("img"), { src: capa.img, alt: "", loading: "lazy" });
  const txt = document.createElement("div");
  const t = document.createElement("b"); t.textContent = capa.titulo;
  const p = document.createElement("p"); p.textContent = capa.resumo;
  const fonte = document.createElement("small");
  fonte.append("Fonte: ", Object.assign(document.createElement("a"), { href: capa.pagina, target: "_blank", rel: "noopener", textContent: capa.pagina.includes("themoviedb.org") ? "TMDB" : capa.pagina.includes("imdb.com") ? "IMDb" : "Wikipédia" }));
  txt.append(t, p, fonte);
  if (aoRecusar) {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: "Trocar capa" });
    b.onclick = aoRecusar;
    txt.append(b);
  }
  el.append(img, txt);
}

/** Busca a capa enquanto a pessoa digita o link ou o nome (espera ela parar de digitar). */
function capaAoDigitar(campoLink, campoTitulo, el) {
  let escolhida = null, busca = Promise.resolve(null), timer = 0, vez = 0, termo = "", ano = 0, manual = false;
  // "Trocar capa" abre a grade com todos os resultados; sem resultado, aparece "Procurar capa".
  // Capa escolhida na grade fica: digitar depois não troca mais sozinho.
  const trocar = () => escolherCapa(termo, ano, escolhida, (c) => { clearTimeout(timer); timer = 0; vez++; manual = true; busca = Promise.resolve(c); mostrar(c); });
  const mostrar = (c) => {
    escolhida = c;
    cartaoCapa(el, c, trocar);
    if (!c && termo && termo !== "Filme") {
      const linha = Object.assign(document.createElement("div"), { className: "sem-capa" });
      linha.append(Object.assign(document.createElement("span"), { textContent: "Nenhuma capa encontrada" }),
        Object.assign(document.createElement("button"), { type: "button", textContent: "Procurar capa", onclick: trocar }));
      el.replaceChildren(linha);
      el.hidden = false;
    }
  };
  const buscar = () => {
    if (manual) return;
    if (pastaDoDrive(campoLink.value)) { termo = ""; mostrar(null); return; }
    const nome = campoLink.value.trim() ? nomeDoArquivo(campoLink.value) : "";
    termo = campoTitulo.value.trim() || (nome ? limparTitulo(nome) : "");
    let bruto = ""; try { bruto = decodeURIComponent(new URL(campoLink.value.trim()).pathname.split("/").pop() || ""); } catch {}
    ano = anoDoNome(bruto);
    const minha = ++vez;
    busca = (termo && termo !== "Filme" ? buscarCapa(termo, ano) : Promise.resolve([])).then((lista) => {
      if (minha !== vez) return escolhida;
      mostrar(lista[0] || null);
      return escolhida;
    });
  };
  const agendar = () => { clearTimeout(timer); timer = setTimeout(buscar, 600); };
  campoLink.addEventListener("input", agendar);
  campoTitulo.addEventListener("input", agendar);
  return {
    // Na hora de salvar: termina a busca que estava esperando a pessoa parar de digitar.
    pronta() { if (timer) { clearTimeout(timer); timer = 0; buscar(); } return busca.then(() => escolhida); },
    limpar() { escolhida = null; termo = ""; manual = false; cartaoCapa(el, null); },
  };
}
const novaCapa = capaAoDigitar($("link"), $("titulo"), $("capaNova"));
const capaDaTroca = capaAoDigitar($("novoLink"), $("novoTitulo"), $("capaTroca"));

// ---------- Escolher capa: busca no TMDB com grade de capas ----------
let aoEscolherCapa = null, vezCapas = 0, timerCapas = 0, anoCapas = 0, atualCapas = "";
/** Abre a grade de capas buscando [termo]; [aoEscolher] recebe a capa escolhida (ou null = sem capa). */
function escolherCapa(termo, ano, atual, aoEscolher) {
  aoEscolherCapa = aoEscolher; anoCapas = ano || 0; atualCapas = atual?.pagina || "";
  $("capaBusca").value = termo || "";
  $("capas").classList.add("show");
  buscarCapas();
}
async function buscarCapas() {
  const t = $("capaBusca").value.trim(), minha = ++vezCapas;
  const grade = $("capasGrade");
  if (t.length < 2) { grade.innerHTML = '<p class="hint">Escreva o nome do filme ou da série.</p>'; return; }
  grade.innerHTML = '<p class="hint">Buscando…</p>';
  const lista = await buscarCapa(t, anoCapas);
  if (minha !== vezCapas) return;
  if (!lista.length) { grade.innerHTML = '<p class="hint">Nada encontrado. Tente outro nome, o nome original ou em inglês.</p>'; return; }
  grade.replaceChildren(...lista.map((c) => {
    const b = Object.assign(document.createElement("button"), { type: "button", className: c.pagina === atualCapas ? "on" : "" });
    b.setAttribute("aria-label", `${c.titulo}${c.ano ? " (" + c.ano + ")" : ""}`);
    b.append(poster({ titulo: c.titulo, capa: c }), Object.assign(document.createElement("b"), { textContent: c.titulo }), Object.assign(document.createElement("small"), { textContent: c.ano || "" }));
    b.onclick = () => fecharCapas(c);
    return b;
  }));
}
function fecharCapas(escolha) {
  $("capas").classList.remove("show");
  const cb = aoEscolherCapa; aoEscolherCapa = null;
  if (escolha !== undefined && cb) cb(escolha);
}
$("capaBusca").addEventListener("input", () => { clearTimeout(timerCapas); timerCapas = setTimeout(buscarCapas, 450); });
$("capaBusca").addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(timerCapas); buscarCapas(); } });
$("capaNenhuma").addEventListener("click", () => fecharCapas(null));
$("capasFechar").addEventListener("click", () => fecharCapas());
$("capas").addEventListener("click", (e) => { if (e.target.id === "capas") fecharCapas(); });

// ---------- Dentro da sala ----------
let entrouEm = 0;
// Salas por onde este aparelho passou: a limpeza olha só para elas (o banco não deixa listar salas de ninguém).
const salasDaqui = () => { try { return JSON.parse(guardado("matine-salas") || "[]"); } catch { return []; } };
const lembrarSala = (c) => guardar("matine-salas", JSON.stringify([c, ...salasDaqui().filter((x) => x !== c)].slice(0, 30)));
/** Apaga salas que ficaram vazias há mais de 10 min (as regras do banco só deixam se não tiver ninguém dentro). */
async function varrerSalasVazias() {
  const ficam = [];
  for (const c of salasDaqui()) {
    try {
      const marca = (await get(ref(db, `vazias/${c}`))).val();
      if (marca && marca < agora() - 10 * 60 * 1000) {
        await remove(ref(db, `salas/${c}`)).catch(() => {});
        await remove(ref(db, `vazias/${c}`)).catch(() => {});
      } else if (marca || (await get(ref(db, `salas/${c}/info`))).exists()) ficam.push(c);
    } catch (e) { console.warn("Matinê: limpeza de salas vazias falhou", e); ficam.push(c); }
  }
  guardar("matine-salas", JSON.stringify(ficam));
}

/** Ninguém dentro e a sala "tocando": o relógio andou sozinho. Volta para o último ponto visto, parado. */
async function acordarSala() {
  try {
    const outros = Object.keys((await get(r("pessoas"))).val() || {}).filter((id) => id !== uid);
    if (outros.length) return;
    const e = (await get(r("estado"))).val();
    if (!e?.tocando && !e?.prep) return;
    const ponto = (await get(r("ponto"))).val();
    await set(r("estado"), { tocando: false, pos: ponto?.pos ?? e.pos, em: serverTimestamp(), por: uid });
  } catch (e) { console.warn("Matinê: não consegui acordar a sala", e); }
}

async function entrarNaSala() {
  lembrarSala(codigo);
  await acordarSala();
  const eu = r(`pessoas/${uid}`);
  const meusDados = () => ({ nome: meuNome, foto: minhaFoto, entrou: serverTimestamp(), digitando: false, fora: document.hidden, pronto: meuPronto });
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
  // Voltar do celular (ou do navegador) na sala pergunta se quer sair, em vez de fechar tudo.
  history.pushState({ sala: codigo }, "");

  onValue(r("info"), (s) => { if (s.exists()) mudouInfo(s.val()); });
  onValue(r("estado"), (s) => { if (s.exists()) { estado = s.val(); aplicar(); } });
  onValue(r("pessoas"), (s) => mudouPessoas(s.val() || {}));
  onChildAdded(query(r("chat"), limitToLast(100)), (s) => mostrarMensagem(s.val(), s.key));
  onChildAdded(query(r("reacoes"), limitToLast(1)), (s) => { const x = s.val(); if (x.em >= entrouEm - 2000) flutuar(x); });
}

function mudouInfo(novo) {
  const trocou = !info || novo.link !== info.link || !video.src;
  if (info && novo.link !== info.link) marcouVisto = false;
  info = novo;
  if (info.lista && info.lista !== minhaLista) adotarLista(info.lista); // quem entra passa a ver a mesma lista
  $("tituloMini").textContent = info.titulo || "Filme";
  $("tituloTopo").textContent = info.titulo || "Filme";
  $("codigoMini").textContent = codigo;
  document.title = `${info.titulo || "Filme"} · Matinê`;
  cartaoCapa($("capaFolha"), info.capa);
  video.poster = $("capaFolha").hidden ? "" : info.capa.img;
  verComando();
  if (!trocou) return;
  const v = linkDoVideo(info.link, chaveDrive());
  if (v.erro) { avisar(v.erro); return; }
  carregarFilme(v);
}

let filmeAberto = null, cofre = null;
async function carregarFilme(v) {
  esconderAviso();
  filmeAberto?.fechar();
  filmeAberto = null;
  cofre?.fechar();
  cofre = null;
  urlDoFilme = v.url;
  const meu = (carregarFilme.vez = (carregarFilme.vez || 0) + 1);
  const c = v.drive ? await abrirCofre(v.drive, v.url, chaveDrive()) : null;
  if (meu !== carregarFilme.vez) { c?.fechar(); return; }
  cofre = c;
  const aberto = await abrirVideo(video, c?.src || v.url, (msg) => { marcarErro(msg); avisar(msg, "Tentar de novo", () => carregarFilme(v)); });
  if (meu !== carregarFilme.vez) aberto.fechar(); // trocaram o filme enquanto este abria
  else { filmeAberto = aberto; verTvDisponivel(); if (naTvApp) tvLigou(); }
}

// ---------- Sincronia do vídeo ----------
// Regra de ouro: quem manda na sala são os comandos da pessoa (botões, gestos, TV). O <video> só obedece:
// seus eventos não viram comando, a não ser que venham de uma tela do sistema (janelinha, tela cheia do iPhone).
// Assim um vídeo atrasado (aba trocada, tela bloqueada, travada) nunca arrasta os outros para trás.
function aplicar() {
  if (!estado || video.readyState < 1 || video.error) return; // loadedmetadata chama de novo
  const alvo = esperado(estado, agora());
  if (naTvApp) window.Matine.tvEstado(estado.tocando && !emContagem(estado, agora()), alvo); // a TV segue a sala
  // Preparando (alguém pulou ou travou): todo mundo vai para o ponto e espera os outros carregarem.
  if (estado.prep) {
    video.playbackRate = 1;
    if (!video.paused) video.pause();
    if (Math.abs(video.currentTime - alvo) > 0.3) irPara(alvo);
    mostrarPreparo();
    return;
  }
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
  if (isFinite(video.duration) && alvo >= video.duration - 0.3) { if (!video.paused) video.pause(); return; } // o filme acabou
  if (Math.abs(video.currentTime - alvo) > 1.5) irPara(alvo + demoraDoPulo);
  if (video.paused && !document.hidden) {
    video.play().then(esconderAviso).catch((e) => {
      if (e.name === "NotAllowedError") avisar("A sala já está passando o filme.", "Entrar no ritmo", () => video.play().then(esconderAviso).catch(() => {}));
    });
  }
}
// Pulo que a sala mandou: o "seeked" dele não volta para a sala.
// `demoraDoPulo`: quanto o último pulo levou; o próximo já mira esse tanto à frente para cair perto da sala.
let pulando = false, puloEm = 0, demoraDoPulo = 0;
function irPara(t) { pulando = true; puloEm = performance.now(); video.currentTime = t; }

/** Muda o estado da sala. Vale aqui na hora, antes da volta do servidor. */
function mudar(novo) {
  const s = { em: serverTimestamp(), por: uid, ...novo };
  estado = { ...s, em: novo.em ?? agora() };
  set(r("estado"), s).catch(() => toast("Não consegui avisar a sala."));
  aplicar();
}
const posDaSala = () => (estado ? esperado(estado, agora()) : video.currentTime);
const pausarSala = () => mudar({ tocando: false, pos: posDaSala() });
/** Leva todo mundo para `pos` e só solta quando todos carregarem. `vinha`: "play", "pulo" ou "espera". */
const prepararSala = (pos, vinha) => mudar({ tocando: false, pos, prep: Math.random().toString(36).slice(2, 10), vinha });

/** O celular só deixa o vídeo tocar sozinho depois de um play dado com o dedo: aproveita o toque do botão. */
let desbloqueado = false, desbloqueando = false;
function desbloquear() {
  if (desbloqueado || !video.paused || video.readyState < 1 || String(video.src).startsWith("embed:")) return;
  desbloqueado = desbloqueando = true;
  video.play().catch((e) => { if (e.name === "NotAllowedError") desbloqueado = false; }).finally(() => setTimeout(() => { desbloqueando = false; }, 300));
  video.pause();
}
const sala = {
  alternar() {
    if (!estado) return;
    if (estado.tocando || estado.prep) { pausarSala(); return; }
    desbloquear();
    prepararSala(estado.pos, "play");
  },
  pular(t) {
    if (!estado) return;
    if (estado.tocando || estado.prep) prepararSala(t, estado.vinha === "play" ? "play" : "pulo");
    else mudar({ tocando: false, pos: t });
  },
};

const telaDoSistema = () => video.webkitDisplayingFullscreen || document.pictureInPictureElement === video || document.body.classList.contains("pip");
let saindo = false;
video.addEventListener("loadedmetadata", aplicar);
video.addEventListener("play", () => {
  if (!estado || desbloqueando || estado.tocando || estado.prep) return;
  if (telaDoSistema()) prepararSala(video.currentTime, "play");
  else aplicar();
});
video.addEventListener("pause", () => {
  // Tela bloqueada, aba trocada, ligação: o sistema pausa sozinho, e isso não pausa a sala.
  if (saindo || desbloqueando || document.hidden || video.ended || !estado?.tocando || emContagem(estado, agora())) return;
  if (telaDoSistema()) pausarSala();
});
video.addEventListener("seeked", () => {
  if (pulando) {
    pulando = false;
    if (estado?.tocando) demoraDoPulo = Math.min(2, (performance.now() - puloEm) / 1000);
    return;
  }
  if (!estado) return;
  if (telaDoSistema() && Math.abs(video.currentTime - posDaSala()) > 1.5) sala.pular(video.currentTime);
  else aplicar();
});
document.addEventListener("visibilitychange", () => {
  if (uid && codigo && $("sala").classList.contains("on")) update(r(`pessoas/${uid}`), { fora: document.hidden }).catch(() => {});
  if (!document.hidden) aplicar();
});

// A cada segundo, encosta na sala acelerando/freando de leve; se estiver muito longe, pula.
setInterval(() => {
  if (!estado?.tocando || estado.prep || video.seeking || video.readyState < 1 || emContagem(estado, agora())) return;
  // Pausado sem a sala mandar (o sistema pausou, voltou de uma travada): volta a andar.
  if (video.paused) { if (!document.hidden && !video.ended && !video.error && !$("aviso").classList.contains("show")) aplicar(); return; }
  if (video.readyState < 3) return;
  const c = correcao(video.currentTime - esperado(estado, agora()));
  if (c.pular) irPara(esperado(estado, agora()) + demoraDoPulo);
  else video.playbackRate = c.velocidade;
}, 1000);

// ---------- Preparar a sala e "Espera eu" ----------
let meuPronto = "", paradoDesde = 0, semSegurarAte = 0;
const estouPronto = () => !video.seeking && !video.error && (video.readyState >= 4 || (video.readyState >= 3 && adiante(video.buffered, video.currentTime) >= 2));
const assistindo = () => Object.values(pessoas).filter((p) => !p.fora && !p.erro).length;
setInterval(() => {
  if (!estado || !uid) return;
  const t = performance.now();
  // Travei com o filme andando: a sala espera por mim em vez de eu ficar para trás.
  const travado = estado.tocando && !estado.prep && !emContagem(estado, agora()) && !video.paused && !video.error && !document.hidden && !naTvApp && (video.readyState < 3 || video.seeking);
  if (!travado) paradoDesde = 0;
  else if (!paradoDesde) paradoDesde = t;
  else if (t - paradoDesde > 2500 && t > semSegurarAte && assistindo() > 1) {
    semSegurarAte = t + 40000; // no máximo uma espera a cada 40 s, para internet ruim não virar pausa sem fim
    prepararSala(Math.min(video.currentTime, posDaSala()), "espera");
    return;
  }
  if (!estado.prep) return;
  if (estouPronto() && meuPronto !== estado.prep) {
    meuPronto = estado.prep;
    update(r(`pessoas/${uid}`), { pronto: meuPronto }).catch(() => {});
  }
  if (quemDecide(pessoas, estado.por) !== uid) return;
  const passou = agora() - estado.em;
  if (todosProntos(pessoas, estado.prep) || passou > (estado.vinha === "espera" ? 30000 : 20000)) {
    if (passou > 3000 && !todosProntos(pessoas, estado.prep)) toast("Seguindo sem quem ainda está carregando.");
    mudar({ tocando: true, pos: estado.pos, em: agora() + (estado.vinha === "play" ? 3000 : 1000) });
  }
}, 250);
function mostrarPreparo() {
  clearInterval(contagemTimer); contagemTimer = 0;
  const faltam = Object.entries(pessoas).filter(([id, p]) => id !== uid && !p.fora && !p.erro && p.pronto !== estado.prep).map(([, p]) => p.nome);
  $("numeroContagem").textContent = "";
  $("textoContagem").textContent = meuPronto !== estado.prep ? "Carregando…" : faltam.length ? `Esperando ${faltam.join(", ")}…` : "Começando junto…";
  $("contagem").classList.add("on");
}

// A cada 15 s guarda onde o filme está: para a sala vazia não andar sozinha e para continuar depois.
function guardarPonto(pos) {
  set(r("ponto"), { pos, em: serverTimestamp() }).catch(() => {});
  if (info?.lista && info?.item) update(ref(db, `listas/${info.lista}/filmes/${info.item}`), { parou: { pos, em: serverTimestamp() } }).catch(() => {});
}
setInterval(() => {
  if (estado?.tocando && !emContagem(estado, agora()) && quemDecide(pessoas, null) === uid) guardarPonto(posDaSala());
}, 15000);

function marcarErro(texto) { if (uid && codigo) update(r(`pessoas/${uid}`), { erro: String(texto).slice(0, 120) }).catch(() => {}); }
video.addEventListener("canplay", () => { if (uid && codigo && pessoas[uid]?.erro) update(r(`pessoas/${uid}`), { erro: null }).catch(() => {}); });

video.addEventListener("error", async () => {
  const v = linkDoVideo(info?.link, chaveDrive());
  const deNovo = () => { if (v.url) carregarFilme(v); };
  // O <video> só diz "não abriu"; perguntar ao servidor mostra o motivo de verdade.
  avisar("Conferindo o que aconteceu com o vídeo…");
  const teste = info?.link && !v.embed ? await testarLink(info.link, chaveDrive()) : null;
  const motivo = teste?.ok === false ? teste.texto
    : teste?.ok ? "O link está funcionando, mas este aparelho não conseguiu tocar o arquivo. Tente de novo; se repetir, é o formato."
    : { 2: "A internet caiu no meio do carregamento.", 3: "O arquivo veio com defeito." }[video.error?.code] || "Não consegui tocar o vídeo.";
  marcarErro(motivo);
  avisar(motivo, "Tentar de novo", deNovo);
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
    vibrar(30);
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
    for (const [id, p] of Object.entries(novas)) if (id !== uid && p.erro && p.erro !== pessoas[id]?.erro) linhaSistema(`⚠️ ${p.nome} não conseguiu abrir o vídeo: ${p.erro}`);
  }
  primeiraLista = false;
  pessoas = novas;
  const lista = Object.entries(pessoas).sort(([a], [b]) => (a === uid ? -1 : b === uid ? 1 : 0));
  $("bolas").innerHTML = lista.slice(0, 4).map(([id, p]) => bolinha(p, id)).join("");
  $("nomes").textContent = lista.length > 1 ? lista.map(([id, p]) => id === uid ? "Você" : p.nome).join(", ") : "Só você por enquanto";
  const comando = info?.dono === uid;
  $("quem").innerHTML = lista.map(([id, p]) => `<div class="p ${id === uid ? "eu" : ""}">${bolinha(p, id)}<div>${id === uid ? "Você" : esc(p.nome)}</div>${id === info?.dono ? "<small>comanda a sala</small>" : comando ? `<button type="button" class="passar" data-passar="${esc(id)}">Passar comando</button>` : ""}</div>`).join("");
  verComando();
  if (estado?.prep && $("contagem").classList.contains("on")) mostrarPreparo();
  const digitando = lista.filter(([id, p]) => id !== uid && p.digitando).map(([, p]) => p.nome);
  $("digitando").classList.toggle("on", digitando.length > 0);
  $("textoDigitando").textContent = digitando.length ? `${digitando.join(", ")} ${digitando.length > 1 ? "estão" : "está"} digitando…` : "";
}

/** Trocar filme: quem comanda, ou qualquer um se quem comandava saiu da sala. */
function verComando() { $("trocar").hidden = !(info?.dono === uid || (info?.dono && !pessoas[info.dono])); }
$("quem").addEventListener("click", (e) => {
  const id = e.target.closest("[data-passar]")?.dataset.passar;
  if (id) update(r("info"), { dono: id }).then(() => toast(`Agora ${pessoas[id]?.nome || "a outra pessoa"} comanda a sala`)).catch(() => toast("Não consegui passar o comando."));
});

// ---------- Chat ----------
function rolarSeNoFim(fn) {
  const c = $("chat"), noFim = c.scrollHeight - c.scrollTop - c.clientHeight < 60;
  c.querySelector(".empty")?.remove();
  fn(c);
  if (noFim) c.scrollTop = c.scrollHeight;
}
let brotos = null;
function mostrarMensagem(m, id) {
  // Easter egg: "/brotos" e "/tchau" não viram balão; chamam (ou mandam embora) os Brotos para todo mundo.
  const cmd = comandoBrotos(m.texto);
  if (cmd) {
    const quem = m.uid === uid ? "Você" : m.nome || "Alguém";
    linhaSistema(cmd === "chamar" ? `✨ ${quem} chamou os Brotos` : `👋 ${quem} mandou os Brotos embora`);
    if ((m.em || 0) >= entrouEm - 5000) { brotos ??= iniciarBrotos($("chat")); brotos[cmd](); } // histórico antigo não chama
    return;
  }
  // Easter eggs de efeito (/pipoca, /confete, /dado, /moeda, /luz): viram linha no chat e efeito na tela de todos.
  const ef = comandoEfeito(m.texto);
  if (ef) {
    const valor = valorValido(ef, m.valor);
    linhaSistema(textoDoEfeito(ef, m.uid === uid ? "Você" : m.nome || "Alguém", valor));
    if ((m.em || 0) >= entrouEm - 5000) rodarEfeito(ef, valor);
    return;
  }
  const carta = /^\/carta\s+([\s\S]+)/i.exec(m.texto || "");
  if (carta) { rolarSeNoFim((c) => c.appendChild(cartaIngresso(m, id, carta[1].trim().slice(0, 140)))); return; }
  if (!m.texto && !fotoValida(m.img)) return; // nada para mostrar (ex.: foto recusada pelo banco)
  let bolhaNova = null;
  rolarSeNoFim((c) => {
    const linha = document.createElement("div");
    linha.className = "msg" + (m.uid === uid ? " mine" : "");
    linha.dataset.nome = m.uid === uid ? meuNome : m.nome || "?";
    linha.dataset.texto = m.texto;
    const b = document.createElement("div");
    b.className = "bubble";
    if (CORES_BALAO.includes(m.cor) && m.cor !== CORES_BALAO[0]) { b.style.background = m.cor; b.classList.add("colorido"); } // só cores da paleta
    if (m.uid !== uid) { const n = document.createElement("small"); n.style.color = corDe(m.nome || "?"); n.textContent = m.nome || "?"; b.appendChild(n); }
    if (m.resp?.texto) {
      const cita = document.createElement("div");
      cita.className = "cita";
      const quem = document.createElement("b"); quem.textContent = String(m.resp.nome || "?").slice(0, 24);
      cita.append(quem, String(m.resp.texto).slice(0, 80));
      b.appendChild(cita);
    }
    if (fotoValida(m.img)) {
      b.classList.add("foto");
      const img = Object.assign(document.createElement("img"), { src: m.img, alt: "Foto de " + (m.nome || "alguém"), loading: "lazy" });
      img.addEventListener("click", (e) => { e.stopPropagation(); abrirFoto(m.img); });
      b.appendChild(img);
      linha.dataset.texto = m.texto || "📷 Foto";
    }
    if (m.texto) b.appendChild(document.createTextNode(m.texto));
    linha.appendChild(b);
    c.appendChild(linha);
    bolhaNova = b;
  });
  brotos?.novaMensagem(bolhaNova, m.texto);
}

// ---------- /carta: o recado chega como um ingresso fechado; cada um abre o seu destacando o canhoto ----------
const ICONE_INGRESSO = '<svg viewBox="0 0 100 100" aria-hidden="true"><path fill-rule="evenodd" fill="currentColor" d="M14,30Q14,24 20,24H80Q86,24 86,30V41A9,9 0,0 0,86 59V70Q86,76 80,76H20Q14,76 14,70V59A9,9 0,0 0,14 41Z M33,38V62L53,50Z"/></svg>';
const cartasAbertas = new Set((() => { try { return JSON.parse(localStorage.getItem("matine-cartas") || "[]"); } catch { return []; } })());
function cartaIngresso(m, id, texto) {
  const minha = m.uid === uid, nome = m.uid === uid ? meuNome : m.nome || "Alguém";
  const linha = document.createElement("div");
  linha.className = "msg" + (minha ? " mine" : "");
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const caixa = el("div", "carta" + (minha || cartasAbertas.has(id) ? " aberta" : ""));
  caixa.append(el("div", "carta-de", minha ? "🎟 Você mandou um recado" : `🎟 Recado de ${nome}`));
  const bilhete = el("div", "carta-bilhete");
  const corpo = el("div", "carta-corpo");
  const poltrona = (parseInt(String(id).slice(-3), 36) % 20) + 1 || 7;
  corpo.append(el("div", "carta-topo", "MATINÊ · SESSÃO DE HOJE"), el("div", "carta-titulo", "Um recado pra você"), el("div", "carta-linha", `de ${nome} · fileira M, poltrona ${poltrona}`));
  const papel = el("div", "carta-papel", texto);
  papel.append(el("span", "carta-ass", `— ${nome}`));
  corpo.append(papel);
  const canhoto = el("div", "carta-canhoto");
  canhoto.innerHTML = ICONE_INGRESSO;
  canhoto.append("ABRIR");
  bilhete.append(corpo, canhoto);
  caixa.append(bilhete);
  if (minha) {
    const lida = el("div", "carta-lida", "ainda não aberta");
    caixa.append(lida);
    if (id) onValue(r(`chat/${id}/abertas`), (s) => {
      const quem = Object.values(s.val() || {});
      lida.textContent = quem.length ? `✓ aberta por ${quem.join(", ")}` : "ainda não aberta";
    }, () => {});
  } else if (!caixa.classList.contains("aberta")) {
    caixa.append(el("div", "carta-toque", "toque para abrir"));
    caixa.tabIndex = 0;
    caixa.setAttribute("role", "button");
    caixa.setAttribute("aria-label", `Recado de ${nome}. Toque para abrir`);
    const abrir = () => {
      if (caixa.classList.contains("aberta")) return;
      caixa.classList.add("aberta");
      caixa.removeAttribute("role");
      caixa.setAttribute("aria-label", `Recado de ${nome}: ${texto}`);
      cartasAbertas.add(id);
      try { localStorage.setItem("matine-cartas", JSON.stringify([...cartasAbertas].slice(-200))); } catch {}
      if (id) set(r(`chat/${id}/abertas/${uid}`), meuNome.slice(0, 24)).catch(() => {}); // avisa quem mandou
      const q = canhoto.getBoundingClientRect();
      for (let i = 0; i < 12; i++) {
        const f = el("i", "faisca");
        const a = (i / 12) * Math.PI * 2, d = 26 + Math.random() * 24;
        f.style.cssText = `left:${q.left + q.width / 2}px;top:${q.top + q.height / 2}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;background:${i % 2 ? "#E6C14F" : "#FFF6D8"}`;
        document.body.appendChild(f);
        setTimeout(() => f.remove(), 800);
      }
    };
    caixa.addEventListener("click", abrir);
    caixa.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });
  }
  linha.append(caixa);
  return linha;
}
function linhaSistema(t) { rolarSeNoFim((c) => { const d = document.createElement("div"); d.className = "sys"; d.textContent = t; c.appendChild(d); }); }

let digitandoTimer = 0;
function marcarDigitando(sim) { if (uid && codigo) update(r(`pessoas/${uid}`), { digitando: sim }).catch(() => {}); }
$("texto").addEventListener("blur", () => brotos?.olharPara(null));
$("texto").addEventListener("input", () => {
  brotos?.olharPara($("texto"));
  $("enviar").classList.toggle("on", $("texto").value.trim() !== "");
  if (!digitandoTimer) marcarDigitando(true);
  clearTimeout(digitandoTimer);
  digitandoTimer = setTimeout(() => { digitandoTimer = 0; marcarDigitando(false); }, 2500);
});
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = $("texto").value.trim();
  if (!texto) return;
  const ef = comandoEfeito(texto);
  push(r("chat"), { uid, nome: meuNome, texto, resp: respondendo, cor: corBalao, valor: ef ? sortearValor(ef) : null, em: serverTimestamp() }).catch(() => toast("A mensagem não foi."));
  responder(null);
  $("texto").value = "";
  $("enviar").classList.remove("on");
  clearTimeout(digitandoTimer); digitandoTimer = 0; marcarDigitando(false);
});

// ---------- Fotos no chat ----------
// A foto é reduzida no próprio aparelho (no máximo ~200 KB) e vai direto no banco da sala, que é apagado junto com ela.
$("arquivoFoto").addEventListener("change", async () => {
  const arq = $("arquivoFoto").files[0];
  $("arquivoFoto").value = "";
  if (!arq) return;
  $("botaoFoto").classList.add("ocupado");
  try {
    const img = await fotoParaChat(arq);
    await push(r("chat"), { uid, nome: meuNome, texto: $("texto").value.trim().slice(0, 500), img, resp: respondendo, cor: corBalao, em: serverTimestamp() });
    $("texto").value = ""; $("enviar").classList.remove("on"); responder(null);
  } catch (e) { toast(e.message?.startsWith("Matinê:") ? e.message.slice(8) : "A foto não foi. Tente outra."); }
  finally { $("botaoFoto").classList.remove("ocupado"); }
});
function abrirFoto(src) { $("fotoGrande").src = src; $("visualizador").classList.add("show"); $("fecharFoto").focus(); }
$("fecharFoto").addEventListener("click", () => $("visualizador").classList.remove("show"));
$("visualizador").addEventListener("click", (e) => { if (e.target.id === "visualizador") $("visualizador").classList.remove("show"); });

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
  if (dx > 55) { vibrar(15); responder(linha); }
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

const controles = iniciarControles(video, document.querySelector(".player"), sala);

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
const convertido = () => !/^https?:/.test(video.src); // blob: (convertido) ou embed: (YouTube/Vimeo)
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
  if (!estado) return;
  if (Math.abs(posDaSala() - pos) > 3) sala.pular(pos);
  else if (tocando !== !!(estado.tocando || estado.prep)) sala.alternar();
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
  // a foto de quem reagiu dá um pulinho na faixa de pessoas
  document.querySelectorAll(`[data-uid="${CSS.escape(String(x.uid || ""))}"]`).forEach((el) => el.animate(
    [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-8px) scale(1.15)" }, { transform: "translateY(0) scale(1)" }], { duration: 420, easing: "ease-out" }));
  if (x.uid !== uid) vibrar(12);
}

// Filme da lista chegou perto do fim: vai para "Já vimos" (uma vez por sala).
let marcouVisto = false;
video.addEventListener("timeupdate", () => {
  if (marcouVisto || !info?.lista || !info?.item || !(video.duration > 600)) return;
  if (video.currentTime / video.duration < 0.92) return;
  marcouVisto = true;
  update(ref(db, `listas/${info.lista}/filmes/${info.item}`), { visto: serverTimestamp(), parou: null }).catch(() => {});
});

// ---------- Tela de ajustes ----------
function abrirAjustes() {
  $("ajNome").value = meuNome;
  $("ajFotos").innerHTML = FOTOS.map(([k, rotulo, svg]) =>
    `<button type="button" data-k="${k}" aria-label="${esc(rotulo)}" aria-pressed="${k === minhaFoto}" class="${k === minhaFoto ? "on" : ""}">${svg}</button>`).join("");
  $("ajCores").innerHTML = CORES_BALAO.map((c, i) =>
    `<button type="button" data-c="${c}" style="background:${c}" aria-label="Cor ${i + 1}" aria-pressed="${c === corBalao}" class="${c === corBalao ? "on" : ""}"></button>`).join("");
  document.querySelectorAll("#ajLetra button").forEach((b) => b.classList.toggle("on", b.dataset.l === document.body.dataset.letra));
  $("ajVibrar").checked = guardado("matine-vibrar") !== "nao";
  $("ajAtualizar").hidden = !window.Matine?.verificarAtualizacao; // só o app Android tem como atualizar
  $("ajApagar").textContent = "Apagar meus dados deste aparelho";
  $("ajApagar").dataset.confirma = "";
  $("folha").classList.remove("show");
  $("ajustes").classList.add("show");
}
$("ajFotos").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  minhaFoto = b.dataset.k; guardar("matine-foto", minhaFoto);
  $("ajFotos").querySelectorAll("button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
  desenharFotos(); atualizarPerfil();
  $("casaEu").innerHTML = svgDa(minhaFoto);
});
$("ajCores").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  corBalao = b.dataset.c; guardar("matine-cor", corBalao);
  $("ajCores").querySelectorAll("button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
});
$("ajLetra").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  guardar("matine-letra", b.dataset.l); aplicarLetra();
  document.querySelectorAll("#ajLetra button").forEach((x) => x.classList.toggle("on", x === b));
});
$("ajVibrar").addEventListener("change", () => guardar("matine-vibrar", $("ajVibrar").checked ? "sim" : "nao"));
$("ajNome").addEventListener("change", () => {
  const n = $("ajNome").value.trim().slice(0, 24);
  if (!n) { $("ajNome").value = meuNome; return; }
  meuNome = n; guardar("matine-nome", n); $("nome").value = n; atualizarPerfil();
});
/** Na sala, troca o nome e a foto para todo mundo. */
function atualizarPerfil() { if (uid && codigo && $("sala").classList.contains("on")) update(r(`pessoas/${uid}`), { nome: meuNome, foto: minhaFoto }).catch(() => {}); }
$("ajAtualizar").addEventListener("click", () => window.Matine?.verificarAtualizacao?.());
$("ajApagar").addEventListener("click", () => {
  const b = $("ajApagar");
  if (!b.dataset.confirma) { b.dataset.confirma = "1"; b.textContent = "Toque de novo para apagar tudo"; return; }
  try { Object.keys(localStorage).filter((k) => k.startsWith("matine-")).forEach((k) => localStorage.removeItem(k)); } catch {}
  Promise.resolve(apagarCofre()).finally(() => location.reload());
});
$("ajFechar").addEventListener("click", () => $("ajustes").classList.remove("show"));
$("ajustes").addEventListener("click", (e) => { if (e.target.id === "ajustes") $("ajustes").classList.remove("show"); });
$("abrirAjustes").addEventListener("click", abrirAjustes);
$("ajustesSala").addEventListener("click", abrirAjustes);

// ---------- Sair da sala (voltar para a lista) ----------
function perguntarSair() {
  $("folha").classList.remove("show");
  $("sairTexto").textContent = `O filme continua para quem ficar. Dá para voltar pelo código ${codigo} enquanto a sala existir.`;
  $("sair").classList.add("show");
}
async function sairDaSala() {
  $("sairConfirmar").disabled = true;
  saindo = true; // este pause é só meu: o filme continua para quem ficar
  try {
    const pos = posDaSala();
    video.pause();
    cofre?.fechar();
    guardarPonto(pos);
    await remove(r(`pessoas/${uid}`));
    // Último a sair: para o filme aqui e marca a sala como vazia (é apagada 10 min depois, como quando fecha o app).
    const resto = (await get(r("pessoas"))).val();
    if (!resto) {
      await set(r("estado"), { tocando: false, pos, em: serverTimestamp(), por: uid }).catch(() => {});
      await set(ref(db, `vazias/${codigo}`), serverTimestamp()).catch(() => {});
    }
  } catch (e) { console.warn("Matinê: saída da sala", e); }
  location.replace(location.pathname); // recarrega na lista; a conexão fecha e o resto é limpo sozinho
}
$("sairTopo").addEventListener("click", perguntarSair);
$("sairFolha").addEventListener("click", perguntarSair);
$("sairConfirmar").addEventListener("click", sairDaSala);
$("sairFicar").addEventListener("click", () => $("sair").classList.remove("show"));
$("sair").addEventListener("click", (e) => { if (e.target.id === "sair") $("sair").classList.remove("show"); });
addEventListener("popstate", () => {
  if (!$("sala").classList.contains("on")) return;
  history.pushState({ sala: codigo }, ""); // continua na sala até confirmar
  if ($("sair").classList.contains("show")) $("sair").classList.remove("show"); else perguntarSair();
});

// ---------- Folha: convidar e trocar filme ----------
$("mini").addEventListener("click", () => { $("codigoFolha").textContent = codigo; $("trocaFilme").hidden = true; $("folha").classList.add("show"); desenharDiagnostico(); });
/** O que está acontecendo neste aparelho e com cada pessoa. Serve para descobrir por que travou. */
function desenharDiagnostico() {
  const src = String(video.src);
  const modo = !src ? "sem vídeo" : src.startsWith("embed:") ? "player do site" : src.startsWith("blob:") ? "convertendo aqui" : "direto";
  const dif = estado && video.readyState >= 1 ? video.currentTime - esperado(estado, agora()) : null;
  const c = cofre?.info();
  const linhas = [
    `Este aparelho: ${dif === null ? "carregando" : `${dif >= 0 ? "+" : ""}${dif.toFixed(2).replace(".", ",")} s da sala`} · ${modo}`,
    c ? `Guardado aqui: ${Math.floor(c.feito * 100)}% · ${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"} ao Drive${c.erro ? ` · parou: ${c.erro}` : ""}`
      : urlDoFilme.includes("googleapis.com") ? "Guardado aqui: indisponível neste aparelho (tocando direto do Drive)" : "",
    ...Object.entries(pessoas).filter(([id]) => id !== uid).map(([, p]) => `${p.nome}: ${p.erro ? `erro: ${p.erro}` : p.fora ? "fora da aba" : estado?.prep && p.pronto !== estado.prep ? "carregando" : "assistindo"}`),
  ].filter(Boolean);
  $("diag").replaceChildren(...linhas.map((l) => Object.assign(document.createElement("div"), { textContent: l })));
}
setInterval(() => { if ($("folha").classList.contains("show")) desenharDiagnostico(); }, 1000);
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
    const capa = (await capaDaTroca.pronta()) || null;
    // `item: null`: o filme novo não é o da lista, então chegar em 92% dele não marca o antigo como visto.
    await update(r("info"), { dono: uid, item: null, link: link.trim(), titulo: $("novoTitulo").value.trim() || capa?.titulo || nomeDoArquivo(link), capa, chaveDrive: v.drive ? minhaChaveDrive : null });
    await set(r("estado"), { tocando: false, pos: 0, em: serverTimestamp(), por: uid });
    set(r("ponto"), { pos: 0, em: serverTimestamp() }).catch(() => {});
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
