// Dados do projeto do Firebase. A chave não fica no repositório: o GitHub Actions coloca a chave
// (segredo FIREBASE_API_KEY) na hora de publicar o site (.github/workflows/site.yml).
export const firebaseConfig = {
  apiKey: "__CHAVE_FIREBASE__", // trocada pela chave guardada no GitHub (segredo FIREBASE_API_KEY) na hora de publicar
  authDomain: "matine-d6bcc.firebaseapp.com",
  databaseURL: "https://matine-d6bcc-default-rtdb.firebaseio.com",
  projectId: "matine-d6bcc",
  appId: "1:204385581159:web:3a3f5740b2d01fa01b3cc2",
};

// Opcional: chave do Google para tocar links do Google Drive (README, passo 4). Vazio = links do Drive desligados.
export const chaveDrive = "";
