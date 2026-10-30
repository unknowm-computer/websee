import Foundation
import ImageIO
import Vision

struct VisionOcrInput: Decodable, Sendable {
    let image: String
    let crops: [VisionOcrBounds]
}

struct VisionOcrBounds: Decodable, Sendable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double

    var isValid: Bool {
        [x, y, width, height].allSatisfy(\.isFinite)
            && x >= 0 && y >= 0 && width > 0 && height > 0
            && x + width <= 1.000_001 && y + height <= 1.000_001
    }
}

private enum VisionOcrError: LocalizedError {
    case invalidImage
    case invalidRegions

    var errorDescription: String? {
        switch self {
        case .invalidImage: "macOS OCR에서 이미지를 읽지 못했습니다."
        case .invalidRegions: "macOS OCR에 전달한 텍스트 영역이 올바르지 않습니다."
        }
    }
}

func recognizeVisionText(
    _ input: VisionOcrInput,
    onProgress: (Int, Int) throws -> Void
) throws -> [String] {
    guard input.crops.count <= 40, input.crops.allSatisfy(\.isValid) else {
        throw VisionOcrError.invalidRegions
    }
    guard input.image.utf8.count <= 16 * 1024 * 1024,
          let data = Data(base64Encoded: input.image),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width <= 16_384, height <= 16_384,
          width * height <= 32_000_000,
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw VisionOcrError.invalidImage
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.automaticallyDetectsLanguage = true
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0
    let supported = try request.supportedRecognitionLanguages()
    request.recognitionLanguages = ["en-US", "ja-JP", "zh-Hans", "zh-Hant", "ko-KR"].filter(supported.contains)

    let imageBounds = CGRect(x: 0, y: 0, width: width, height: height)
    var texts: [String] = []
    for (index, bounds) in input.crops.enumerated() {
        try onProgress(index, input.crops.count)
        let text = try autoreleasepool {
            // 브라우저에서 회전을 반영한 이미지의 왼쪽 위가 좌표 원점입니다.
            let rectangle = CGRect(
                x: bounds.x * Double(width), y: bounds.y * Double(height),
                width: bounds.width * Double(width), height: bounds.height * Double(height)
            ).integral.intersection(imageBounds)
            guard !rectangle.isEmpty, let crop = image.cropping(to: rectangle) else {
                throw VisionOcrError.invalidRegions
            }
            let handler = VNImageRequestHandler(cgImage: crop, orientation: .up)
            try handler.perform([request])
            return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
                .joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        texts.append(text)
    }
    try onProgress(input.crops.count, input.crops.count)
    return texts
}
