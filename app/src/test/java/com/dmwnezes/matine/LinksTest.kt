package com.dmwnezes.matine

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LinksTest {
    @Test
    fun soLinksDoSiteFicamNoApp() {
        assertTrue(MainActivity.ehDoSite("https://dmwnezes.github.io/matine/#ABC234"))
        assertTrue(MainActivity.ehDoSite("https://dmwnezes.github.io/matine"))
        assertFalse(MainActivity.ehDoSite("https://dmwnezes.github.io/estante/sala/"))
        assertFalse(MainActivity.ehDoSite("https://evil.com/?https://dmwnezes.github.io/matine/"))
        assertFalse(MainActivity.ehDoSite(null))
    }
}
