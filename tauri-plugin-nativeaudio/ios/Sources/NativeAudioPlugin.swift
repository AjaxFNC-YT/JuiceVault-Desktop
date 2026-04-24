import AVFoundation
import MediaPlayer
import UIKit
import WebKit
import Tauri
import SwiftRs

class AudioEngine {
    static let shared = AudioEngine()

    private let engine = AVAudioEngine()
    private let playerA = AVAudioPlayerNode()
    private let playerB = AVAudioPlayerNode()
    private let submix = AVAudioMixerNode()
    private let eq: AVAudioUnitEQ
    private let reverb = AVAudioUnitReverb()

    private var activeIsA = true
    private var activePlayer: AVAudioPlayerNode { activeIsA ? playerA : playerB }
    private var inactivePlayer: AVAudioPlayerNode { activeIsA ? playerB : playerA }

    private var currentFileA: AVAudioFile?
    private var currentFileB: AVAudioFile?
    private var activeFile: AVAudioFile? {
        get { activeIsA ? currentFileA : currentFileB }
        set { if activeIsA { currentFileA = newValue } else { currentFileB = newValue } }
    }

    private var currentDuration: Double = 0
    private var seekOffsetSeconds: Double = 0
    private var crossfadeDuration: Double = 0
    private var masterVolume: Float = 1.0
    private var fadeTimer: Timer?
    private var progressTimer: Timer?
    private var isPlaying = false

    private var currentTitle: String?
    private var currentArtist: String?
    private var currentArtworkUrl: String?
    private var cachedArtwork: MPMediaItemArtwork?

    var onStateChanged: (([String: Any]) -> Void)?

    private init() {
        eq = AVAudioUnitEQ(numberOfBands: 5)
        buildAudioGraph()
        configureAudioSession()
        registerRemoteCommands()
    }

    private func buildAudioGraph() {
        engine.attach(playerA)
        engine.attach(playerB)
        engine.attach(submix)
        engine.attach(eq)
        engine.attach(reverb)

        let bands: [(AVAudioUnitEQFilterType, Float, Float)] = [
            (.lowShelf,   60,    1.0),
            (.parametric, 230,   1.0),
            (.parametric, 1000,  1.0),
            (.parametric, 4000,  1.0),
            (.highShelf,  12000, 1.0),
        ]
        for (i, cfg) in bands.enumerated() {
            eq.bands[i].filterType = cfg.0
            eq.bands[i].frequency  = cfg.1
            eq.bands[i].bandwidth  = cfg.2
            eq.bands[i].bypass     = false
            eq.bands[i].gain       = 0
        }
        reverb.wetDryMix = 0
        reverb.loadFactoryPreset(.mediumRoom)

        let outFormat = engine.outputNode.inputFormat(forBus: 0)
        let procFormat = AVAudioFormat(
            standardFormatWithSampleRate: outFormat.sampleRate,
            channels: outFormat.channelCount
        ) ?? AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!

        engine.connect(playerA, to: submix, format: procFormat)
        engine.connect(playerB, to: submix, format: procFormat)
        engine.connect(submix,  to: eq,     format: procFormat)
        engine.connect(eq,      to: reverb, format: procFormat)
        engine.connect(reverb,  to: engine.mainMixerNode, format: procFormat)

        playerB.volume = 0
        engine.mainMixerNode.outputVolume = masterVolume
        engine.prepare()
    }

    private func ensureEngineRunning() {
        guard !engine.isRunning else { return }
        do { try engine.start() }
        catch { print("[NativeAudio] engine start error: \(error)") }
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("[NativeAudio] session error: \(error)")
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let kind = AVAudioSession.InterruptionType(rawValue: rawType) else { return }

        if kind == .began {
            if isPlaying {
                activePlayer.pause()
                progressTimer?.invalidate()
                emitState()
            }
        } else if kind == .ended {
            let opts = (info[AVAudioSessionInterruptionOptionKey] as? UInt)
                .flatMap(AVAudioSession.InterruptionOptions.init) ?? []
            if opts.contains(.shouldResume) && isPlaying {
                try? AVAudioSession.sharedInstance().setActive(true)
                ensureEngineRunning()
                activePlayer.play()
                startProgressTimer()
                syncNowPlayingTime()
            }
        }
    }

