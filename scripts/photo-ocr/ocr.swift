import Foundation
import Vision
import ImageIO

let req0 = VNRecognizeTextRequest()
req0.recognitionLevel = .accurate
if #available(macOS 13.0, *) { req0.revision = VNRecognizeTextRequestRevision3 }
let langs = (try? req0.supportedRecognitionLanguages()) ?? []
FileHandle.standardError.write("supported: \(langs.joined(separator: ","))\n".data(using: .utf8)!)

for path in CommandLine.arguments.dropFirst() {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("cannot open \(path)"); continue }
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let o = (props?[kCGImagePropertyOrientation] as? UInt32).flatMap { CGImagePropertyOrientation(rawValue: $0) } ?? .up
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["th-TH", "en-US"]
    req.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: img, orientation: o).perform([req])
    var lines: [[String: Any]] = []
    for r in req.results ?? [] {
        guard let c = r.topCandidates(1).first else { continue }
        let b = r.boundingBox
        lines.append(["text": c.string, "conf": (c.confidence * 100).rounded() / 100, "x": (b.minX * 1000).rounded() / 1000, "y": ((1 - b.maxY) * 1000).rounded() / 1000, "w": (b.width * 1000).rounded() / 1000, "h": (b.height * 1000).rounded() / 1000])
    }
    let out: [String: Any] = ["file": (path as NSString).lastPathComponent, "lines": lines]
    print(String(data: try! JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
}
