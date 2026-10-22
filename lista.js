// Lista compartilhada "Para ver depois": quem tem o código da lista (o seu aparelho, ou quem entrou numa
// sala aberta por ela) vê, adiciona e marca os filmes. O código é longo e aleatório, como uma senha.

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const sorteio = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function novaLista(aleatorio = sorteio) {
  let l = "";
  for (let i = 0; i < 16; i++) l += LETRAS[Math.floor(aleatorio() * LETRAS.length)];
  return l;
}

export const listaValida = (l) => /^[A-Za-z0-9]{16}$/.test(l || "");

/**
 * Filmes do banco → o que a tela mostra: a próxima sessão (o mais antigo ainda não visto),
 * o resto da fila em ordem de chegada e os vistos do mais recente para o mais antigo.
 */
export function organizar(filmes) {
  const todos = Object.entries(filmes || {})
    .filter(([, f]) => f && typeof f.link === "string")
    .map(([id, f]) => ({ ...f, id }));
  const fila = todos.filter((f) => !f.visto).sort((a, b) => (a.em || 0) - (b.em || 0));
  const vistos = todos.filter((f) => f.visto).sort((a, b) => b.visto - a.visto);
  return { proxima: fila[0] || null, fila: fila.slice(1), vistos };
}

/** O mesmo link já está na lista (ainda para ver)? */
export const jaNaFila = (filmes, link) =>
  Object.values(filmes || {}).some((f) => f && !f.visto && String(f.link).trim() === String(link).trim());
