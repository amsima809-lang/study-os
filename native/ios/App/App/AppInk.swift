import Foundation
import Capacitor
import PencilKit
import UIKit

/// Writing by hand with Apple's own PencilKit: the same canvas and tool picker as Notes (pens,
/// highlighter, eraser, lasso, ruler, colours, undo/redo), with iPadOS's own palm rejection.
/// Owner 2026-11-16: "can we make it so users see these controls … for the ios app".
///
/// The page calls
///   Capacitor.Plugins.AppInk.draw({ drawing?, title?, done?, cancel? })
///     -> { cancelled: true }
///      | { drawing, png, width, height, colors }
/// `drawing` is PencilKit's own data (base64), handed back next time so she can keep editing;
/// `png` is the ink drawn on white (base64, for the note's picture and the AI); `colors` are the
/// ink colours she used ("#rrggbb"). Nothing is stored here.
@objc(AppInkPlugin)
public class AppInkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppInkPlugin"
    public let jsName = "AppInk"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "draw", returnType: CAPPluginReturnPromise),
    ]

    @objc func draw(_ call: CAPPluginCall) {
        var drawing = PKDrawing()
        if let b64 = call.getString("drawing"), !b64.isEmpty {
            guard let data = Data(base64Encoded: b64), let saved = try? PKDrawing(data: data) else {
                call.reject("BAD_DRAWING")
                return
            }
            drawing = saved
        }
        let title = call.getString("title") ?? ""
        let done = call.getString("done") ?? "Done"
        let cancel = call.getString("cancel") ?? "Cancel"
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else {
                call.reject("NO_VIEW")
                return
            }
            let page = InkPageController(drawing: drawing, title: title, done: done, cancel: cancel) { result in
                call.resolve(result)
            }
            let nav = UINavigationController(rootViewController: page)
            nav.modalPresentationStyle = .fullScreen
            presenter.present(nav, animated: true)
        }
    }
}

/// One tall page that grows as she writes, with the tool picker always showing.
final class InkPageController: UIViewController, PKCanvasViewDelegate, PKToolPickerObserver {
    private let canvas = PKCanvasView()
    private let picker = PKToolPicker()
    private let startDrawing: PKDrawing
    private let finish: ([String: Any]) -> Void
    private var finished = false

    init(drawing: PKDrawing, title: String, done: String, cancel: String, finish: @escaping ([String: Any]) -> Void) {
        self.startDrawing = drawing
        self.finish = finish
        super.init(nibName: nil, bundle: nil)
        self.title = title
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: cancel, style: .plain, target: self, action: #selector(cancelTapped))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: done, style: .done, target: self, action: #selector(doneTapped))
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        canvas.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(canvas)
        NSLayoutConstraint.activate([
            canvas.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            canvas.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            canvas.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        canvas.drawing = startDrawing
        canvas.delegate = self
        canvas.alwaysBounceVertical = true
        canvas.backgroundColor = .systemBackground
        // .default follows the iPad's own "Only Draw with Apple Pencil" setting (on once a Pencil is
        // paired), so a palm or finger scrolls and only the Pencil draws; the tool picker's menu can
        // switch finger drawing on. On an iPhone, a finger draws.
        canvas.drawingPolicy = UIDevice.current.userInterfaceIdiom == .pad ? .default : .anyInput
        canvas.tool = PKInkingTool(.pen, color: .label, width: 3)
        picker.addObserver(canvas)
        picker.addObserver(self)
        picker.setVisible(true, forFirstResponder: canvas)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        canvas.becomeFirstResponder() // the tool picker shows for the canvas while it is first responder
        growPage()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        growPage()
    }

    /// The page is always at least two screens tall, and a screen longer than the ink.
    private func growPage() {
        let width = canvas.bounds.width
        guard width > 0 else { return }
        let inkBottom = canvas.drawing.bounds.isNull ? 0 : canvas.drawing.bounds.maxY
        let height = max(canvas.bounds.height * 2, inkBottom + canvas.bounds.height)
        if abs(canvas.contentSize.height - height) > 1 || canvas.contentSize.width != width {
            canvas.contentSize = CGSize(width: width, height: height)
        }
    }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        growPage()
    }

    @objc private func cancelTapped() {
        close(["cancelled": true])
    }

    @objc private func doneTapped() {
        let drawing = canvas.drawing
        if drawing.strokes.isEmpty {
            close(["cancelled": false, "empty": true])
            return
        }
        // The picture: the full page width, from the top to just under the ink, on white,
        // drawn as in light mode (PencilKit shows black ink as white in dark mode).
        let width = canvas.bounds.width
        let rect = CGRect(x: 0, y: 0, width: width, height: drawing.bounds.maxY + 24)
        var image = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            let ink = drawing.image(from: rect, scale: 2)
            let renderer = UIGraphicsImageRenderer(size: rect.size, format: {
                let f = UIGraphicsImageRendererFormat()
                f.scale = 2
                return f
            }())
            image = renderer.image { ctx in
                UIColor.white.setFill()
                ctx.fill(CGRect(origin: .zero, size: rect.size))
                ink.draw(in: CGRect(origin: .zero, size: rect.size))
            }
        }
        var colors: [String] = []
        if #available(iOS 14.0, *) {
            for stroke in drawing.strokes {
                let hex = Self.hex(stroke.ink.color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)))
                if !colors.contains(hex) { colors.append(hex) }
            }
        }
        close([
            "drawing": drawing.dataRepresentation().base64EncodedString(),
            "png": image.pngData()?.base64EncodedString() ?? "",
            "width": Int(rect.width * 2),
            "height": Int(rect.height * 2),
            "colors": colors,
        ])
    }

    private func close(_ result: [String: Any]) {
        guard !finished else { return }
        finished = true
        picker.setVisible(false, forFirstResponder: canvas)
        canvas.resignFirstResponder()
        dismiss(animated: true) { [finish] in finish(result) }
    }

    private static func hex(_ color: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        let c = { (v: CGFloat) in Int((max(0, min(1, v)) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", c(r), c(g), c(b))
    }
}
