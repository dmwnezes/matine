// Dois aparelhos de mentira numa sala de verdade: Chromium + emulador do Firebase + um Drive falso (com limite de banda).
// Rodar: npm run test:e2e   (precisa de Java, ffmpeg e de: npm i --no-save playwright firebase@10.14.1 mediabunny@1.62.0 firebase-tools@15)
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, statSync, createReadStream, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, resolve } from "node:path";
import { setTimeout as dormir } from "node:timers/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const raiz = resolve(import.meta.dirname, "../..");
const { chromium } = require("playwright");
const tmp = mkdtempSync(join(tmpdir(), "matine-"));
const NS = "matine-d6bcc-default-rtdb";
const ok = (nome, extra = "") => console.log(`  ok  ${nome}${extra ? `  (${extra})` : ""}`);

// ---------- Filmes de teste ----------
const WEBM = join(tmp, "f.webm"), MKV = join(tmp, "f.mkv");
execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=120", "-f", "lavfi", "-i", "sine=frequency=440:duration=120", "-c:v", "libvpx-vp9", "-b:v", "3M", "-deadline", "realtime", "-cpu-used", "8", "-g", "48", "-c:a", "libopus", "-y", WEBM]);
execFileSync("ffmpeg", ["-v", "error", "-i", WEBM, "-c", "copy", "-y", MKV]);
const ARQUIVOS = { Filme1111111111: { c: WEBM, tipo: "video/webm" }, Filme2222222222: { c: WEBM, tipo: "video/webm" }, Convertido333333: { c: MKV, tipo: "video/x-matroska" } };

// ---------- Drive falso ----------
const drive = { pedidos: {}, quota: false, velocidade: 512 * 1024 };
const pedidosDe = (id) => drive.pedidos[id] || 0;
const servidorDrive = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range,Content-Length", "Access-Control-Allow-Headers": "*" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return; }
  const arq = ARQUIVOS[u.pathname.split("/").pop()];
  if (!arq) { res.writeHead(404, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ error: { errors: [{ reason: "notFound" }] } })); return; }
  const total = statSync(arq.c).size;
  if (u.searchParams.get("fields")) {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ size: String(total), mimeType: arq.tipo, name: "filme", modifiedTime: "2026-01-01T00:00:00Z" }));
    return;
  }
  drive.pedidos[u.pathname.split("/").pop()] = pedidosDe(u.pathname.split("/").pop()) + 1;
  if (drive.quota) { res.writeHead(403, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ error: { errors: [{ reason: "downloadQuotaExceeded" }] } })); return; }
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "bytes=0-");
  const ini = Number(m[1]), fim = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
  res.writeHead(206, { ...cors, "Content-Type": arq.tipo, "Content-Length": fim - ini + 1, "Content-Range": `bytes ${ini}-${fim}/${total}`, "Accept-Ranges": "bytes" });
  const leitura = createReadStream(arq.c, { start: ini, end: fim, highWaterMark: 64 * 1024 });
  leitura.on("data", async (d) => {
    leitura.pause();
    res.write(d);
    await dormir(1000 * d.length / drive.velocidade);
    if (!res.destroyed) leitura.resume();
  });
  leitura.on("end", () => res.end());
  res.on("close", () => leitura.destroy());
});
await new Promise((ok) => servidorDrive.listen(8443, "127.0.0.1", ok));

// ---------- Site ----------
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };
const servidorSite = createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  try {
    let dados = readFileSync(join(raiz, p === "/" ? "index.html" : p));
    // O site de teste fala com o Drive falso; nenhum pedido sai para o Google.
    if (p.endsWith(".js")) dados = dados.toString().replaceAll("https://www.googleapis.com", "http://127.0.0.1:8443");
    res.writeHead(200, { "Content-Type": TIPOS[extname(p || ".html")] || "text/html", "Cache-Control": "no-store" }).end(dados);
  } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => servidorSite.listen(8123, "127.0.0.1", ok));
