package com.plugin.nativeaudio

import android.content.Context
import android.media.audiofx.Equalizer
import android.media.audiofx.EnvironmentalReverb
import android.media.audiofx.LoudnessEnhancer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class AudioEngine private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var instance: AudioEngine? = null

        fun getInstance(context: Context): AudioEngine {
            return instance ?: synchronized(this) {
                instance ?: AudioEngine(context.applicationContext).also { instance = it }
            }
        }
    }

    private val audioAttrs = AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build()

    private val playerA: ExoPlayer = ExoPlayer.Builder(context)
        .setAudioAttributes(audioAttrs, true)
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build()

    private val playerB: ExoPlayer = ExoPlayer.Builder(context)
        .setAudioAttributes(audioAttrs, true)
        .setHandleAudioBecomingNoisy(true)
        .setWakeMode(C.WAKE_MODE_NETWORK)
        .build()

    private var activeIsA = true
    private val activePlayer: ExoPlayer get() = if (activeIsA) playerA else playerB
    private val inactivePlayer: ExoPlayer get() = if (activeIsA) playerB else playerA

    private var equalizerA: Equalizer? = null
    private var equalizerB: Equalizer? = null
    private var reverbA: EnvironmentalReverb? = null
    private var reverbB: EnvironmentalReverb? = null
    private var loudnessA: LoudnessEnhancer? = null
    private var loudnessB: LoudnessEnhancer? = null

    private var crossfadeDuration: Double = 0.0
    private var masterVolume: Float = 1.0f
    private var isPlaying = false
    private var currentDuration: Double = 0.0

    private val handler = Handler(Looper.getMainLooper())
    private var progressRunnable: Runnable? = null
    private var fadeRunnable: Runnable? = null

    var mediaSession: MediaSession? = null
        private set

    var onStateChanged: ((JSONObject) -> Unit)? = null

    init {
        attachPlayers()
        attachAudioEffects()
        buildMediaSession()
    }

    private fun attachPlayers() {
        playerA.volume = masterVolume
        playerB.volume = 0f

        playerA.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED && activeIsA) onTrackFinished()
            }
        })
        playerB.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED && !activeIsA) onTrackFinished()
            }
        })
    }

    private fun attachAudioEffects() {
        try {
            equalizerA = Equalizer(0, playerA.audioSessionId).apply { enabled = true }
            equalizerB = Equalizer(0, playerB.audioSessionId).apply { enabled = true }
        } catch (_: Exception) {}

        try {
            reverbA = EnvironmentalReverb(0, playerA.audioSessionId).apply {
                enabled = true
                roomLevel = -10000
            }
            reverbB = EnvironmentalReverb(0, playerB.audioSessionId).apply {
                enabled = true
                roomLevel = -10000
            }
        } catch (_: Exception) {}

        try {
            loudnessA = LoudnessEnhancer(playerA.audioSessionId).apply {
                enabled = true
                setTargetGain(0)
            }
            loudnessB = LoudnessEnhancer(playerB.audioSessionId).apply {
                enabled = true
                setTargetGain(0)
            }
        } catch (_: Exception) {}
    }

    private fun buildMediaSession() {
        mediaSession = MediaSession.Builder(context, activePlayer).build()
    }

    fun playTrack(url: String, title: String?, artist: String?, artworkUrl: String?) {
        val metadata = MediaMetadata.Builder()
            .setTitle(title ?: "Unknown")
            .setArtist(artist ?: "Unknown")
            .setArtworkUri(if (artworkUrl != null) Uri.parse(artworkUrl) else null)
            .build()

        val item = MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(metadata)
            .build()

        if (crossfadeDuration > 0 && isPlaying) {
            crossfadeInto(item)
            return
        }

        activePlayer.stop()
        inactivePlayer.stop()
        inactivePlayer.volume = 0f

        activePlayer.setMediaItem(item)
        activePlayer.prepare()
        activePlayer.volume = masterVolume
        activePlayer.playWhenReady = true
        isPlaying = true

        rebindMediaSession()
        startProgressLoop()
        emitState()
    }

    private fun crossfadeInto(item: MediaItem) {
        val incoming = inactivePlayer
        val outgoing = activePlayer

        incoming.stop()
        incoming.volume = 0f
        incoming.setMediaItem(item)
        incoming.prepare()
        incoming.playWhenReady = true

        val steps = max(1, (crossfadeDuration * 30).toInt())
        val intervalMs = (crossfadeDuration * 1000 / steps).toLong()
        var tick = 0

        fadeRunnable?.let { handler.removeCallbacks(it) }

        val runnable = object : Runnable {
            override fun run() {
                tick++
                val t = min(1f, tick.toFloat() / steps.toFloat())
                incoming.volume = masterVolume * t
                outgoing.volume = masterVolume * (1f - t)

                if (tick >= steps) {
                    outgoing.stop()
                    outgoing.volume = 0f
                    activeIsA = !activeIsA
                    rebindMediaSession()
                } else {
                    handler.postDelayed(this, intervalMs)
                }
            }
        }
        fadeRunnable = runnable
        handler.postDelayed(runnable, intervalMs)
    }

    private fun onTrackFinished() {
        if (!isPlaying) return
        isPlaying = false
        stopProgressLoop()
        emitState("ended")
    }

    fun pause() {
        activePlayer.pause()
        isPlaying = false
        stopProgressLoop()
        emitState()
    }

    fun resume() {
        activePlayer.play()
        isPlaying = true
        startProgressLoop()
        emitState()
    }

    fun stop() {
        fadeRunnable?.let { handler.removeCallbacks(it) }
        stopProgressLoop()
        playerA.stop()
        playerB.stop()
        isPlaying = false
        currentDuration = 0.0
        emitState()
    }

    fun seek(time: Double) {
        activePlayer.seekTo((time * 1000).toLong())
        emitState()
    }

    fun setVolume(vol: Float) {
        masterVolume = max(0f, min(1f, vol))
        activePlayer.volume = masterVolume
    }

    fun setEq(bass: Float, mid: Float, treble: Float, reverbMix: Float, gain: Float) {
        applyBands(equalizerA, bass, mid, treble)
        applyBands(equalizerB, bass, mid, treble)

        val roomLevel = ((reverbMix / 100f) * 10000 - 10000).roundToInt().toShort()
        try { reverbA?.roomLevel = roomLevel } catch (_: Exception) {}
        try { reverbB?.roomLevel = roomLevel } catch (_: Exception) {}

        val gainMb = (gain * 100).roundToInt()
        try { loudnessA?.setTargetGain(gainMb) } catch (_: Exception) {}
        try { loudnessB?.setTargetGain(gainMb) } catch (_: Exception) {}
    }

    private fun applyBands(eq: Equalizer?, bass: Float, mid: Float, treble: Float) {
        eq ?: return
        val n = eq.numberOfBands.toInt()
        if (n < 3) return

        val range = eq.bandLevelRange
        val lo = range[0].toFloat()
        val hi = range[1].toFloat()

        fun clamp(db: Float): Short {
            val mb = (db * 100).roundToInt().toFloat()
            return max(lo, min(hi, mb)).toInt().toShort()
        }

        if (n >= 5) {
            eq.setBandLevel(0, clamp(bass))
            eq.setBandLevel(1, clamp(bass))
            eq.setBandLevel(2, clamp(mid))
            eq.setBandLevel(3, clamp(treble))
            eq.setBandLevel(4, clamp(treble))
        } else {
            eq.setBandLevel(0, clamp(bass))
            eq.setBandLevel(1, clamp(mid))
            eq.setBandLevel(2, clamp(treble))
        }
    }

    fun setCrossfade(seconds: Double) {
        crossfadeDuration = max(0.0, seconds)
    }

    fun getState(): JSONObject = buildState()

    fun dispose() {
        stop()
        mediaSession?.release()
        mediaSession = null
        equalizerA?.release(); equalizerB?.release()
        reverbA?.release(); reverbB?.release()
        loudnessA?.release(); loudnessB?.release()
        playerA.release()
        playerB.release()
        instance = null
    }

    private fun startProgressLoop() {
        stopProgressLoop()
        val r = object : Runnable {
            override fun run() {
                emitState()
                handler.postDelayed(this, 1000)
            }
        }
        progressRunnable = r
        handler.postDelayed(r, 1000)
    }

    private fun stopProgressLoop() {
        progressRunnable?.let { handler.removeCallbacks(it) }
        progressRunnable = null
    }

    private fun currentTime(): Double {
        val ms = activePlayer.currentPosition
        return if (ms > 0) ms / 1000.0 else 0.0
    }

    private fun duration(): Double {
        val ms = activePlayer.duration
        return if (ms != C.TIME_UNSET) ms / 1000.0 else currentDuration
    }

    private fun buildState(status: String? = null): JSONObject {
        val s = status ?: when {
            isPlaying -> "playing"
            activePlayer.mediaItemCount > 0 -> "paused"
            else -> "idle"
        }
        return JSONObject().apply {
            put("status", s)
            put("currentTime", currentTime())
            put("duration", duration())
            put("isPlaying", isPlaying)
            put("volume", masterVolume.toDouble())
        }
    }

    private fun emitState(status: String? = null) {
        onStateChanged?.invoke(buildState(status))
    }

    private fun rebindMediaSession() {
        mediaSession?.player = activePlayer
    }
}
