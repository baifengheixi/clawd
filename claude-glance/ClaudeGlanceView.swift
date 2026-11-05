import ScreenSaver
import AppKit

// MARK: - Data

struct Period: Decodable { let cost: Double; let tokens: Int; let output: Int; let sessions: Int; let activeMinutes: Int }
struct Top: Decodable { let name: String; let share: Int }
struct Stats: Decodable {
    let updated: String
    let today: Period, week: Period, month: Period
    let last30: [Double]
    let streak: Int
    let topModel: Top, topProject: Top
    let peakHour: Int?
}

private func loadStats() -> Stats? {
    // The screensaver host is sandboxed; NSHomeDirectory() points into its container, so use the real home.
    guard let pw = getpwuid(getuid()), let home = String(validatingUTF8: pw.pointee.pw_dir) else { return nil }
    let url = URL(fileURLWithPath: home).appendingPathComponent(".claude-glance/stats.json")
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(Stats.self, from: data)
}

// MARK: - Formatting

private func money(_ v: Double) -> String { v >= 1000 ? String(format: "$%.1fk", v / 1000) : String(format: "$%.2f", v) }
private func compact(_ v: Double) -> String {
    switch v {
    case 1e9...: return String(format: "%.1fB", v / 1e9)
    case 1e6...: return String(format: "%.1fM", v / 1e6)
    case 1e3...: return String(format: "%.0fk", v / 1e3)
    default: return String(format: "%.0f", v)
    }
}
private func duration(_ m: Int) -> String { m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m)m" }
private func ago(_ iso: String) -> String {
    let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let d = f.date(from: iso) else { return "" }
    let m = Int(Date().timeIntervalSince(d) / 60)
    return m < 1 ? "just now" : m < 60 ? "\(m)m ago" : "\(m / 60)h ago"
}

// MARK: - Animation helpers

private func clamp(_ x: CGFloat) -> CGFloat { max(0, min(1, x)) }
private func easeOut(_ x: CGFloat) -> CGFloat { let t = clamp(x); return 1 - pow(1 - t, 3) }
/// Progress of an element that starts `delay` seconds into the cycle and lasts `dur`.
private func stage(_ t: CGFloat, _ delay: CGFloat, _ dur: CGFloat = 0.9) -> CGFloat { easeOut((t - delay) / dur) }

private let blue = NSColor(srgbRed: 0.45, green: 0.72, blue: 1.0, alpha: 1)
private let pink = NSColor(srgbRed: 0.93, green: 0.55, blue: 0.95, alpha: 1)
private let white = NSColor(white: 0.96, alpha: 1)
private let dim = NSColor(white: 0.55, alpha: 1)
private let faint = NSColor(white: 0.32, alpha: 1)

// MARK: - View

