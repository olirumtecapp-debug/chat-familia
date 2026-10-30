package com.creativeam.chatforall

import org.junit.Test
import org.junit.Assert.*

class AppUnitTest {
    @Test
    fun appUrlIsCorrect() {
        assertEquals("https://chat.creativeam.com.br", MainActivity.APP_URL)
    }
}
