# Matinê

Assistir filmes juntos, cada um no seu aparelho, no mesmo segundo. Uma pessoa cola o link de um vídeo, abre a sala e manda o convite; quem abrir o link (no Android, no iPhone ou no computador) assiste sincronizado, com chat, reações e lista de quem está na sala. Todo mundo pode dar play, pausar e pular.

- **Site:** https://dmwnezes.com/matine/
- **App Android:** https://github.com/dmwnezes/matine/releases/latest/download/Matine.apk (o mesmo site numa janela própria, com tela cheia, tela sempre acesa e "Abrir com Matinê" nos convites)

## Como funciona

Cada pessoa carrega o vídeo direto do link. A sala só guarda **o estado** — tocando ou pausado, em que segundo, a que horas — usando o relógio do servidor do Firebase, para que aparelhos com relógios diferentes concordem. Cada aparelho calcula onde o filme deveria estar e:

- se estiver a mais de 1,5 s de diferença, pula para o ponto certo;
- se estiver perto, acelera ou freia de leve (até 10%) até encostar, sem tranco;
- quem manda na sala são os comandos da pessoa (botões, gestos, controle da TV). Os eventos do vídeo não viram comando, a não ser que venham de uma tela do sistema (janelinha, tela cheia do iPhone). Assim um vídeo atrasado (aba trocada, tela bloqueada, travada) nunca arrasta os outros.

**Play e pulos esperam todo mundo:** quando alguém dá play ou pula, todos vão para o ponto e carregam. Só quando todos estão prontos (ou depois de 20 s) vem a contagem e o filme começa no mesmo instante. Quem saiu da aba ou está com erro não segura a sala.

**Espera eu:** quem travar por mais de 2,5 s com o filme andando faz a sala voltar ao ponto dele e esperar (no máximo 30 s, e no máximo uma vez a cada 40 s).

**Cofre (só links do Google Drive):** cada aparelho baixa o filme do Drive numa única conexão, do ponto atual até o fim, e guarda em blocos de 2 MB (`cofre.js`). O vídeo lê desses blocos (`sw.js`), então pular para um trecho já guardado não faz nenhum pedido ao Drive; pular para um trecho novo faz a conexão ir até lá. O Google não publica como conta o limite de downloads; a ideia é chamar o Drive o mínimo possível, mas o limite continua existindo: um arquivo já bloqueado só toca o que este aparelho já guardou. Ficam guardados o filme atual e os 2 últimos; "Apagar meus dados" apaga tudo. O filme inteiro é baixado mesmo que se assista só um pedaço, o que conta em dados móveis. Sem suporte ou sem espaço, o vídeo toca direto do link. O diagnóstico aparece tocando na faixa de pessoas.

Ao guardar um filme, a Matinê busca o nome, a capa e a sinopse em português no TMDB (themoviedb.org, o mesmo da Estante), pelo nome digitado ou pelo nome do arquivo; o ano no nome do arquivo ajuda a escolher o filme certo. Sem nome digitado, o filme fica com o nome do TMDB. Precisa da chave grátis do TMDB em `chaveTmdb`, no `config.js`. Se vier o filme errado, toque em "Não é esse filme" para ver o próximo resultado. A capa aparece no convite, na sala e no vídeo antes do play. O link mandado no WhatsApp/Instagram mostra o cartão da Matinê (a capa de cada filme não aparece ali porque o site é estático, sem servidor).

**Lista "Para ver depois":** a tela inicial é uma lista compartilhada de filmes. O **+** abre uma gaveta: cole o link (o mesmo tipo de link de sempre), veja a capa e toque em **Guardar** ou **Assistir agora**. Colando o link de uma pasta do Drive (como "qualquer pessoa com o link"), dá para marcar e guardar vários vídeos de uma vez; subpastas não entram. Os detalhes de cada filme testam se o link está abrindo agora e dizem o motivo se não estiver. O filme mais antigo ainda não visto vira a **Próxima sessão**, com o botão **Abrir sala**; os outros ficam na fileira de baixo. A sala guarda onde o filme parou a cada 15 s, e abrir o filme de novo pela lista continua dali. A aba **Já vimos** guarda o histórico: o filme vai para lá sozinho quando a sala passa de 92% dele (filmes com mais de 10 min), ou pelo botão **Já vimos** nos detalhes. Quem entra numa sala aberta pela lista passa a ver e adicionar na mesma lista (o que essa pessoa tinha numa lista própria vai junto); o botão **Compartilhar a lista** manda um link direto para ela. A lista fica no banco em `listas/<código>`; o código tem 16 letras e números e só quem o recebe consegue ler a lista.

**Player:** toque mostra/esconde os controles; toque duplo nos lados volta/avança 10 s (cada toque a mais soma 10); toque duplo no meio dá play/pausa; deslizar na esquerda muda o brilho e na direita o volume. No computador: espaço, setas e F.

**TV:** o botão de TV manda o filme para o Chromecast/Google TV (app Android e Chrome) ou Apple TV (AirPlay no iPhone). No app, o celular fica mudo e vira controle: botões e gestos mexem na sala e a TV acompanha; play/pausa feitos pelo controle da TV também valem para a sala. Só vai para a TV o arquivo original (MP4/WebM/HLS); vídeo convertido na hora não vai, e link do Drive só vai se a chave do Drive não estiver restrita a sites.

