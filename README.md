# Matinê

Assistir filmes juntos, cada um no seu aparelho, no mesmo segundo. Uma pessoa cola o link de um vídeo, abre a sala e manda o convite; quem abrir o link (no Android, no iPhone ou no computador) assiste sincronizado, com chat, reações e lista de quem está na sala. Todo mundo pode dar play, pausar e pular.

- **Site:** https://dmwnezes.com/matine/
- **App Android:** https://github.com/dmwnezes/matine/releases/latest/download/Matine.apk (o mesmo site numa janela própria, com tela cheia, tela sempre acesa e "Abrir com Matinê" nos convites)

## Como funciona

Cada pessoa carrega o vídeo direto do link. A sala só guarda **o estado** — tocando ou pausado, em que segundo, a que horas — usando o relógio do servidor do Firebase, para que aparelhos com relógios diferentes concordem. Cada aparelho calcula onde o filme deveria estar e:

- se estiver a mais de 1,5 s de diferença, pula para o ponto certo;
- se estiver perto, acelera ou freia de leve (até 10%) até encostar, sem tranco;
- só avisa a sala quando a pessoa faz algo de verdade (play, pause, pulo). Quando o vídeo está só obedecendo a sala, nada volta — é isso que evita o "eco" de comandos.

Quando a sala está pausada e alguém dá play, todo mundo vê uma contagem 3, 2, 1 e o filme começa no mesmo instante para todos.

Ao guardar um filme, a Matinê busca o nome e a capa no IMDb (pelo nome digitado ou pelo nome do arquivo; o ano no nome do arquivo ajuda a escolher o filme certo). Sem nome digitado, o filme fica com o nome do IMDb. Se vier o filme errado, toque em "Não é esse filme" para ver o próximo resultado. A capa aparece no convite, na sala e no vídeo antes do play. O link mandado no WhatsApp/Instagram mostra o cartão da Matinê (a capa de cada filme não aparece ali porque o site é estático, sem servidor).

**Lista "Para ver depois":** a tela inicial é uma lista compartilhada de filmes. O **+** abre uma gaveta: cole o link (o mesmo tipo de link de sempre), veja a capa e toque em **Guardar** ou **Assistir agora**. O filme mais antigo ainda não visto vira a **Próxima sessão**, com o botão **Abrir sala**; os outros ficam na fileira de baixo. A aba **Já vimos** guarda o histórico: o filme vai para lá sozinho quando a sala passa de 92% dele (filmes com mais de 10 min), ou pelo botão **Já vimos** nos detalhes. Quem entra numa sala aberta pela lista passa a ver e adicionar na mesma lista (o que essa pessoa tinha numa lista própria vai junto); o botão **Compartilhar a lista** manda um link direto para ela. A lista fica no banco em `listas/<código>`; o código tem 16 letras e números e só quem o recebe consegue ler a lista.

**Player:** toque mostra/esconde os controles; toque duplo nos lados volta/avança 10 s (cada toque a mais soma 10); toque duplo no meio dá play/pausa; deslizar na esquerda muda o brilho e na direita o volume. No computador: espaço, setas e F.

**TV:** o botão de TV manda o filme para o Chromecast/Google TV (app Android e Chrome) ou Apple TV (AirPlay no iPhone). No app, o celular fica mudo e vira controle: botões e gestos mexem na sala e a TV acompanha; play/pausa feitos pelo controle da TV também valem para a sala. Só vai para a TV o arquivo original (MP4/WebM/HLS); vídeo convertido na hora não vai, e link do Drive só vai se a chave do Drive não estiver restrita a sites.

**Sala que se apaga:** quando a última pessoa sai, a sala é marcada como vazia; 10 min depois ela é apagada (com chat e tudo) por quem abrir a Matinê. Voltar antes disso (ex.: recarregar a página) mantém a sala.

**Fotos no chat:** o botão de imagem ao lado do campo de mensagem manda uma foto, reduzida no próprio aparelho (até ~200 KB) e guardada na sala, que é apagada junto com ela. Tocar na foto abre em tela cheia.

**Comandos secretos:** `/brotos` e `/tchau`, `/carta texto`, `/pipoca`, `/confete`, `/dado`, `/moeda` e `/luz` aparecem na tela de todos da sala. Dado e moeda dão o mesmo resultado para todos.

**Atualização:** o app Android confere as Releases do GitHub ao abrir (no máximo a cada 6 h), pergunta, baixa e abre o instalador.

Bloquear a tela ou trocar de app no celular não pausa a sala; ao voltar, o vídeo alcança os outros sozinho.

## Arquivos e links que funcionam

**Formatos:** MP4, M4V, MKV, WebM, MOV, MPEG-TS (.ts), HLS (.m3u8), OGG e arquivos só de áudio (MP3, FLAC, WAV, AAC).
**Vídeo:** H.264, H.265/HEVC, VP8, VP9 e AV1. **Áudio:** AAC, MP3, Opus, Vorbis, FLAC, PCM e Dolby Digital (AC-3 / E-AC-3, comum em filmes MKV).

Como funciona: se o aparelho toca o arquivo do jeito que ele é, toca direto. Se não toca (um MKV no iPhone, áudio Dolby, HEVC num aparelho sem decodificador…), o site converte **enquanto o filme passa**, só a parte necessária: o que já é compatível é copiado, o resto é recodificado no próprio aparelho. Som 5.1 vira estéreo. Pular para um trecho ainda não convertido recomeça a conversão dali.

