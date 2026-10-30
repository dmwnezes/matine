package com.dmwnezes.matine

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.view.ContextThemeWrapper
import androidx.mediarouter.app.MediaRouteChooserDialog
import androidx.mediarouter.media.MediaRouteSelector
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import kotlin.math.abs

/** Usa o receptor padrão do Google: funciona em qualquer Chromecast e TV com Google Cast. */
class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions = CastOptions.Builder()
        .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
        .setStopReceiverApplicationWhenEndingSession(true)
        .build()

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}

/** Tipo do arquivo para a TV pelo final do link. */
fun tipoDoVideo(url: String): String {
    val caminho = Uri.parse(url).path.orEmpty().lowercase()
    return when {
        caminho.endsWith(".webm") -> "video/webm"
        caminho.endsWith(".m3u8") -> "application/x-mpegURL"
        caminho.endsWith(".mkv") -> "video/x-matroska"
        caminho.endsWith(".mov") -> "video/quicktime"
        else -> "video/mp4"
    }
}

/**
 * Manda o filme para a TV e mantém a TV seguindo a sala. A sala continua mandando no celular
 * (que fica mudo); o site chama [estado] sempre que a sala muda, e o que alguém fizer pelo
 * controle da TV (play/pausa) volta para o site por [aoMexerNaTv].
 */
class Tv(
    private val activity: Activity,
    private val js: (String) -> Unit,
) {
    private val cast: CastContext? = runCatching { CastContext.getSharedInstance(activity) }.getOrNull()
    val disponivel get() = cast != null

    private data class Filme(val url: String, val titulo: String, val capa: String, val pos: Double, val tocando: Boolean)
    private var pendente: Filme? = null
    /** Último play/pausa que o celular mandou: o que vier igual da TV não é novidade (evita eco). */
    private var mandei: Boolean? = null

    private val sessao get() = cast?.sessionManager?.currentCastSession?.takeIf { it.isConnected }
    private val cliente: RemoteMediaClient? get() = sessao?.remoteMediaClient

    private val ouvinte = object : SessionManagerListener<CastSession> {
        override fun onSessionStarted(s: CastSession, id: String) = carregarSeguro(s)
        override fun onSessionResumed(s: CastSession, voltou: Boolean) = carregarSeguro(s)
        override fun onSessionStartFailed(s: CastSession, erro: Int) = js("tvFalhou('Não consegui conectar na TV.')")
        override fun onSessionEnded(s: CastSession, erro: Int) { mandei = null; volumeTv = null; js("tvDesligou()") }
        override fun onSessionStarting(s: CastSession) {}
        override fun onSessionEnding(s: CastSession) {}
        override fun onSessionResuming(s: CastSession, id: String) {}
        override fun onSessionResumeFailed(s: CastSession, erro: Int) {}
        override fun onSessionSuspended(s: CastSession, motivo: Int) {}
    }

    private val doFilme = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            val c = cliente ?: return
            val st = c.mediaStatus ?: return
            if (st.playerState == MediaStatus.PLAYER_STATE_IDLE && st.idleReason == MediaStatus.IDLE_REASON_ERROR) {
                js("tvFalhou('A TV não conseguiu tocar esse vídeo (formato ou link sem acesso).')")
                return
            }
            val tocandoNaTv = when (st.playerState) {
                MediaStatus.PLAYER_STATE_PLAYING -> true
                MediaStatus.PLAYER_STATE_PAUSED -> false
                else -> return // carregando: ainda não é decisão de ninguém
            }
            if (tocandoNaTv != mandei) {
                mandei = tocandoNaTv
                js("daTv($tocandoNaTv, ${c.approximateStreamPosition / 1000.0})")
            }
        }
    }

    fun ligar() { cast?.sessionManager?.addSessionManagerListener(ouvinte, CastSession::class.java) }
    fun desligar() { cast?.sessionManager?.removeSessionManagerListener(ouvinte, CastSession::class.java) }

    fun transmitir(url: String, titulo: String, capa: String, pos: Double, tocando: Boolean) {
        pendente = Filme(url, titulo, capa, pos, tocando)
        val s = sessao
        if (s != null) carregar(s) else escolherTv()
    }

    private fun escolherTv() {
        val c = cast ?: return
        val seletor = c.mergedSelector ?: MediaRouteSelector.Builder()
            .addControlCategory(CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID))
            .build()
        MediaRouteChooserDialog(ContextThemeWrapper(activity, androidx.appcompat.R.style.Theme_AppCompat_NoActionBar)).apply {
            routeSelector = seletor
            setTitle("Transmitir para")
            show()
        }
    }

    /** Chamado pelo Cast fora do nosso controle: um erro aqui viraria o app fechando. */
    private fun carregarSeguro(s: CastSession) = runCatching { carregar(s) }.onFailure { e ->
        js("tvFalhou(${org.json.JSONObject.quote("Erro na TV: $e")})")
    }.let {}

    private fun carregar(s: CastSession) {
        val f = pendente ?: return
        pendente = null
        val dados = MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE).apply {
            putString(MediaMetadata.KEY_TITLE, f.titulo)
            if (f.capa.startsWith("https://")) addImage(WebImage(Uri.parse(f.capa)))
        }
        val midia = MediaInfo.Builder(f.url)
            .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType(tipoDoVideo(f.url))
            .setMetadata(dados)
            .build()
        val c = s.remoteMediaClient ?: return
        c.registerCallback(doFilme)
        volumeTv = s.volume
        mandei = f.tocando
        c.load(MediaLoadRequestData.Builder().setMediaInfo(midia).setAutoplay(f.tocando).setCurrentTime((f.pos * 1000).toLong()).build())
        js("tvLigou()")
    }

    /** A sala mudou (ou conferência a cada 4 s): leva a TV para o mesmo ponto e estado. */
    fun estado(tocando: Boolean, pos: Double) {
        val c = cliente ?: return
        if (!c.hasMediaSession()) return
        if (abs(c.approximateStreamPosition / 1000.0 - pos) > 2.5) {
            c.seek(MediaSeekOptions.Builder().setPosition((pos * 1000).toLong()).build())
        }
        mandei = tocando
        if (tocando && c.isPaused) c.play() else if (!tocando && c.isPlaying) c.pause()
    }

    /** Volume da TV pelo gesto do celular (0–1). Devolve false se não está transmitindo. */
    fun volume(v: Double): Boolean {
        val s = sessao ?: return false
        runCatching { s.volume = v }
        volumeTv = v
        return true
    }

    /**
     * Volume da TV para o site ler. O site lê pela ponte, fora da thread principal, e o Cast só pode ser
     * usado na thread principal: por isso fica guardado aqui em vez de perguntar à sessão.
     */
    @Volatile var volumeTv: Double? = null
        private set

    fun parar() { cast?.sessionManager?.endCurrentSession(true) }
}
