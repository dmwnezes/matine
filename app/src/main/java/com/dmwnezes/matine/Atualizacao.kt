package com.dmwnezes.matine

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Versão publicada no GitHub. O número é o mesmo do versionCode que o GitHub Actions gera. */
data class Versao(val numero: Int, val nome: String, val notas: String, val apk: String)

/** "v1.0.12" → 12. */
fun numeroDaTag(tag: String): Int = tag.substringAfterLast('.').filter(Char::isDigit).toIntOrNull() ?: 0

/** Tira do texto da versão as linhas técnicas do commit. */
fun limparNotas(texto: String): String = texto.lines()
    .filterNot { it.startsWith("Co-Authored-By") || it.startsWith("Claude-Session") }
    .joinToString("\n").trim()

/**
 * Atualização dentro do app: ao abrir, confere a última versão nas Releases do GitHub
 * (no máximo uma vez a cada 6 h), pergunta se quer atualizar, baixa o APK e abre o instalador.
 */
class Atualizacao(private val activity: Activity) {

    private val prefs = activity.getSharedPreferences("atualizacao", 0)
    private var baixado: File? = null

    fun conferir() {
        val agora = System.currentTimeMillis()
        if (agora - prefs.getLong("ultima", 0) < 6 * 3600_000L) return
        prefs.edit().putLong("ultima", agora).apply()
        Thread {
            val v = runCatching { ultima() }.getOrNull() ?: return@Thread
            if (v.numero > BuildConfig.VERSION_CODE) activity.runOnUiThread { perguntar(v) }
        }.start()
    }

    private fun ultima(): Versao {
        val con = URL("https://api.github.com/repos/dmwnezes/matine/releases/latest").openConnection() as HttpURLConnection
        con.setRequestProperty("Accept", "application/vnd.github+json")
        con.connectTimeout = 10_000; con.readTimeout = 10_000
        val o = con.inputStream.bufferedReader().use { JSONObject(it.readText()) }
        val assets = o.getJSONArray("assets")
        val apk = (0 until assets.length()).map { assets.getJSONObject(it) }.first { it.optString("name").endsWith(".apk") }
        val tag = o.optString("tag_name")
        return Versao(numeroDaTag(tag), tag.removePrefix("v"), limparNotas(o.optString("body")), apk.getString("browser_download_url"))
    }

    private fun perguntar(v: Versao) {
        if (activity.isFinishing) return
        AlertDialog.Builder(activity)
            .setTitle("Matinê ${v.nome} chegou")
            .setMessage(v.notas.ifBlank { "Uma versão nova do app está pronta." }.take(600))
            .setPositiveButton("Atualizar") { _, _ -> baixar(v) }
            .setNegativeButton("Depois", null)
            .show()
    }

    private fun baixar(v: Versao) {
        val aviso = AlertDialog.Builder(activity).setTitle("Baixando a atualização").setMessage("0%").setCancelable(false).show()
        Thread {
            val arquivo = runCatching {
                val pasta = File(activity.cacheDir, "atualizacao").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
                val destino = File(pasta, "Matine-${v.nome}.apk")
                val con = URL(v.apk).openConnection() as HttpURLConnection // o GitHub redireciona para o arquivo
                con.instanceFollowRedirects = true
                con.connectTimeout = 15_000; con.readTimeout = 60_000
                val total = con.contentLengthLong
                con.inputStream.use { ent ->
                    destino.outputStream().use { sai ->
                        val buf = ByteArray(64 * 1024)
                        var feito = 0L
                        var ultimoPct = -1
                        while (true) {
                            val n = ent.read(buf)
                            if (n < 0) break
                            sai.write(buf, 0, n)
                            feito += n
                            val pct = if (total > 0) (feito * 100 / total).toInt() else -1
                            if (pct != ultimoPct) { ultimoPct = pct; activity.runOnUiThread { aviso.setMessage(if (pct >= 0) "$pct%" else "…") } }
                        }
                    }
                }
                if (total > 0 && destino.length() != total) error("download incompleto")
                destino
            }
            activity.runOnUiThread {
                aviso.dismiss()
                arquivo.onSuccess { baixado = it; instalar() }
                    .onFailure { AlertDialog.Builder(activity).setMessage("Não consegui baixar a atualização. Tente de novo mais tarde.").setPositiveButton("OK", null).show() }
            }
        }.start()
    }

    /** Chamado também ao voltar da tela de permissão do Android. */
    fun instalar() {
        val apk = baixado ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(activity)
                .setMessage("O Android precisa que você permita uma vez que a Matinê instale as próprias atualizações.")
                .setPositiveButton("Permitir") { _, _ ->
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
                }
                .setNegativeButton("Agora não") { _, _ -> baixado = null }
                .show()
            return
        }
        baixado = null
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.arquivos", apk)
        activity.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
    }
}