Limites:
- **AVI, WMV, FLV e DivX/Xvid** não abrem — converta para MP4 antes.
- HEVC só toca em aparelhos que decodificam HEVC (a maioria dos celulares recentes e o iPhone; alguns computadores não).
- A conversão usa o processador do aparelho: filmes 4K com áudio Dolby podem engasgar em celulares fracos.
- O servidor do arquivo precisa permitir leitura por outros sites (CORS) para a conversão funcionar. Google Drive (com a chave do passo 4), Dropbox, Archive.org e a maioria dos servidores de arquivos permitem; se não permitir, a sala tenta tocar direto.

**Links:**
- Link direto do arquivo.
- Dropbox (o link de compartilhar é convertido sozinho).
- Google Drive, com a chave do Google Drive (passo 4) e o arquivo estiver compartilhado como "qualquer pessoa com o link". O Google pode bloquear arquivos muito baixados ("limite de downloads"); aí a sala avisa que não conseguiu abrir.
- **YouTube e Vimeo** (link do vídeo, Shorts, `youtu.be`, `vimeo.com/123` ou não listado `vimeo.com/123/abc`): toca no player do próprio site, embutido na sala, e sincroniza do mesmo jeito. Os controles e gestos são os da Matinê (o player embutido não recebe toques, para a sala sempre ficar sabendo). Limites: não vai para a TV nem para a janelinha flutuante do navegador; a correção fina de velocidade não existe nesses sites, então a sala só pula quando alguém passa de 1,5 s de diferença; vídeo com incorporação bloqueada pelo dono, privado ou com senha não abre.

## Configurar (uma vez só)

### 1. Repositório e site

1. Crie o repositório **dmwnezes/matine** (público) e envie estes arquivos.
2. No GitHub: **Settings > Pages > Build and deployment > Deploy from a branch**, branch **main**, pasta **/ (root)**. Salve. Em um minuto o site fica em `https://dmwnezes.com/matine/` (o domínio dmwnezes.com vale para todos os repositórios com Pages).

O APK é gerado sozinho pelo GitHub Actions a cada mudança na pasta `app/` e aparece em **Releases**.

### 2. Firebase (leva play/pause, chat e quem está na sala)

1. Em [console.firebase.google.com](https://console.firebase.google.com), **Adicionar projeto** > nome **matine**. Pode desligar o Google Analytics.
2. **Criação > Authentication > Começar > Método de login > Anônimo > Ativar**. (Cada aparelho entra com um usuário anônimo; ninguém precisa de conta.)
3. **Criação > Realtime Database > Criar banco de dados** > local **Estados Unidos** > **modo bloqueado**.
4. Na aba **Regras**, apague tudo, cole o conteúdo do arquivo [`database.rules.json`](database.rules.json) e toque em **Publicar**.
5. Em **Configurações do projeto** (engrenagem) > **Seus apps** > ícone **`</>`** (Web) > apelido **matine** > **Registrar app**. Copie os valores do `firebaseConfig` que aparecem para o arquivo [`config.js`](config.js), **menos a `apiKey`**, e envie para o GitHub.
6. Abra o site uma vez e cole a `apiKey` quando ele pedir. Ela fica guardada no aparelho e vai junto em todo convite (`#CODIGO~CHAVE`), então quem entra por convite não digita nada. Assim a chave nunca fica no repositório e o GitHub não acusa chave exposta.

Esses valores não são segredo (todo site com Firebase mostra os seus). Quem protege as salas são as regras: só entra quem tem o código da sala, ninguém consegue listar as salas, só o dono troca o filme e cada um só escreve o próprio nome e as próprias mensagens.

### 3. Pronto

Abra o site, escreva seu nome, cole o link de um vídeo e toque em **Abrir sala**. Toque na faixa de pessoas (embaixo do vídeo) para **Convidar** ou **Trocar filme**.

### 4. (Opcional) Links do Google Drive

1. Em [console.cloud.google.com](https://console.cloud.google.com), escolha o projeto **matine** (o Firebase criou) > **APIs e serviços > Biblioteca** > **Google Drive API** > **Ativar**.
2. **APIs e serviços > Credenciais > Criar credenciais > Chave de API**.
3. Edite a chave: em **Restrições de aplicativo**, escolha **Sites** e adicione `https://dmwnezes.com/*`; em **Restrições de API**, escolha só **Google Drive API**. Salve.
4. Na primeira vez que você abrir uma sala com link do Drive, o site pede essa chave (só uma vez). Ela fica no aparelho e vai junto na sala para os convidados.

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
| `capa.js` | Nome e capa do filme pelo IMDb (busca do próprio IMDb, sem chave) |
| `video.js` | Abre o vídeo: direto quando o aparelho toca, ou convertendo em tempo real ([Mediabunny](https://mediabunny.dev)) |
| `embed.js` | YouTube e Vimeo embutidos, fingindo ser o `<video>` para a sincronia e os controles |
| `config.js` | Dados do seu Firebase e chave opcional do Drive |
| `database.rules.json` | Regras de segurança do banco |
| `avatars.js` | Fotos de perfil (as mesmas da Estante) |
| `app/` | App Android (WebView que abre o site) |