**Sala que se apaga:** quando a última pessoa sai, a sala é marcada como vazia; 10 min depois ela é apagada (com chat e tudo) quando alguém que passou por ela abrir a Matinê de novo. Voltar antes disso (ex.: recarregar a página) mantém a sala, parada no último ponto visto.

**Comando da sala:** quem abriu a sala troca o filme e pode passar o comando a outra pessoa, tocando na faixa de pessoas. Se quem comandava sair, qualquer um dos presentes pode trocar o filme.

**Fotos no chat:** o botão de imagem ao lado do campo de mensagem manda uma foto, reduzida no próprio aparelho (até ~200 KB) e guardada na sala, que é apagada junto com ela. Tocar na foto abre em tela cheia.

**Comandos secretos:** `/brotos` e `/tchau`, `/carta texto`, `/pipoca`, `/confete`, `/dado`, `/moeda` e `/luz` aparecem na tela de todos da sala. Dado e moeda dão o mesmo resultado para todos.

**Atualização:** o app Android (Android 9 ou mais novo) confere as Releases do GitHub ao abrir (no máximo a cada 6 h), pergunta, baixa e abre o instalador.

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
5. Em **Configurações do projeto** (engrenagem) > **Seus apps** > ícone **`</>`** (Web) > apelido **matine** > **Registrar app**. Copie os valores do `firebaseConfig` que aparecem para o arquivo [`config.js`](config.js), com a `apiKey` em `chaveFirebase`, e envie para o GitHub. A chave deve estar restrita a `https://dmwnezes.com/*` no Google Cloud.

Esses valores não são segredo (todo site com Firebase mostra os seus). Quem protege as salas são as regras: só entra quem tem o código da sala, ninguém consegue listar as salas, só quem comanda troca o filme (ou qualquer um, se quem comandava saiu) e cada um só escreve o próprio nome e as próprias mensagens.

**Sempre que `database.rules.json` mudar**, cole o arquivo de novo na aba **Regras** e publique: o banco não lê o arquivo do repositório.

### 3. Pronto

Abra o site, escreva seu nome, cole o link de um vídeo e toque em **Abrir sala**. Toque na faixa de pessoas (embaixo do vídeo) para **Convidar** ou **Trocar filme**.

### 4. (Opcional) Links do Google Drive

1. Em [console.cloud.google.com](https://console.cloud.google.com), escolha o projeto **matine** (o Firebase criou) > **APIs e serviços > Biblioteca** > **Google Drive API** > **Ativar**.
2. **APIs e serviços > Credenciais > Criar credenciais > Chave de API**.
3. Edite a chave: em **Restrições de aplicativo**, escolha **Sites** e adicione `https://dmwnezes.com/*`; em **Restrições de API**, escolha só **Google Drive API**. Salve.
4. Na primeira vez que você abrir uma sala com link do Drive, o site pede essa chave (só uma vez). Ela fica no aparelho e vai junto na sala para os convidados.

### 5. Assinatura do APK

O GitHub Actions assina o APK com a chave guardada nos Secrets do repositório (**Settings > Secrets and variables > Actions**): `APK_KEYSTORE_B64` (o arquivo da chave em base64) e `APK_KEYSTORE_PASSWORD`. Sem eles, a geração do APK falha. O GitHub não mostra um Secret depois de salvo, então guarde a chave num lugar seguro: sem ela, uma nova versão do app só instala apagando a anterior.

`app/signing/lineage.bin` não é segredo: é a prova de que a chave atual substituiu a antiga, e é o que deixa o app atualizar sem reinstalar.

## Testar no computador

```bash
npm test                 # lógica pura (sync.js, lista, capa...)
npm i --no-save playwright firebase@10.14.1 mediabunny@1.62.0 firebase-tools@15
npm run test:e2e         # dois aparelhos numa sala, com Drive falso (precisa de Java e ffmpeg)
./gradlew assembleDebug  # APK de teste (precisa do Android SDK)
```

Abrindo o site em `localhost`, ele usa o emulador do Firebase (`firebase emulators:start --only database,auth`) em vez do banco de verdade.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | Telas e visual (paleta "Noite suave", a mesma da Estante e do Palavreiro) |
| `app.js` | Sala: Firebase, sincronia, chat, reações, convite, lista |
| `sync.js` | Contas da sincronia e leitura dos links (testado em `test/`) |
| `cofre.js` | Baixa o filme do Drive uma vez só e guarda no aparelho |
| `sw.js` | Service worker: entrega ao vídeo o que o cofre guardou |
| `drive.js` | Dados do arquivo, teste do link e pastas do Drive |
| `controles.js` | Botões e gestos do player |
| `lista.js` | Organiza a lista "Para ver depois" |
| `fotos.js` | Reduz as fotos do chat |
| `efeitos.js`, `brotos.js` | Comandos secretos do chat |
| `capa.js` | Nome, capa e sinopse do filme pelo TMDB (chave `chaveTmdb` no `config.js`) |
| `video.js` | Abre o vídeo: direto quando o aparelho toca, ou convertendo em tempo real ([Mediabunny](https://mediabunny.dev)) |
| `embed.js` | YouTube e Vimeo embutidos, fingindo ser o `<video>` para a sincronia e os controles |
| `config.js` | Dados do seu Firebase e chave opcional do Drive |
| `database.rules.json` | Regras de segurança do banco |
| `avatars.js` | Fotos de perfil (as mesmas da Estante) |
| `app/` | App Android (WebView que abre o site) |
| `test/e2e/` | Teste com dois aparelhos, emulador do Firebase e Drive falso |
