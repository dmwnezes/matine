package com.dmwnezes.matine

import org.junit.Assert.assertEquals
import org.junit.Test

class AtualizacaoTest {
    @Test
    fun numeroDaVersaoVemDaTag() {
        assertEquals(12, numeroDaTag("v1.0.12"))
        assertEquals(0, numeroDaTag("sem-numero"))
    }

    @Test
    fun notasSemLinhasTecnicas() {
        assertEquals("Novo player", limparNotas("Novo player\n\nCo-Authored-By: X\nClaude-Session: Y"))
    }
}
