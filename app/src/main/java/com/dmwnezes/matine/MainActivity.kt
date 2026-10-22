package com.dmwnezes.matine

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.content.Intent
import android.graphics.Color
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * O app é o próprio site da Matinê numa janela: toda a sala (vídeo, sincronia, chat) vive no site.
 * Aqui só fica o que o site não consegue sozinho: tela cheia do vídeo, tela sempre acesa,
 * abrir convites no app, o menu de compartilhar do Android, janelinha, brilho/volume dos gestos,
 * transmitir para a TV ([Tv]) e atualizar o próprio app ([Atualizacao]).
 */
class MainActivity : Activity() {

    companion object {
        const val SITE = "https://dmwnezes.com/matine/"

        /** Só abre aqui dentro links do próprio site; o resto vai para o navegador. */
        fun ehDoSite(url: String?) = url != null && url.startsWith(SITE.trimEnd('/'))
    }

    private lateinit var raiz: FrameLayout
    private lateinit var web: WebView
    private var telaCheia: View? = null
    /** O site avisa quando o filme está tocando: só aí vale virar janelinha ao sair do app. */
    @Volatile private var tocando = false
    private lateinit var tv: Tv
    private var abertura: Abertura? = null
    private lateinit var atualizacao: Atualizacao
    private val audio by lazy { getSystemService(AUDIO_SERVICE) as AudioManager }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#120E2B"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // O filme pode começar quando a sala mandar, sem precisar tocar na tela.
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(Ponte(), "Matine")
            webViewClient = Cliente()
            webChromeClient = Cromo()
        }
        raiz = FrameLayout(this).apply { addView(web, ViewGroup.LayoutParams(-1, -1)) }
        setContentView(raiz)
        if (savedInstanceState == null) abertura = Abertura(raiz)
        respeitarBarrasETeclado()

        tv = Tv(this) { codigo -> runOnUiThread { web.evaluateJavascript("window.$codigo", null) } }
        tv.ligar()
        atualizacao = Atualizacao(this)

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(enderecoDe(intent))
        atualizacao.conferir()
    }

    override fun onResume() {
        super.onResume()
        atualizacao.instalar() // voltou da tela de permissão de instalar: continua de onde parou
    }

    private fun enderecoDe(i: Intent?): String = i?.dataString?.takeIf(::ehDoSite) ?: SITE

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (ehDoSite(intent.dataString)) web.loadUrl(intent.dataString!!)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Ainda é chamado com targetSdk 35 enquanto o voltar preditivo não for ligado.")
    override fun onBackPressed() {
        when {
            telaCheia != null -> web.webChromeClient?.onHideCustomView()
            web.canGoBack() -> web.goBack()
            else -> @Suppress("DEPRECATION") super.onBackPressed()
        }
    }

    /** Janelinha flutuante: o filme continua num cantinho enquanto a pessoa usa outro app. */
    private fun janelinha() = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).apply {
        // Android 12+: entra sozinho ao sair do app com o gesto de voltar para o início.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setAutoEnterEnabled(tocando)
    }.build()

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (tocando && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) runCatching { enterPictureInPictureMode(janelinha()) }
    }

    override fun onPictureInPictureModeChanged(naJanelinha: Boolean, novaConfig: Configuration) {
        super.onPictureInPictureModeChanged(naJanelinha, novaConfig)
        // Na janelinha, o site mostra só o filme (sem chat nem botões).
        web.evaluateJavascript("document.body.classList.toggle('pip', $naJanelinha)", null)
    }

    override fun onDestroy() {
        tv.desligar()
        web.destroy()
        super.onDestroy()
    }

    /**
     * No Android 15 o app desenha por baixo das barras e o teclado não encolhe a tela sozinho:
     * empurra o site para dentro da área livre (o site usa isso para subir a caixa do chat).
     */
    private fun respeitarBarrasETeclado() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        raiz.setOnApplyWindowInsetsListener { v, insets ->
            if (telaCheia != null) v.setPadding(0, 0, 0, 0)
            else {
                val barras = insets.getInsets(WindowInsets.Type.systemBars())
                val teclado = insets.getInsets(WindowInsets.Type.ime())
                v.setPadding(barras.left, barras.top, barras.right, maxOf(barras.bottom, teclado.bottom))
            }
            insets
        }
    }

    private fun esconderBarras(esconder: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val c = window.insetsController ?: return
            if (esconder) {
                c.hide(WindowInsets.Type.systemBars())
                c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else c.show(WindowInsets.Type.systemBars())
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = if (esconder)
                View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            else 0
        }
    }

    /** Botão de tela cheia do player do site. */
    /** Foto do chat: o WebView não abre a galeria sozinho, o app abre e devolve o arquivo para o site. */
    private var escolhaDeArquivo: ValueCallback<Array<Uri>>? = null
    private val PEDIDO_ARQUIVO = 7

    @Deprecated("Activity simples, sem AndroidX Activity Result API.")
    override fun onActivityResult(pedido: Int, resultado: Int, dados: Intent?) {
        if (pedido != PEDIDO_ARQUIVO) { @Suppress("DEPRECATION") super.onActivityResult(pedido, resultado, dados); return }
        escolhaDeArquivo?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, dados))
        escolhaDeArquivo = null
    }

    private inner class Cromo : WebChromeClient() {
        private var aoSair: CustomViewCallback? = null

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            escolhaDeArquivo?.onReceiveValue(null) // uma escolha antiga sem resposta: libera o site
            escolhaDeArquivo = callback
            return try {
                @Suppress("DEPRECATION") startActivityForResult(params.createIntent(), PEDIDO_ARQUIVO)
                true
            } catch (e: Exception) {
                escolhaDeArquivo = null
                false
            }
        }

        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (telaCheia != null) { callback.onCustomViewHidden(); return }
            telaCheia = view
            aoSair = callback
            raiz.addView(view, ViewGroup.LayoutParams(-1, -1))
            esconderBarras(true)
            raiz.requestApplyInsets()
        }

        override fun onHideCustomView() {
            val v = telaCheia ?: return
            raiz.removeView(v)
            telaCheia = null
            esconderBarras(false)
            raiz.requestApplyInsets()
            aoSair?.onCustomViewHidden()
            aoSair = null
        }
    }

    private inner class Cliente : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String) { abertura?.siteCarregou() }

        override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
            val url = req.url.toString()
            if (ehDoSite(url)) return false
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            return true
        }

        override fun onReceivedError(view: WebView, req: WebResourceRequest, error: WebResourceError) {
            if (!req.isForMainFrame) return
            val tentar = req.url.toString().replace("'", "%27")
            view.loadDataWithBaseURL(null, """
                <body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
                  background:#120E2B;color:#F4F1FF;font:17px system-ui;text-align:center;padding:24px;box-sizing:border-box">
                  <p>Sem internet agora.</p>
                  <button onclick="location.href='$tentar'" style="border:0;border-radius:999px;padding:14px 28px;
                    background:#9B8CFF;color:#1A1438;font:600 16px system-ui">Tentar de novo</button>
                </body>""".trimIndent(), "text/html", "utf-8", null)
        }
    }

    /** O que o site pode pedir ao app (window.Matine no JavaScript). */
    private inner class Ponte {
        @JavascriptInterface
        fun tocando(sim: Boolean) {
            tocando = sim
            runOnUiThread { runCatching { setPictureInPictureParams(janelinha()) } }
        }

        // ---- TV ----
        @JavascriptInterface fun podeTransmitir() = tv.disponivel
        @JavascriptInterface
        fun transmitir(url: String, titulo: String, capa: String, pos: Double, tocando: Boolean) =
            runOnUiThread { tv.transmitir(url, titulo, capa, pos, tocando) }
        @JavascriptInterface fun tvEstado(tocando: Boolean, pos: Double) = runOnUiThread { tv.estado(tocando, pos) }
        @JavascriptInterface fun pararTv() = runOnUiThread { tv.parar() }

        // ---- Gestos do player: brilho da tela e volume (da TV, se estiver transmitindo) ----
        @JavascriptInterface
        fun brilhoAtual(): Float = window.attributes.screenBrightness.takeIf { it >= 0 }
            ?: (Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128) / 255f)
        @JavascriptInterface
        fun brilho(v: Float) = runOnUiThread { window.attributes = window.attributes.apply { screenBrightness = v.coerceIn(0.05f, 1f) } }
        @JavascriptInterface
        fun volumeAtual(): Float = tv.volumeTv?.toFloat()
            ?: (audio.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
        @JavascriptInterface
        fun volume(v: Float) = runOnUiThread {
            if (!tv.volume(v.toDouble())) {
                val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(v.coerceIn(0f, 1f) * max), 0)
            }
        }

        @JavascriptInterface
        fun compartilhar(texto: String) {
            val envio = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, texto.take(1000))
            runOnUiThread { startActivity(Intent.createChooser(envio, "Convidar para a sala")) }
        }
    }
}