    @objc private func handleRouteChange(notification: Notification) {
        guard let info = notification.userInfo,
              let rawReason = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason) else { return }
        if reason == .oldDeviceUnavailable && isPlaying {
            pause()
        }
    }

    func playTrack(url: String, title: String?, artist: String?, artworkUrl: String?) {
        currentTitle = title
        currentArtist = artist
        currentArtworkUrl = artworkUrl
        cachedArtwork = nil

        // Start artwork fetch in parallel with audio download
        fetchArtwork(from: artworkUrl)

        fetchAudioFile(from: url) { [weak self] localUrl in
            guard let self = self, let localUrl = localUrl else { return }
            self.loadAndPlay(fileUrl: localUrl)
        }
    }

    private func loadAndPlay(fileUrl: URL) {
        do {
            let file = try AVAudioFile(forReading: fileUrl)
            let sampleRate = file.processingFormat.sampleRate
            let duration = Double(file.length) / sampleRate

            if crossfadeDuration > 0 && isPlaying {
                crossfadeInto(file: file, duration: duration)
                return
            }

            activePlayer.stop()
            inactivePlayer.stop()
            inactivePlayer.volume = 0

            activeFile = file
            currentDuration = duration
            seekOffsetSeconds = 0

            ensureEngineRunning()
            scheduleFullFile(file, on: activePlayer)
            activePlayer.volume = 1.0
            activePlayer.play()
            isPlaying = true

            publishNowPlaying()
            startProgressTimer()
            emitState()
        } catch {
            print("[NativeAudio] load error: \(error)")
        }
    }

    private func scheduleFullFile(_ file: AVAudioFile, on player: AVAudioPlayerNode) {
        file.framePosition = 0
        // .dataPlayedBack ensures the callback fires after actual playback ends,
        // not when the data is merely scheduled into the hardware buffer.
        player.scheduleFile(file, at: nil, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            DispatchQueue.main.async { self?.onTrackFinished() }
        }
    }

    private func crossfadeInto(file: AVAudioFile, duration fileDuration: Double) {
        let incoming = inactivePlayer
        let outgoing = activePlayer

        incoming.stop()
        incoming.volume = 0

        if activeIsA { currentFileB = file } else { currentFileA = file }

        ensureEngineRunning()
        scheduleFullFile(file, on: incoming)
        incoming.play()

        let steps = max(1, Int(crossfadeDuration * 30))
        let dt = crossfadeDuration / Double(steps)
        var tick = 0

        fadeTimer?.invalidate()
        fadeTimer = Timer.scheduledTimer(withTimeInterval: dt, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            tick += 1
            let t = Float(min(1.0, Double(tick) / Double(steps)))
            incoming.volume = t
            outgoing.volume = 1.0 - t

            if tick >= steps {
                timer.invalidate()
                outgoing.stop()
                outgoing.volume = 0
                self.activeIsA = !self.activeIsA
                self.currentDuration = fileDuration
                self.seekOffsetSeconds = 0
                self.publishNowPlaying()
            }
        }
    }

    private func onTrackFinished() {
        guard isPlaying else { return }
        isPlaying = false
        progressTimer?.invalidate()
        emitState(status: "ended")
    }

    func pause() {
        activePlayer.pause()
        isPlaying = false
        progressTimer?.invalidate()
        syncNowPlayingTime()
        emitState()
    }

    func resume() {
        ensureEngineRunning()
        activePlayer.play()
        isPlaying = true
        startProgressTimer()
        syncNowPlayingTime()
        emitState()
    }

    func stop() {
        fadeTimer?.invalidate()
        progressTimer?.invalidate()
        playerA.stop()
        playerB.stop()
        isPlaying = false
        activeFile = nil
        currentDuration = 0
        seekOffsetSeconds = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        emitState()
    }

    func seek(to time: Double) {
        guard let file = activeFile else { return }
        let sr = file.processingFormat.sampleRate
        let targetFrame = AVAudioFramePosition(time * sr)
        let totalFrames = file.length
        guard targetFrame >= 0 && targetFrame < totalFrames else { return }

        let wasPlaying = isPlaying
        activePlayer.stop()

        seekOffsetSeconds = time
        let remaining = AVAudioFrameCount(totalFrames - targetFrame)

        activePlayer.scheduleSegment(
            file,
            startingFrame: targetFrame,
            frameCount: remaining,
            at: nil
        ) { [weak self] in
            DispatchQueue.main.async { self?.onTrackFinished() }
        }

        if wasPlaying { activePlayer.play() }
        syncNowPlayingTime()
        emitState()
    }

    func setVolume(_ vol: Float) {
        masterVolume = max(0, min(1, vol))
        engine.mainMixerNode.outputVolume = masterVolume
    }

    func setEq(bass: Float, mid: Float, treble: Float, reverbMix: Float, gain: Float) {
        eq.bands[0].gain = bass
        eq.bands[1].gain = bass
        eq.bands[2].gain = mid
        eq.bands[3].gain = treble
        eq.bands[4].gain = treble
        eq.globalGain = gain
        reverb.wetDryMix = max(0, min(100, reverbMix))
    }

    func setCrossfade(_ seconds: Double) {
        crossfadeDuration = max(0, seconds)
    }

    func getState() -> [String: Any] { buildState() }

    func dispose() {
        stop()
        engine.stop()
        NotificationCenter.default.removeObserver(self)
    }

    private static var audioCache = [String: URL]()

    private func fetchAudioFile(from urlString: String, completion: @escaping (URL?) -> Void) {
        guard let url = URL(string: urlString) else { completion(nil); return }
        if url.isFileURL { completion(url); return }

        // Return cached file if available
        if let cached = AudioEngine.audioCache[urlString],
           FileManager.default.fileExists(atPath: cached.path) {
            DispatchQueue.main.async { completion(cached) }
            return
        }

        URLSession.shared.downloadTask(with: url) { tmp, _, err in
            guard let tmp = tmp, err == nil else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString + ".caf")
            try? FileManager.default.moveItem(at: tmp, to: dest)
            AudioEngine.audioCache[urlString] = dest
            DispatchQueue.main.async { completion(dest) }
        }.resume()
    }

    private func startProgressTimer() {
        progressTimer?.invalidate()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.emitState()
        }
    }

    private func currentTime() -> Double {
        guard activeFile != nil,
              let nodeTime = activePlayer.lastRenderTime,
              nodeTime.isSampleTimeValid,
              let playerTime = activePlayer.playerTime(forNodeTime: nodeTime) else {
            return seekOffsetSeconds
        }
        let rendered = Double(playerTime.sampleTime) / playerTime.sampleRate
        return seekOffsetSeconds + max(0, rendered)
    }

    private func buildState(status: String? = nil) -> [String: Any] {
        let s: String
        if let explicit = status { s = explicit }
        else if isPlaying { s = "playing" }
        else if activeFile != nil { s = "paused" }
        else { s = "idle" }

        return [
            "status": s,
            "currentTime": currentTime(),
            "duration": currentDuration,
            "isPlaying": isPlaying,
            "volume": Double(masterVolume),
        ]
    }

    private func emitState(status: String? = nil) {
        onStateChanged?(buildState(status: status))
    }

    private func publishNowPlaying() {
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = currentTitle ?? "Unknown"
        info[MPMediaItemPropertyArtist] = currentArtist ?? "Unknown"
        info[MPMediaItemPropertyPlaybackDuration] = currentDuration
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime()
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        if let art = cachedArtwork { info[MPMediaItemPropertyArtwork] = art }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func syncNowPlayingTime() {
        guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else { return }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime()
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private static var artworkCache = [String: MPMediaItemArtwork]()

    private func fetchArtwork(from urlString: String?) {
        guard let str = urlString, let url = URL(string: str) else { return }

        // Use cached artwork if available
        if let cached = AudioEngine.artworkCache[str] {
            cachedArtwork = cached
            publishNowPlaying()
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
            guard let data = data,
                  let img = UIImage(data: data),
                  img.size.width > 0 else {
                print("[NativeAudio] artwork fetch failed for: \(str)")
                return
            }
            let art = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
            AudioEngine.artworkCache[str] = art
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.cachedArtwork = art
                self.publishNowPlaying()
            }
        }.resume()
    }

    private func registerRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()

        cc.playCommand.isEnabled = true
        cc.playCommand.addTarget { [weak self] _ in self?.resume(); return .success }

        cc.pauseCommand.isEnabled = true
        cc.pauseCommand.addTarget { [weak self] _ in self?.pause(); return .success }

        cc.togglePlayPauseCommand.isEnabled = true
        cc.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let s = self else { return .commandFailed }
            s.isPlaying ? s.pause() : s.resume()
            return .success
        }

        cc.changePlaybackPositionCommand.isEnabled = true
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.seek(to: e.positionTime)
            return .success
        }

        cc.nextTrackCommand.isEnabled = true
        cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.emitState(status: "next"); return .success
        }

        cc.previousTrackCommand.isEnabled = true
        cc.previousTrackCommand.addTarget { [weak self] _ in
            self?.emitState(status: "prev"); return .success
        }
    }
}

