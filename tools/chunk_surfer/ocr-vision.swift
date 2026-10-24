// OCR through macOS's own Vision framework, for measuring whether a displayed
// frame can be read (tools/chunk_surfer/analyse-ear-room.py). No install: it
// ships with the OS. Language correction is OFF and there are no custom words,
// so it cannot "correct" a smudge into the answer it was hoping for.
//
//   swift tools/chunk_surfer/ocr-vision.swift frame.png [frame.png ...]
//
// One JSON object per line: {"file", "lines":[{"text","confidence","box"}]},
// box in normalised image coordinates with the origin at the top left.
import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let image = NSImage(contentsOfFile: path),
          let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("{\"file\":\"\(path)\",\"error\":\"unreadable\"}")
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.0
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    var lines: [[String: Any]] = []
    do {
        try handler.perform([request])
        for obs in request.results ?? [] {
            guard let best = obs.topCandidates(1).first else { continue }
            let b = obs.boundingBox
            lines.append([
                "text": best.string,
                "confidence": Double(best.confidence),
                "box": [Double(b.minX), Double(1 - b.maxY), Double(b.width), Double(b.height)],
            ])
        }
    } catch {
        print("{\"file\":\"\(path)\",\"error\":\"\(error)\"}")
        continue
    }
    let data = try! JSONSerialization.data(withJSONObject: ["file": path, "lines": lines])
    print(String(data: data, encoding: .utf8)!)
}
