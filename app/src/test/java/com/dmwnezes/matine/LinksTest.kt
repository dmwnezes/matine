package com.dmwnezes.matine

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LinksTest {
    @Test
    fun soLinksDoSiteFicamNoApp() {
        assertTrue(MainActivity.ehDoSite("https://dmwnezes.com/matine/#ABC234"))
        assertTrue(MainActivity.ehDoSite("https://dmwnezes.com/matine"))
        assertFalse(MainActivity.ehDoSite("https://dmwnezes.com/estante/sala/"))
        assertFalse(MainActivity.ehDoSite("https://evil.com/?https://dmwnezes.com/matine/"))
        assertFalse(MainActivity.ehDoSite(null))
    }
}
