package com.plugin.nativeaudio

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@TauriPlugin
class NativeAudioPlugin(private val activity: Activity) : Plugin(activity) {

    private fun engine(): AudioEngine = AudioEngine.getInstance(activity)

    private fun jsonToJSObject(json: JSONObject): JSObject {
        val obj = JSObject()
        json.keys().forEach { key ->
            obj.put(key, json.get(key))
        }
        return obj
    }

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        engine().onStateChanged = { state ->
            val obj = jsonToJSObject(state)
            trigger("state", obj)
        }
    }

    @Command
    fun initialize(invoke: Invoke) {
        val state = engine().getState()
        invoke.resolve(jsonToJSObject(state))
    }

    @Command
    fun playTrack(invoke: Invoke) {
        val url = invoke.getString("url") ?: ""
        val title = invoke.getString("title")
        val artist = invoke.getString("artist")
        val artworkUrl = invoke.getString("artworkUrl")

        engine().playTrack(url, title, artist, artworkUrl)

        val intent = Intent(activity, PlaybackService::class.java)
        activity.startService(intent)

        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            invoke.resolve(jsonToJSObject(engine().getState()))
        }, 100)
    }

    @Command
    fun pause(invoke: Invoke) {
        engine().pause()
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun resume(invoke: Invoke) {
        engine().resume()
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun stop(invoke: Invoke) {
        engine().stop()
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun seek(invoke: Invoke) {
        val time = invoke.getDouble("time") ?: 0.0
        engine().seek(time)
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val vol = invoke.getDouble("volume")?.toFloat() ?: 1.0f
        engine().setVolume(vol)
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun setEq(invoke: Invoke) {
        val bass = invoke.getDouble("bass")?.toFloat() ?: 0f
        val mid = invoke.getDouble("mid")?.toFloat() ?: 0f
        val treble = invoke.getDouble("treble")?.toFloat() ?: 0f
        val reverb = invoke.getDouble("reverb")?.toFloat() ?: 0f
        val gain = invoke.getDouble("gain")?.toFloat() ?: 0f
        engine().setEq(bass, mid, treble, reverb, gain)
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun setCrossfade(invoke: Invoke) {
        val seconds = invoke.getDouble("seconds") ?: 0.0
        engine().setCrossfade(seconds)
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun getState(invoke: Invoke) {
        invoke.resolve(jsonToJSObject(engine().getState()))
    }

    @Command
    fun dispose(invoke: Invoke) {
        engine().dispose()
        invoke.resolve()
    }
}