const SITE = "http://localhost:8123/";

// ---------- Emulador ----------
const emulador = spawn("npx", ["firebase", "emulators:start", "--only", "auth,database", "--project", "demo-matine"], { cwd: raiz, stdio: "ignore", detached: true });
const fimEmulador = () => { try { process.kill(-emulador.pid); } catch {} };
for (let i = 0; ; i++) {
  try { await fetch(`http://127.0.0.1:9000/.json?ns=${NS}`); await fetch("http://127.0.0.1:9099/"); break; }
  catch { if (i > 120) throw new Error("emulador não subiu"); await dormir(1000); }
}
const banco = async (caminho, metodo = "GET", corpo) => (await fetch(`http://127.0.0.1:9000/${caminho}.json?ns=${NS}`, { method: metodo, headers: { Authorization: "Bearer owner" }, body: corpo && JSON.stringify(corpo) })).json();
const regras = await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${NS}`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: readFileSync(join(raiz, "database.rules.json")) });
assert.equal(regras.status, 200, "regras do banco inválidas");

// ---------- Navegador ----------
const navegador = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const LIBS = { "firebasejs/10.14.1/": "node_modules/firebase/", "mediabunny@1.62.0/dist/bundles/": "node_modules/mediabunny/dist/bundles/" };
async function aparelho(nome) {
  const contexto = await navegador.newContext({ ignoreHTTPSErrors: true });
  await contexto.addInitScript((n) => { try { if (!localStorage.getItem("matine-nome")) localStorage.setItem("matine-nome", n); } catch {} }, nome);
  // Como num iPhone: MKV não toca direto, precisa da conversão na hora.
  await contexto.addInitScript(() => { const o = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (t) { return /matroska/.test(t) ? "" : o.call(this, t); }; });
  await contexto.route(/^https:\/\/(www\.gstatic\.com|cdn\.jsdelivr\.net)\//, (rota) => {
    const u = rota.request().url();
    const lib = Object.keys(LIBS).find((k) => u.includes(k));
    if (!lib) return rota.abort();
    return rota.fulfill({ contentType: "text/javascript", body: readFileSync(join(raiz, LIBS[lib], u.split(lib)[1])) });
  });
  await contexto.route(/^https:\/\/(fonts\.|api\.themoviedb|image\.tmdb)/, (r) => r.abort());
  const pagina = await contexto.newPage();
  pagina.on("pageerror", (e) => console.log(`  [${nome}] erro na página: ${e.message}`));
  if (process.env.VERBOSO) pagina.on("console", (m) => { if (m.type() !== "log") console.log(`  [${nome}] ${m.text().slice(0, 300)}`); });
  return { contexto, pagina, nome };
}
const v = (a) => a.pagina.evaluate(() => { const x = document.getElementById("video"); return { t: x.currentTime, parado: x.paused, rs: x.readyState, src: x.src, err: x.error?.code }; });
async function ate(cond, ms, oQue) {
  const fim = Date.now() + ms;
  for (;;) { const r = await cond(); if (r) return r; if (Date.now() > fim) throw new Error(`demorou demais: ${oQue}`); await dormir(100); }
}
const pular = (a, seg) => a.pagina.evaluate((s) => { const b = document.getElementById("cBarra"), x = document.getElementById("video"); b.value = Math.round((s / x.duration) * 1000); b.dispatchEvent(new Event("change")); }, seg);
const tocando = (a) => ate(async () => { const s = await v(a); return !s.parado && s.rs >= 3; }, 40000, `${a.nome} tocar`);
const preparado = async (a) => { await a.pagina.waitForFunction(() => document.getElementById("sala").classList.contains("on")); await ate(async () => (await v(a)).rs >= 1, 40000, `${a.nome} carregar`); };

/** Abre sala nova com o arquivo `id` e devolve o código. */
async function abrirSala(a, id, esperar = true) {
  await a.pagina.goto(SITE);
  await a.pagina.click("#adicionar");
  await a.pagina.fill("#link", `https://drive.google.com/file/d/${id}/view`);
  await a.pagina.fill("#titulo", id);
  await a.pagina.click("#novoAssistir");
  if (esperar) await preparado(a);
  else await a.pagina.waitForFunction(() => document.getElementById("sala").classList.contains("on"));
  return a.pagina.evaluate(() => location.hash.slice(1).split("~")[0]);
}
async function entrar(a, codigo) {
  await a.pagina.goto("about:blank");
  await a.pagina.goto(`${SITE}#${codigo}`);
  await a.pagina.click("#entrar");
  await preparado(a);
}
const diferenca = async (a, b) => { const [x, y] = await Promise.all([v(a), v(b)]); return Math.abs(x.t - y.t); };
const mediana = (l) => [...l].sort((x, y) => x - y)[Math.floor(l.length / 2)];