// Argument types for Tauri invoke parseArgs (all fields optional for safety)
private class PlayTrackArgs: Decodable {
    let url: String?
    let title: String?
    let artist: String?
    let artworkUrl: String?
}
private class SeekArgs: Decodable { let time: Double? }
private class VolumeArgs: Decodable { let volume: Double? }
private class EqArgs: Decodable {
    let bass: Double?; let mid: Double?; let treble: Double?
    let reverb: Double?; let gain: Double?
}
private class CrossfadeArgs: Decodable { let seconds: Double? }

class NativeAudioPlugin: Plugin {
    private var eng: AudioEngine { AudioEngine.shared }

    override func load(webview: WKWebView) {
        eng.onStateChanged = { [weak self] state in
            self?.trigger("state", data: state as! JSObject)
        }
    }

    @objc public func initialize(_ invoke: Invoke) {
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func playTrack(_ invoke: Invoke) {
        let args = try? invoke.parseArgs(PlayTrackArgs.self)
        eng.playTrack(
            url: args?.url ?? "",
            title: args?.title,
            artist: args?.artist,
            artworkUrl: args?.artworkUrl
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            invoke.resolve(self.eng.getState() as! JSObject)
        }
    }

    @objc public func pause(_ invoke: Invoke) {
        eng.pause()
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func resume(_ invoke: Invoke) {
        eng.resume()
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func stop(_ invoke: Invoke) {
        eng.stop()
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func seek(_ invoke: Invoke) {
        let args = try? invoke.parseArgs(SeekArgs.self)
        eng.seek(to: args?.time ?? 0)
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func setVolume(_ invoke: Invoke) {
        let args = try? invoke.parseArgs(VolumeArgs.self)
        eng.setVolume(Float(args?.volume ?? 1.0))
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func setEq(_ invoke: Invoke) {
        let args = try? invoke.parseArgs(EqArgs.self)
        eng.setEq(
            bass: Float(args?.bass ?? 0),
            mid: Float(args?.mid ?? 0),
            treble: Float(args?.treble ?? 0),
            reverbMix: Float(args?.reverb ?? 0),
            gain: Float(args?.gain ?? 0)
        )
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func setCrossfade(_ invoke: Invoke) {
        let args = try? invoke.parseArgs(CrossfadeArgs.self)
        eng.setCrossfade(args?.seconds ?? 0)
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func getState(_ invoke: Invoke) {
        invoke.resolve(eng.getState() as! JSObject)
    }

    @objc public func dispose(_ invoke: Invoke) {
        eng.dispose()
        invoke.resolve()
    }
}

@_cdecl("init_plugin_nativeaudio")
func initPlugin() -> Plugin {
    NativeAudioPlugin()
}
