package com.dmwnezes.matine

import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView

/**
 * Abertura do app: o ingresso do ícone aparece e o canhoto se solta pelo picote, enquanto o site carrega.
 * Some quando o site terminou de carregar e a animação já rodou (o que vier por último).
 * Com animações desligadas no Android, o sistema zera as durações e ela só some.
 */
class Abertura(raiz: FrameLayout) {
    private val tela = FrameLayout(raiz.context).apply {
        setBackgroundColor(Color.parseColor("#120E2B"))
        isClickable = true // segura toques enquanto aparece
    }
    private var animou = false
    private var carregou = false

    init {
        val tam = (150 * raiz.resources.displayMetrics.density).toInt()
        fun peca(desenho: Int) = ImageView(raiz.context).apply {
            setImageResource(desenho)
            layoutParams = FrameLayout.LayoutParams(tam, tam, Gravity.CENTER)
        }
        val corpo = peca(R.drawable.abertura_corpo)
        val canhoto = peca(R.drawable.abertura_canhoto).apply {
            // gira pela quina de baixo do picote (x 67, y 76 no desenho de 100)
            pivotX = tam * 0.67f; pivotY = tam * 0.76f
        }
        tela.addView(corpo); tela.addView(canhoto)
        raiz.addView(tela, ViewGroup.LayoutParams(-1, -1))

        for (v in listOf(corpo, canhoto)) { v.scaleX = 0.8f; v.scaleY = 0.8f; v.alpha = 0f }
        corpo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(260).start()
        canhoto.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(260).withEndAction {
            canhoto.animate().setStartDelay(150).rotation(28f).translationX(tam * 0.18f).translationY(tam * 0.3f).alpha(0f)
                .setDuration(450).withEndAction { animou = true; talvezSumir() }.start()
            corpo.animate().setStartDelay(220).scaleX(1.06f).scaleY(1.06f).setDuration(160)
                .withEndAction { corpo.animate().scaleX(1f).scaleY(1f).setDuration(160).start() }.start()
        }.start()
        // Internet lenta: não prende a pessoa na abertura mais do que 4 s.
        tela.postDelayed({ carregou = true; animou = true; talvezSumir() }, 4000)
    }

    fun siteCarregou() { carregou = true; talvezSumir() }

    private fun talvezSumir() {
        if (!animou || !carregou || tela.parent == null || tela.tag != null) return
        tela.tag = "sumindo"
        tela.animate().alpha(0f).setDuration(250).withEndAction {
            tela.visibility = View.GONE
            (tela.parent as? ViewGroup)?.removeView(tela)
        }.start()
    }
}
