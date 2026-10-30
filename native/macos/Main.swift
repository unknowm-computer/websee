import Foundation
import NaturalLanguage
import Translation

private let hostName = "com.websee.translation"
private let maximumMessageBytes = 512 * 1024
private let maximumRequestBytes = 24 * 1024 * 1024

private enum AppleModel: String, Decodable {
    case lowLatency = "low-latency"
    case highFidelity = "high-fidelity"
}

private struct Request: Decodable {
    let operation: String
    let sourceLanguage: String?
    let text: String?
    let texts: [String]?
    let model: AppleModel?
    let ocr: VisionOcrInput?
}

private enum HostError: LocalizedError {
    case invalidRequest
    case missingLanguages
    case unsupportedLanguage
    case unsupportedModel

    var errorDescription: String? {
        switch self {
        case .invalidRequest: "macOS 도우미 요청 형식이 올바르지 않습니다."
        case .missingLanguages: "시스템 설정 → 일반 → 언어 및 지역 → 번역 언어에서 원문 언어와 한국어를 다운로드한 후 다시 시도해주세요."
        case .unsupportedLanguage: "Apple 번역에서 해당 언어의 한국어 번역을 지원하지 않습니다."
        case .unsupportedModel: "Apple Intelligence 번역에는 macOS 26.4 이상이 필요합니다. macOS Apple 번역을 선택해주세요."
        }
    }
}

// Chrome Native Messaging 프레임: little-endian 길이 4바이트 + UTF-8 JSON.
// stdout에는 프로토콜 메시지만 기록합니다.
private func send(_ message: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: message)
    guard data.count <= maximumMessageBytes else { throw HostError.invalidRequest }
    var length = UInt32(data.count).littleEndian
    let header = withUnsafeBytes(of: &length) { Data($0) }
    try FileHandle.standardOutput.write(contentsOf: header + data)
}

private func readExactly(_ count: Int) throws -> Data {
    var data = Data()
    while data.count < count {
        guard let chunk = try FileHandle.standardInput.read(upToCount: count - data.count), !chunk.isEmpty else {
            throw HostError.invalidRequest
        }
        data.append(chunk)
    }
    return data
}

private func readRequest() throws -> Request {
    let header = try readExactly(4)
    let length = header.enumerated().reduce(UInt32(0)) { $0 | (UInt32($1.element) << ($1.offset * 8)) }
    guard length > 0, length <= maximumRequestBytes else { throw HostError.invalidRequest }
    return try JSONDecoder().decode(Request.self, from: readExactly(Int(length)))
}

private func install(extensionIDs: [String]) throws {
    guard !extensionIDs.isEmpty, extensionIDs.allSatisfy({ $0.range(of: "^[a-p]{32}$", options: .regularExpression) != nil }) else {
        throw HostError.invalidRequest
    }
    let directory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Google/Chrome/NativeMessagingHosts")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let manifestURL = directory.appendingPathComponent("\(hostName).json")
    var origins = Set(extensionIDs.map { "chrome-extension://\($0)/" })
    if let existing = try? Data(contentsOf: manifestURL),
       let manifest = try? JSONSerialization.jsonObject(with: existing) as? [String: Any],
       let allowed = manifest["allowed_origins"] as? [String] {
        origins.formUnion(allowed)
    }
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL.path
    let manifest: [String: Any] = [
        "name": hostName,
        "description": "WebSee macOS Apple Translation",
        "path": executable,
        "type": "stdio",
        "allowed_origins": origins.sorted(),
    ]
    try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
        .write(to: manifestURL, options: .atomic)
    print("Apple 번역 도우미 등록 완료: \(manifestURL.path)")
}

@available(macOS 26.0, *)
@MainActor
private func handle(_ request: Request) async throws {
    let model = request.model ?? .lowLatency
    if model == .highFidelity {
        guard #available(macOS 26.4, *) else { throw HostError.unsupportedModel }
    }
    switch request.operation {
    case "ping":
        try send(["type": "result", "value": "websee-translation-v3"])
    case "ocr":
        guard let input = request.ocr else { throw HostError.invalidRequest }
        // Vision의 동기 추론은 메인 실행 흐름을 막지 않도록 별도 작업에서 수행합니다.
        let texts = try await Task.detached(priority: .userInitiated) {
            try recognizeVisionText(input) { completed, total in
                try send(["type": "progress", "completed": completed, "total": total])
            }
        }.value
        try send(["type": "result", "value": texts])
    case "detect":
        guard let text = request.text, !text.isEmpty, text.count <= 4000 else { throw HostError.invalidRequest }
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        let language = recognizer.dominantLanguage?.rawValue ?? ""
        let normalized = language.hasPrefix("zh") ? "zh" : language
        try send(["type": "result", "value": normalized])
    case "availability", "translate":
        guard let source = request.sourceLanguage, ["en", "ja", "zh", "ko"].contains(source) else {
            throw HostError.invalidRequest
        }
        let sourceLanguage = Locale.Language(identifier: source)
        let targetLanguage = Locale.Language(identifier: "ko")
        // 언어팩 상태 확인과 실제 번역은 같은 전략을 사용합니다.
        let availability: LanguageAvailability
        if #available(macOS 26.4, *) {
            availability = LanguageAvailability(preferredStrategy: model == .highFidelity ? .highFidelity : .lowLatency)
        } else {
            availability = LanguageAvailability()
        }
        let status = source == "ko" ? .installed : await availability.status(from: sourceLanguage, to: targetLanguage)
        if request.operation == "availability" {
            let value: String
            switch status {
            case .installed: value = "available"
            case .supported: value = "downloadable"
            case .unsupported: value = "unavailable"
            @unknown default: value = "unavailable"
            }
            try send(["type": "result", "value": value])
            return
        }
        guard status != .unsupported else { throw HostError.unsupportedLanguage }
        guard status == .installed else { throw HostError.missingLanguages }
        guard let texts = request.texts, texts.count <= 512, texts.reduce(0, { $0 + $1.utf8.count }) <= 100_000 else {
            throw HostError.invalidRequest
        }
        let session: TranslationSession
        if #available(macOS 26.4, *) {
            session = TranslationSession(installedSource: sourceLanguage, target: targetLanguage, preferredStrategy: model == .highFidelity ? .highFidelity : .lowLatency)
        } else {
            session = TranslationSession(installedSource: sourceLanguage, target: targetLanguage)
        }
        defer { session.cancel() }
        var translations: [String] = []
        for (index, text) in texts.enumerated() {
            try send(["type": "progress", "completed": index, "total": texts.count])
            translations.append(source == "ko" ? text : try await session.translate(text).targetText)
        }
        try send(["type": "result", "value": translations])
    default:
        throw HostError.invalidRequest
    }
}

@main
private struct WebSeeTranslation {
    static func main() async {
        if CommandLine.arguments.dropFirst().first == "--install" {
            do {
                try install(extensionIDs: Array(CommandLine.arguments.dropFirst(2)))
            } catch {
                try? FileHandle.standardError.write(contentsOf: Data("도우미 등록 실패: \(error.localizedDescription)\n".utf8))
                exit(1)
            }
            return
        }
        do {
            guard #available(macOS 26.0, *) else {
                try send(["type": "error", "message": "Apple 번역 도우미에는 macOS 26 이상이 필요합니다."])
                return
            }
            let request = try readRequest()
            try await handle(request)
        } catch {
            try? send(["type": "error", "message": error.localizedDescription])
        }
    }
}