let falhou = false;
try {
  const A = await aparelho("Daniel"), B = await aparelho("Mandi");
  await A.pagina.goto(SITE); await A.pagina.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
  await B.pagina.goto(SITE); await B.pagina.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });

  console.log("Sala com dois aparelhos");
  const F = "Filme1111111111";
  const codigo = await abrirSala(A, F);
  await entrar(B, codigo);
  assert.ok((await v(A)).src.includes("__filme/"), "o vídeo devia passar pelo cofre");
  await A.pagina.click("#mini", { force: true }); await dormir(300);
  assert.match(await A.pagina.textContent("#diag"), /pedido/); await A.pagina.click("#fechar");

  await A.pagina.evaluate(() => document.getElementById("cPlay").click());
  await ate(async () => (await banco(`salas/${codigo}/estado`)).tocando, 20000, "a sala soltar o play");
  await Promise.all([tocando(A), tocando(B)]);
  await dormir(3000);
  const difs = [];
  for (let i = 0; i < 10; i++) { difs.push(await diferenca(A, B)); await dormir(400); }
  assert.ok(mediana(difs) < 0.25, `diferença alta: ${difs}`);
  ok("começam juntos", `diferença mediana ${mediana(difs).toFixed(3)} s, pior ${Math.max(...difs).toFixed(3)} s`);

  console.log("Troca de aba");
  const antes = await banco(`salas/${codigo}/estado`);
  // Cada navegador entrega os eventos numa ordem. O pior caso: o pause chega antes de a aba constar como escondida...
  await B.pagina.evaluate(() => { document.getElementById("video").pause(); Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await dormir(4000);
  // ...e o vídeo volta atrasado, dando play e pulo antes de saber da sala. Era isso que arrastava todo mundo.
  await B.pagina.evaluate(() => new Promise((ok) => { const x = document.getElementById("video"); x.addEventListener("seeked", ok, { once: true }); x.currentTime = Math.max(0, x.currentTime - 8); }));
  await B.pagina.evaluate(() => { delete document.hidden; document.getElementById("video").play(); document.dispatchEvent(new Event("visibilitychange")); });
  await dormir(1500);
  const depois = await banco(`salas/${codigo}/estado`);
  assert.equal(depois.em, antes.em, "aba trocada mexeu na sala");
  assert.equal(depois.pos, antes.pos, "aba trocada mexeu na sala");
  assert.equal((await v(A)).parado, false);
  await ate(async () => (await diferenca(A, B)) < 0.5, 12000, "quem voltou da aba alcançar");
  ok("trocar de aba não mexe em ninguém e quem voltou alcança sozinho");

  console.log("Pulos e o Drive");
  const seguroAte = (await v(A)).t;
  await dormir(1000);
  const p0 = pedidosDe(F);
  for (const s of [seguroAte - 5, seguroAte - 8, seguroAte - 3]) {
    await pular(A, Math.max(0, s));
    await ate(async () => (await banco(`salas/${codigo}/estado`)).tocando, 15000, "soltar depois do pulo");
    await Promise.all([tocando(A), tocando(B)]);
  }
  assert.equal(pedidosDe(F), p0, "voltar para trecho já guardado não pode pedir nada ao Drive");
  ok("3 pulos para trás: 0 pedidos ao Drive");
  await pular(A, 100);
  const antesDoFim = Date.now();
  // Internet de teste bem lenta: o aparelho atrasado pode segurar a sala de novo antes de alinhar.
  await ate(async () => {
    const [x, y] = await Promise.all([v(A), v(B)]);
    return !x.parado && !y.parado && x.rs >= 3 && y.rs >= 3 && x.t > 100 && Math.abs(x.t - y.t) < 0.4;
  }, 70000, "os dois tocando juntos depois do pulo longo");
  const demora = (Date.now() - antesDoFim) / 1000;
  const pedidosNoLongo = pedidosDe(F) - p0;
  assert.ok(pedidosNoLongo <= 2, `pulo longo pediu ${pedidosNoLongo} vezes`);
  await dormir(2500);
  const dif = await diferenca(A, B);
  assert.ok(dif < 0.4, `depois do pulo: ${dif}`);
  ok("pulo para trecho novo", `${pedidosNoLongo} pedidos nos 2 aparelhos, ${demora.toFixed(1)} s até tocar a 0,5 MB/s, diferença ${dif.toFixed(3)} s`);

  console.log("Espera eu");
  await entrar(B, codigo); // aparelho novo: sem o intervalo mínimo entre esperas
  await pular(A, 20);
  await ate(async () => (await banco(`salas/${codigo}/estado`)).tocando, 40000, "soltar");
  await Promise.all([tocando(A), tocando(B)]);
  await dormir(1500);
  await B.pagina.evaluate(() => { const x = document.getElementById("video"); Object.defineProperty(x, "readyState", { get: () => 2, configurable: true }); });
  const espera = await ate(async () => { const e = await banco(`salas/${codigo}/estado`); return e.vinha === "espera" && e; }, 8000, "a sala esperar");
  await ate(async () => (await v(A)).parado, 3000, "o outro parar");
  assert.equal(espera.tocando, false);
  await B.pagina.evaluate(() => { delete document.getElementById("video").readyState; });
  await ate(async () => (await banco(`salas/${codigo}/estado`)).tocando, 20000, "voltar a tocar depois da espera");
  await Promise.all([tocando(A), tocando(B)]);
  ok("quem trava segura a sala e todos voltam juntos");

  console.log("Sair da sala");
  await dormir(1500);
  const ponto = await banco(`salas/${codigo}/ponto`);
  await B.pagina.evaluate(() => { document.getElementById("sairConfirmar").click(); });
  await B.pagina.waitForFunction(() => !location.hash, null, { timeout: 8000 });
  await dormir(1000);
  assert.equal((await banco(`salas/${codigo}/estado`)).tocando, true, "quem saiu pausou a sala");
  assert.equal((await v(A)).parado, false);
  ok("quem sai não pausa quem fica");

  console.log("Comando da sala");
  const info = await banco(`salas/${codigo}/info`);
  assert.ok(info.item, "sala aberta pela lista tem o item");
  await A.pagina.evaluate(() => document.getElementById("mini").click());
  await A.pagina.click("#trocar");
  await A.pagina.fill("#novoLink", "https://drive.google.com/file/d/Filme2222222222/view");
  await A.pagina.click("#salvarFilme");
  await ate(async () => (await banco(`salas/${codigo}/info`)).link?.includes("Filme2222222222"), 5000, "trocar filme");
  assert.ok(!(await banco(`salas/${codigo}/info`)).item, "filme trocado não pode marcar o da lista");
  ok("trocar filme solta o filme da lista");

  console.log("Sala vazia não anda sozinha");
  await preparado(A);
  await A.pagina.evaluate(() => document.getElementById("cPlay").click());
  await ate(async () => (await banco(`salas/${codigo}/estado`)).tocando, 20000, "tocar");
  await tocando(A);
  await ate(async () => (await banco(`salas/${codigo}/ponto`))?.pos > 0, 20000, "guardar o ponto");
  const guardado = (await v(A)).t;
  await A.pagina.goto("about:blank"); // fecha sem avisar, como o app sendo morto
  await dormir(6000);
  await entrar(B, codigo);
  const acordada = await banco(`salas/${codigo}/estado`);
  assert.equal(acordada.tocando, false, "sala vazia devia estar parada");
  assert.ok(acordada.pos <= guardado + 1, `andou sozinha: ${acordada.pos} > ${guardado}`);
  ok("quem volta encontra parado no último ponto", `${acordada.pos.toFixed(1)} s`);

  console.log("Continuar de onde parou");
  const lista = await B.pagina.evaluate(() => localStorage.getItem("matine-lista"));
  const filmes = await banco(`listas/${await A.pagina.goto(SITE).then(() => A.pagina.evaluate(() => localStorage.getItem("matine-lista")))}/filmes`);
  const salvo = Object.values(filmes || {}).find((f) => f.link.includes(F));
  assert.ok(lista, "quem entrou passou a ter a lista");
  assert.ok(salvo?.parou?.pos > 0, "o filme da lista devia guardar onde parou");
  await A.pagina.waitForFunction(() => /parou em/.test(document.getElementById("proxQuem").textContent), null, { timeout: 8000 });
  await A.pagina.click("#proxAbrir");
  await preparado(A);
  await ate(async () => Math.abs((await v(A)).t - salvo.parou.pos) < 1, 15000, "abrir no ponto guardado");
  ok("abre onde parou", `${salvo.parou.pos.toFixed(1)} s`);

  console.log("Limite do Drive");
  drive.quota = true;
  // Arquivo inteiro já guardado: toca e pula mesmo com o Drive bloqueado.
  await ate(() => A.pagina.evaluate(async (id) => (await (await caches.open("matine-cofre")).keys()).filter((q) => q.url.includes(`__cofre/${id}/`)).length > 14, F), 120000, "guardar o filme");
  await ate(async () => (await v(A)).rs >= 3, 15000, "continuar tocando com o Drive bloqueado");
  ok("filme já guardado toca com o Drive bloqueado");
  const novo = await abrirSala(A, "Convertido333333", false);
  await ate(() => A.pagina.evaluate(() => document.getElementById("aviso").classList.contains("show") && !/Conferindo/.test(document.getElementById("aviso").textContent)), 45000, "mostrar o motivo");
  const aviso = await A.pagina.textContent("#aviso");
  assert.match(aviso, /excesso de downloads/, aviso);
  ok("erro do Drive mostra o motivo de verdade", aviso.slice(0, 60));
  drive.quota = false;
  await A.pagina.click("#aviso button");
  await ate(async () => (await v(A)).rs >= 1, 45000, "voltar depois do limite");
  assert.ok(novo);
  await A.pagina.evaluate(() => document.getElementById("cPlay").click());
  await tocando(A);
  await pular(A, 60);
  await ate(async () => (await banco(`salas/${novo}/estado`)).tocando, 30000, "soltar");
  await tocando(A);
  const conv = await v(A);
  assert.ok(conv.src.startsWith("blob:"), `devia estar convertendo: ${conv.src}`);
  ok("arquivo convertido na hora passa pelo cofre e pula");

  console.log("Regras do banco");
  const { initializeApp } = require("firebase/app");
  const dbm = require("firebase/database"), am = require("firebase/auth");
  const app1 = initializeApp({ apiKey: "x", databaseURL: `https://${NS}.firebaseio.com`, projectId: "demo-matine" }, "um");
  const app2 = initializeApp({ apiKey: "x", databaseURL: `https://${NS}.firebaseio.com`, projectId: "demo-matine" }, "dois");
  const cli = async (app) => {
    const db = dbm.getDatabase(app); dbm.connectDatabaseEmulator(db, "127.0.0.1", 9000);
    const au = am.getAuth(app); am.connectAuthEmulator(au, "http://127.0.0.1:9099", { disableWarnings: true });
    return { db, uid: (await am.signInAnonymously(au)).user.uid };
  };
  const [u1, u2] = [await cli(app1), await cli(app2)];
  const nega = async (p, oQue) => { await assert.rejects(p, /permission.denied/i, oQue); ok(`nega: ${oQue}`); };
  const deixa = async (p, oQue) => { await p; ok(`deixa: ${oQue}`); };
  const S = "ZZZZZZ", sala1 = (c, x) => dbm.ref(c.db, `salas/${S}/${x}`);
  await deixa(dbm.set(sala1(u1, "info"), { dono: u1.uid, link: "https://x/y", criada: dbm.serverTimestamp() }), "criar sala");
  await nega(dbm.get(dbm.ref(u2.db, "vazias")), "listar salas vazias");
  await deixa(dbm.set(dbm.ref(u1.db, `vazias/${S}`), dbm.serverTimestamp()), "marcar a própria sala como vazia");
  await deixa(dbm.get(dbm.ref(u2.db, `vazias/${S}`)), "ler a marca de uma sala cujo código conhece");
  await nega(dbm.set(dbm.ref(u2.db, `vazias/${S}`), 1000), "antedatar a marca para apagar a sala");
  await nega(dbm.remove(dbm.ref(u2.db, `salas/${S}`)), "apagar sala antes dos 10 min");
  await nega(dbm.set(sala1(u1, "estado"), { tocando: true, pos: 1, em: Date.now() + 3600000, por: u1.uid }), "travar a sala numa contagem de 1 h");
  await nega(dbm.set(sala1(u1, "estado"), { tocando: false, pos: -5, em: Date.now(), por: u1.uid }), "posição negativa");
  await deixa(dbm.set(sala1(u1, "estado"), { tocando: true, pos: 1, em: Date.now() + 3000, por: u1.uid }), "contagem normal");
  await deixa(dbm.set(sala1(u1, "ponto"), { pos: 1, em: dbm.serverTimestamp() }), "guardar o ponto");
  await deixa(dbm.set(sala1(u1, `pessoas/${u1.uid}`), { nome: "um" }), "entrar na sala");
  await nega(dbm.update(sala1(u2, "info"), { link: "https://z/z", dono: u2.uid }), "tomar o comando com o dono presente");
  await nega(dbm.update(sala1(u1, "info"), { dono: u2.uid }), "passar o comando para quem não está na sala");
  await deixa(dbm.set(sala1(u2, `pessoas/${u2.uid}`), { nome: "dois" }), "segunda pessoa entrar");
  await deixa(dbm.update(sala1(u1, "info"), { dono: u2.uid }), "passar o comando para quem está na sala");
  await deixa(dbm.update(sala1(u2, "info"), { dono: u1.uid }), "devolver o comando");
  await deixa(dbm.remove(sala1(u1, `pessoas/${u1.uid}`)), "dono sair");
  await deixa(dbm.update(sala1(u2, "info"), { dono: u2.uid, link: "https://z/z" }), "assumir o comando depois que o dono saiu");
  await deixa(dbm.onDisconnect(dbm.ref(u1.db, `vazias/${S}`)).set(dbm.serverTimestamp()), "combinar marca de vazia ao cair");
  dbm.goOffline(u1.db); await dormir(800);
  const marca = await dbm.get(dbm.ref(u2.db, `vazias/${S}`));
  assert.ok(marca.val() > Date.now() - 5000, "a marca ao cair devia ser agora");
  ok("marca de vazia ao cair é gravada");
  dbm.goOffline(u2.db);
  console.log("\nTudo certo.");
} catch (e) {
  falhou = true;
  console.error("\nFALHOU:", e.message);
} finally {
  await navegador.close().catch(() => {});
  fimEmulador();
  servidorDrive.close(); servidorSite.close();
  process.exit(falhou ? 1 : 0);
}
