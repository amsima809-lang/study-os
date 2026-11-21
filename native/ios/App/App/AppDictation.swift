import AVFoundation
import Capacitor
import Speech
import UIKit

/// One tap starts an utterance. Stop lets Speech finish processing the last words.
@objc(AppDictationPlugin)
public class AppDictationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppDictationPlugin"
    public let jsName = "AppDictation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]
    private let engine = AVAudioEngine()
    private var pending: CAPPluginCall?
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var lastText = ""
    private var hasTap = false
    private var sessionActive = false

    public override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted),
                                               name: AVAudioSession.interruptionNotification, object: nil)
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil else { call.reject("Already listening", "BUSY"); return }
            self.pending = call
            self.lastText = ""
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async {
                    guard self.pending === call else { return }
                    guard status == .authorized else { self.finish(error: "DENIED"); return }
                    AVCaptureDevice.requestAccess(for: .audio) { granted in
                        DispatchQueue.main.async {
                            guard self.pending === call else { return }
                            guard granted else { self.finish(error: "DENIED"); return }
                            self.listen(call)
                        }
                    }
                }
            }
        }
    }

    private func listen(_ call: CAPPluginCall) {
        let locale = Locale(identifier: call.getString("language") == "en-US" ? "en-US" : "th-TH")
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            finish(error: "UNAVAILABLE"); return
        }
        self.recognizer = recognizer
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: [])
            try audio.setActive(true)
            sessionActive = true
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { finish(error: "MIC"); return }
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
            self.request = request
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            hasTap = true
            engine.prepare()
            try engine.start()
            task = recognizer.recognitionTask(with: request) { result, error in
                DispatchQueue.main.async {
                    guard self.pending === call else { return }
                    if let result { self.lastText = result.bestTranscription.formattedString }
                    if result?.isFinal == true || error != nil {
                        self.finish(error: error != nil && self.lastText.isEmpty ? "SPEECH" : nil)
                    }
                }
            }
        } catch { finish(error: "MIC") }
    }

    private func endAudio() {
        if engine.isRunning { engine.stop() }
        if hasTap { engine.inputNode.removeTap(onBus: 0); hasTap = false }
        request?.endAudio()
        request = nil
    }

    private func finish(error: String? = nil) {
        guard let call = pending else { return }
        pending = nil
        endAudio()
        task?.cancel()
        task = nil
        recognizer = nil
        if sessionActive {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            sessionActive = false
        }
        if let error { call.reject("Dictation unavailable", error) }
        else { call.resolve(["text": lastText]) }
    }

    @objc private func interrupted() {
        DispatchQueue.main.async { self.finish() }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let original = self.pending {
                if self.task == nil { self.finish() }
                else {
                    self.endAudio()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        if self.pending === original { self.finish() }
                    }
                }
            }
            call.resolve()
        }
    }
}
