# Matinê

Assistir filmes juntos, cada um no seu aparelho, no mesmo segundo. Uma pessoa cola o link de um vídeo, abre a sala e manda o convite; quem abrir o link (no Android, no iPhone ou no computador) assiste sincronizado, com chat, reações e lista de quem está na sala. Todo mundo pode dar play, pausar e pular.

- **Site:** https://dmwnezes.github.io/matine/
- **App Android:** https://github.com/dmwnezes/matine/releases/latest/download/Matine.apk (o mesmo site numa janela própria, com tela cheia, tela sempre acesa e "Abrir com Matinê" nos convites)

## Como funciona

Cada pessoa carrega o vídeo direto do link. A sala só guarda **o estado** — tocando ou pausado, em que segundo, a que horas — usando o relógio do servidor do Firebase, para que aparelhos com relógios diferentes concordem. Cada aparelho calcula onde o filme deveria estar e:

- se estiver a mais de 1,5 s de diferença, pula para o ponto certo;
- se estiver perto, acelera ou freia de leve (até 10%) até encostar, sem tranco;
- só avisa a sala quando a pessoa faz algo de verdade (play, pause, pulo). Quando o vídeo está só obedecendo a sala, nada volta — é isso que evita o "eco" de comandos.

Bloquear a tela ou trocar de app no celular não pausa a sala; ao voltar, o vídeo alcança os outros sozinho.

## Links que funcionam

- Link direto de arquivo de vídeo (`.mp4` com H.264 é o que toca em todo lugar, inclusive no iPhone).
- Dropbox (o link de compartilhar é convertido sozinho).
- Google Drive, se a chave do Google estiver no `config.js` (passo 4) e o arquivo estiver compartilhado como "qualquer pessoa com o link". O Google pode bloquear arquivos muito baixados ("limite de downloads"); aí a sala avisa que não conseguiu abrir.
- YouTube **não** funciona (o YouTube não deixa tocar fora do player dele).

## Configurar (uma vez só)

### 1. Repositório e site

1. Crie o repositório **dmwnezes/matine** (público) e envie estes arquivos.
2. No GitHub: **Settings > Pages > Build and deployment > Deploy from a branch**, branch **main**, pasta **/ (root)**. Salve. Em um minuto o site fica em `https://dmwnezes.github.io/matine/`.

O APK é gerado sozinho pelo GitHub Actions a cada mudança na pasta `app/` e aparece em **Releases**.

### 2. Firebase (leva play/pause, chat e quem está na sala)

1. Em [console.firebase.google.com](https://console.firebase.google.com), **Adicionar projeto** > nome **matine**. Pode desligar o Google Analytics.
2. **Criação > Authentication > Começar > Método de login > Anônimo > Ativar**. (Cada aparelho entra com um usuário anônimo; ninguém precisa de conta.)
3. **Criação > Realtime Database > Criar banco de dados** > local **Estados Unidos** > **modo bloqueado**.
4. Na aba **Regras**, apague tudo, cole o conteúdo do arquivo [`database.rules.json`](database.rules.json) e toque em **Publicar**.
5. Em **Configurações do projeto** (engrenagem) > **Seus apps** > ícone **`</>`** (Web) > apelido **matine** > **Registrar app**. Copie os valores do `firebaseConfig` que aparecem para o arquivo [`config.js`](config.js) e envie para o GitHub.

Esses valores não são segredo (todo site com Firebase mostra os seus). Quem protege as salas são as regras: só entra quem tem o código da sala, ninguém consegue listar as salas, só o dono troca o filme e cada um só escreve o próprio nome e as próprias mensagens.

### 3. Pronto

Abra o site, escreva seu nome, cole o link de um vídeo e toque em **Abrir sala**. Toque na faixa de pessoas (embaixo do vídeo) para **Convidar** ou **Trocar filme**.

### 4. (Opcional) Links do Google Drive

1. Em [console.cloud.google.com](https://console.cloud.google.com), escolha o projeto **matine** (o Firebase criou) > **APIs e serviços > Biblioteca** > **Google Drive API** > **Ativar**.
2. **APIs e serviços > Credenciais > Criar credenciais > Chave de API**.
3. Edite a chave: em **Restrições de aplicativo**, escolha **Sites** e adicione `https://dmwnezes.github.io/*`; em **Restrições de API**, escolha só **Google Drive API**. Salve.
4. Cole a chave em `chaveDrive` no `config.js`.

## Testar no computador

```bash
npm test                 # lógica da sincronia (sync.js)
./gradlew assembleRelease   # APK (precisa do Android SDK)
```

Abrindo o site em `localhost`, ele usa o emulador do Firebase (`firebase emulators:start --only database,auth`) em vez do banco de verdade.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | Telas e visual (paleta "Noite suave", a mesma da Estante e do Palavreiro) |
| `app.js` | Sala: Firebase, player, chat, reações, convite |
| `sync.js` | Contas da sincronia e leitura dos links (testado em `test/`) |
| `config.js` | Dados do seu Firebase e chave opcional do Drive |
| `database.rules.json` | Regras de segurança do banco |
| `avatars.js` | Fotos de perfil (as mesmas da Estante) |
| `app/` | App Android (WebView que abre o site) |