@objc(ClaudeGlanceView)
final class ClaudeGlanceView: ScreenSaverView {
    private var stats: Stats?
    private var cycleStart = Date()
    private let cycle: CGFloat = 60        // seconds per cycle: intro, hold, fade, move
    private var anchor = CGPoint(x: 0.5, y: 0.5)
    private var groundFrac: CGFloat = 0.13      // playground floor, as a fraction of screen height

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0 / 30.0
        stats = loadStats()
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }

    override func startAnimation() { super.startAnimation(); restart() }
    override func animateOneFrame() { needsDisplay = true }
    override var hasConfigureSheet: Bool { false }
    override var configureSheet: NSWindow? { nil }

    private func restart() {
        cycleStart = Date()
        stats = loadStats() ?? stats
        // New spot each cycle so nothing sits on the same pixels (burn-in).
        anchor = CGPoint(x: .random(in: 0.42...0.58), y: .random(in: 0.52...0.64))
        groundFrac = .random(in: 0.11...0.16)
    }

    override func draw(_ rect: NSRect) {
        NSColor.black.setFill(); bounds.fill()
        var t = CGFloat(Date().timeIntervalSince(cycleStart))
        if t > cycle { restart(); t = 0 }
        let out = 1 - clamp((t - (cycle - 1.5)) / 1.5)   // fade out at end of cycle
        let s = bounds.width / 1512                        // scale: 1512pt = 14" MacBook Pro
        let w = 860 * s, h = 210 * s
        let drift = sin(t / cycle * .pi * 2) * 6 * s       // slow breathing drift
        let origin = CGPoint(x: bounds.width * anchor.x - w / 2, y: bounds.height * anchor.y - h / 2 + drift)

        guard let st = stats else {
            text("Run collect.mjs to create ~/.claude-glance/stats.json", at: CGPoint(x: origin.x, y: origin.y + h / 2),
                 size: 18 * s, color: dim, alpha: out)
            return
        }

        NSGraphicsContext.current?.saveGraphicsState()
        defer { NSGraphicsContext.current?.restoreGraphicsState() }
        var y = origin.y + h  // draw top-down

        // Header: pulsing gradient dot · "Claude" · date and time
        let a0 = stage(t, 0.1) * out
        y -= 30 * s
        let pulse = 0.75 + 0.25 * sin(t * 2.2)
        dot(center: CGPoint(x: origin.x + 7 * s, y: y + 11 * s), r: 6 * s * pulse, alpha: a0)
        let nameW = gradientText("Claude", at: CGPoint(x: origin.x + 24 * s, y: y), size: 26 * s, weight: .semibold, alpha: a0)
        let df = DateFormatter(); df.dateFormat = "EEEE d MMM  ·  HH:mm"
        text(df.string(from: Date()), at: CGPoint(x: origin.x + 36 * s + nameW, y: y + 3 * s), size: 20 * s, color: dim, alpha: a0)

        // Divider drawing in from the left; Clawd walks along it
        y -= 34 * s
        line(from: CGPoint(x: origin.x, y: y), length: w * stage(t, 0.4, 1.4), alpha: 0.5 * out)
        clawd(t: t, ground: y, left: origin.x + w * 0.62, right: origin.x + w, s: s, alpha: out)

        // Three columns: today / this week / this month
        y -= 118 * s
        let cols: [(String, Period)] = [("today", st.today), ("this week", st.week), ("this month", st.month)]
        let colW = w / 3
        for (i, (label, p)) in cols.enumerated() {
            let a = stage(t, 0.7 + CGFloat(i) * 0.18)
            let x = origin.x + CGFloat(i) * colW
            let lift = (1 - a) * 14 * s
            let count = stage(t, 0.7 + CGFloat(i) * 0.18, 1.8)   // numbers count up
            text(label, at: CGPoint(x: x, y: y + 82 * s - lift), size: 19 * s, color: dim, alpha: a * out)
            text(money(p.cost * Double(count)), at: CGPoint(x: x, y: y + 30 * s - lift), size: 46 * s, weight: .semibold,
                 color: white, alpha: a * out, mono: true)
            text("\(compact(Double(p.tokens) * Double(count))) tokens", at: CGPoint(x: x, y: y + 2 * s - lift),
                 size: 18 * s, color: dim, alpha: a * out, mono: true)
            text("\(p.sessions) sessions · \(duration(p.activeMinutes))", at: CGPoint(x: x, y: y - 22 * s - lift),
                 size: 18 * s, color: faint, alpha: a * out, mono: true)
            if i > 0 {
                NSColor(white: 1, alpha: 0.10 * a * out).setFill()
                NSRect(x: x - 22 * s, y: y - 22 * s, width: max(1, s), height: 128 * s).fill()
            }
        }

        // Playground: a few more Clawds run around and leapfrog each other
        playground(t: t, ground: bounds.height * groundFrac, left: bounds.width * 0.07, right: bounds.width * 0.93, s: s, alpha: out)
    }

    // MARK: Clawd

    private struct Look {
        var color: NSColor; var scale: CGFloat
        var look = 0; var blink = false; var stride = -1; var armsUp = false   // stride: -1 standing, 0/1 leg frame
    }

    /// Pixel Clawd from the Claude Code welcome logo (18 x 5 grid, row 0 = top), feet at `baseY`.
    private func sprite(x: CGFloat, baseY: CGFloat, ground: CGFloat, s: CGFloat, _ k: Look, alpha: CGFloat) {
        let px = 5 * s * k.scale, py = 9.5 * s * k.scale    // terminal block pixels are ~2x taller than wide
        let width = 18 * px
        // Soft shadow on the ground, smaller while airborne
        let air = baseY - ground
        let sw = width * (1 - min(0.5, air / (80 * s)))
        NSColor(white: 1, alpha: 0.06 * alpha).setFill()
        NSBezierPath(ovalIn: NSRect(x: x + (width - sw) / 2, y: ground - 2 * s, width: sw, height: 4 * s)).fill()

        k.color.withAlphaComponent(alpha).setFill()
        let bob: CGFloat = k.stride == 1 ? py * 0.15 : 0
        func cell(_ c: CGFloat, _ r: CGFloat, h: CGFloat = 1) {
            NSRect(x: (x + c * px).rounded(), y: (baseY + (4 - r) * py + (1 - h) * py + (r < 4 ? bob : 0)).rounded(),
                   width: px.rounded(.up), height: (py * h).rounded(.up)).fill()
        }
        let eyes: Set<Int> = k.blink ? [] : [5 + k.look, 12 + k.look]
        for c in 3...14 { cell(CGFloat(c), 0) }                                  // head
        for c in 3...14 where !eyes.contains(c) { cell(CGFloat(c), 1) }          // eye row
        for c in 2...15 { cell(CGFloat(c), 2) }                                  // body
        for c in 3...14 { cell(CGFloat(c), 3) }
        if k.armsUp { cell(1, 1); cell(16, 1) } else { cell(1, 2); cell(16, 2) }
        for c: CGFloat in [4, 11] { cell(c, 4, h: k.stride == 0 ? 0.5 : 1) }   // legs take turns lifting
        for c: CGFloat in [6, 13] { cell(c, 4, h: k.stride == 1 ? 0.5 : 1) }
    }

    /// The header Clawd: drops onto the divider, wanders, blinks, hops now and then.
    private func clawd(t: CGFloat, ground: CGFloat, left: CGFloat, right: CGFloat, s: CGFloat, alpha: CGFloat) {
        let start: CGFloat = 0.9
        let span = right - left - 90 * s
        guard alpha > 0.001, span > 0, t >= start else { return }
        let phase = (t - start) * 0.32
        let x = left + span * (0.5 + 0.5 * sin(phase))
        let vel = cos(phase)
        let walking = abs(vel) > 0.25 && t > start + 0.6
        let fall = clamp((t - start) / 0.6)
        var lift = (1 - fall) * (1 - fall) * 60 * s
        var hopping = false
        for h: CGFloat in [2.6, 15, 27, 39, 51] where t >= h && t < h + 0.45 {
            lift += sin((t - h) / 0.45 * .pi) * 22 * s; hopping = true
        }
        let k = Look(color: terracotta, scale: 1, look: walking ? (vel > 0 ? 1 : -1) : 0,
                     blink: fmod(t + 0.7, 4.3) < 0.14, stride: walking ? Int(t * 6) % 2 : -1, armsUp: hopping)
        sprite(x: x, baseY: ground + max(1, s) + lift, ground: ground, s: s, k, alpha: alpha)
    }

    private let terracotta = NSColor(srgbRed: 0.85, green: 0.47, blue: 0.34, alpha: 1)
    // color, size, two wander speeds, phases
    private let crew: [(NSColor, CGFloat, CGFloat, CGFloat, CGFloat)] = [
        (NSColor(srgbRed: 0.85, green: 0.47, blue: 0.34, alpha: 1), 1.90, 0.55, 0.23, 0.0),
        (NSColor(srgbRed: 0.96, green: 0.67, blue: 0.53, alpha: 1), 1.40, 0.83, 0.31, 2.1),
        (NSColor(srgbRed: 0.68, green: 0.34, blue: 0.25, alpha: 1), 1.64, 0.41, 0.67, 4.0),
        (NSColor(srgbRed: 0.93, green: 0.83, blue: 0.71, alpha: 1), 1.16, 0.97, 0.45, 5.3),
        (NSColor(srgbRed: 0.80, green: 0.55, blue: 0.48, alpha: 1), 1.32, 0.62, 0.38, 1.2),
    ]

    /// Clawds of different sizes and shades chase around one strip; when two meet, the smaller one leapfrogs.
    private func playground(t: CGFloat, ground: CGFloat, left: CGFloat, right: CGFloat, s: CGFloat, alpha: CGFloat) {
        guard alpha > 0.001 else { return }
        NSColor(white: 1, alpha: 0.07 * alpha * stage(t, 1.2, 1.2)).setFill()
        NSRect(x: left, y: ground, width: (right - left) * stage(t, 1.2, 1.2), height: max(1, s)).fill()

        struct Pose { var x, vel, scale, lift: CGFloat; var i: Int }
        var poses: [Pose] = crew.enumerated().map { i, c in
            let (_, scale, a, b, p) = c
            let width = 90 * s * scale, span = right - left - width
            let f = 0.6 * sin(a * t + p) + 0.4 * sin(b * t + p * 1.7)
            let df = 0.6 * a * cos(a * t + p) + 0.4 * b * cos(b * t + p * 1.7)
            return Pose(x: left + span * (0.5 + 0.5 * f), vel: df, scale: scale, lift: 0, i: i)
        }
        let jump = 110 * s
        for i in poses.indices {
            for j in poses.indices where j != i && (poses[i].scale, i) < (poses[j].scale, j) {   // smaller one jumps
                let wMax = 90 * s * max(poses[i].scale, poses[j].scale)
                let ci = poses[i].x + 45 * s * poses[i].scale, cj = poses[j].x + 45 * s * poses[j].scale
                let near = clamp(1 - abs(ci - cj) / wMax)
                poses[i].lift = max(poses[i].lift, jump * near * near * (3 - 2 * near))   // smoothstep arc
            }
            let hopEvery = 5 + CGFloat(i) * 1.7, ht = fmod(t + CGFloat(i), hopEvery)
            if ht < 0.4 { poses[i].lift = max(poses[i].lift, sin(ht / 0.4 * .pi) * 30 * s) }
        }
        for p in poses.sorted(by: { $0.lift < $1.lift }) {        // jumpers drawn on top
            let a = stage(t, 1.5 + CGFloat(p.i) * 0.25, 0.8) * alpha
            let moving = abs(p.vel) > 0.08
            let k = Look(color: crew[p.i].0, scale: p.scale, look: moving ? (p.vel > 0 ? 1 : -1) : 0,
                         blink: fmod(t + CGFloat(p.i) * 1.3, 3.7) < 0.13,
                         stride: moving && p.lift < 2 ? Int(t * (5 + 9 * min(1, abs(p.vel)))) % 2 : -1,
                         armsUp: p.lift > jump * 0.35)
            sprite(x: p.x, baseY: ground + max(1, s) + p.lift, ground: ground, s: s, k, alpha: a)
        }
    }

    // MARK: Drawing primitives

    @discardableResult
    private func text(_ str: String, at p: CGPoint, size: CGFloat, weight: NSFont.Weight = .regular,
                      color: NSColor, alpha: CGFloat, mono: Bool = false) -> CGFloat {
        guard alpha > 0.001 else { return 0 }
        let font = mono ? NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight) : NSFont.systemFont(ofSize: size, weight: weight)
        let s = NSAttributedString(string: str, attributes: [.font: font, .foregroundColor: color.withAlphaComponent(alpha), .kern: weight == .semibold ? -0.5 : 0])
        s.draw(at: p)
        return s.size().width
    }

    private func gradientText(_ str: String, at p: CGPoint, size: CGFloat, weight: NSFont.Weight, alpha: CGFloat) -> CGFloat {
        let font = NSFont.systemFont(ofSize: size, weight: weight)
        let attr = NSAttributedString(string: str, attributes: [.font: font, .foregroundColor: NSColor.white])
        let sz = attr.size()
        guard alpha > 0.001, sz.width > 0, let ctx = NSGraphicsContext.current?.cgContext else { return sz.width }
        let img = NSImage(size: sz, flipped: false) { _ in attr.draw(at: .zero); return true }
        guard let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return sz.width }
        let r = CGRect(origin: p, size: sz)
        ctx.saveGState()
        ctx.clip(to: r, mask: cg)
        NSGradient(starting: blue.withAlphaComponent(alpha), ending: pink.withAlphaComponent(alpha))?.draw(in: r, angle: 0)
        ctx.restoreGState()
        return sz.width
    }

    private func dot(center c: CGPoint, r: CGFloat, alpha: CGFloat) {
        let glow = NSBezierPath(ovalIn: NSRect(x: c.x - r * 2, y: c.y - r * 2, width: r * 4, height: r * 4))
        NSGradient(colors: [pink.withAlphaComponent(0.35 * alpha), pink.withAlphaComponent(0)])?.draw(in: glow, relativeCenterPosition: .zero)
        let core = NSBezierPath(ovalIn: NSRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
        NSGradient(starting: blue.withAlphaComponent(alpha), ending: pink.withAlphaComponent(alpha))?.draw(in: core, angle: 45)
    }

    private func line(from p: CGPoint, length: CGFloat, alpha: CGFloat) {
        NSColor(white: 1, alpha: 0.18 * alpha).setFill()
        NSRect(x: p.x, y: p.y, width: length, height: max(1, bounds.width / 1512)).fill()
    }
}
