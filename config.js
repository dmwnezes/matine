// Preencha uma vez com os dados do seu projeto do Firebase (veja o README, passo 2).
// Esses dados não são segredo: quem protege a sala são as regras do banco (database.rules.json).
export const firebaseConfig = {
  authDomain: "matine-d6bcc.firebaseapp.com",
  databaseURL: "https://matine-d6bcc-default-rtdb.firebaseio.com",
  projectId: "matine-d6bcc",
  appId: "1:204385581159:web:3a3f5740b2d01fa01b3cc2",
};

// Chaves do Firebase (apiKey) e do Google Drive. Não são segredo (só funcionam no dmwnezes.com, pelas
// restrições no Google Cloud); o alerta do GitHub sobre elas pode ser fechado como "False positive".
// Vazias = o site pede cada uma uma vez e leva no convite.
export const chaveFirebase = "AIzaSyBaOVrcCVxUwucD1kmU0edUcLeZIVNehFE";
export const chaveDriveFixa = "AIzaSyD3dpL49NNV6T0FQSGAuOviontjGJ06b-U";

// Chave do TMDB (themoviedb.org) para nome, capa e sinopse dos filmes — a mesma usada na Estante.
// Vazia = os filmes ficam sem capa (o resto funciona igual).
export const chaveTmdb = "";
