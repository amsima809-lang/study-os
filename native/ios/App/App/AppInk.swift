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
        CAPPluginMethod(name: "drawInSheet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeSheet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openField", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "layoutField", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readField", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeField", returnType: CAPPluginReturnPromise),
    ]
    private var sheet: (id: String, page: InkPageController)?
    private var field: (id: String, clip: UIView, page: InkPageController)?

    @objc func openField(_ call: CAPPluginCall) {
        guard let id = call.getString("sessionID") else { call.reject("NO_SESSION"); return }
        var drawing = PKDrawing()
        if let saved = call.getString("drawing"), !saved.isEmpty {
            guard let data = Data(base64Encoded: saved), let prior = try? PKDrawing(data: data) else {
                call.reject("BAD_DRAWING"); return
            }
            drawing = prior
        }
        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.bridge?.viewController, let web = self.bridge?.webView else {
                call.reject("NO_VIEW"); return
            }
            self.removeField()
            let page = InkPageController(drawing: drawing, title: "", done: "", cancel: "", compact: false,
                embedded: true, pencilOnly: call.getBool("pencilOnly") ?? false, accent: call.getString("accent")) { _ in }
            let clip = UIView()
            clip.clipsToBounds = true
            clip.isHidden = true
            host.addChild(page)
            host.view.addSubview(clip)
            clip.addSubview(page.view)
            page.didMove(toParent: host)
            self.field = (id, clip, page)
            page.onFieldChange = { [weak self] ink in
                self?.notifyListeners("fieldChange", data: ["sessionID": id, "ink": ink])
            }
            self.positionField(call, web: web)
            call.resolve()
        }
    }

    @objc func layoutField(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let self, self.field?.id == call.getString("sessionID"), let web = self.bridge?.webView {
                self.positionField(call, web: web)
            }
            call.resolve()
        }
    }

    private func positionField(_ call: CAPPluginCall, web: UIView) {
        guard let field, let parent = field.clip.superview else { return }
        let scale = web.bounds.width / max(1, call.getDouble("viewportWidth") ?? 1)
        func rect(_ key: String) -> CGRect {
            guard let values = call.getArray(key, Double.self), values.count == 4 else { return .zero }
            return CGRect(x: values[0] * scale, y: values[1] * scale, width: values[2] * scale, height: values[3] * scale)
        }
        let paper = web.convert(rect("paper"), to: parent)
        let clip = web.convert(rect("clip"), to: parent)
        let wasHidden = field.clip.isHidden
        field.clip.isHidden = clip.isEmpty
        if clip.isEmpty {
            if !wasHidden { field.page.hideTools() }
            return
        }
        field.clip.frame = clip
        field.page.view.frame = paper.offsetBy(dx: -clip.minX, dy: -clip.minY)
        field.page.view.layoutIfNeeded()
        if wasHidden { field.page.activateCanvas() }
    }

    @objc func readField(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let field = self?.field, field.id == call.getString("sessionID") else { call.reject("NO_FIELD"); return }
            call.resolve(field.page.inkPayload())
        }
    }

    @objc func closeField(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if self?.field?.id == call.getString("sessionID") { self?.removeField() }
            call.resolve()
        }
    }

    private func removeField() {
        guard let field else { return }
        self.field = nil
        field.page.onFieldChange = nil
        field.page.hideTools()
        field.page.willMove(toParent: nil)
        field.page.view.removeFromSuperview()
        field.page.removeFromParent()
        field.clip.removeFromSuperview()
    }

    @objc func draw(_ call: CAPPluginCall) {
        presentInk(call, sheetID: nil)
    }

    @objc func drawInSheet(_ call: CAPPluginCall) {
        guard let id = call.getString("sessionID"), !id.isEmpty else { call.reject("NO_SESSION"); return }
        presentInk(call, sheetID: id)
    }

    @objc func closeSheet(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let sheet = self?.sheet, sheet.id == call.getString("sessionID") { sheet.page.cancelTapped() }
            call.resolve()
        }
    }

    private func presentInk(_ call: CAPPluginCall, sheetID: String?) {
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
        let markX = call.getDouble("anchorX")
        let markY = call.getDouble("anchorY")
        let accent = call.getString("accent")
        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController, let web = self.bridge?.webView else {
                call.reject("NO_VIEW")
                return
            }
            let compact = sheetID != nil || (markX != nil && markY != nil)
            let page = InkPageController(drawing: drawing, title: title, done: done, cancel: cancel, compact: compact,
                                         embedded: sheetID != nil, pencilOnly: call.getBool("pencilOnly") ?? false, accent: accent) { [weak self] result in
                if let sheetID, self?.sheet?.id == sheetID { self?.sheet = nil }
                call.resolve(result)
            }
            let nav = UINavigationController(rootViewController: page)
            if let sheetID {
                self.sheet?.page.cancelTapped()
                self.sheet = (sheetID, page)
                // Containment keeps touches and accessibility in the visible half of the web reader.
                presenter.addChild(nav)
                nav.view.translatesAutoresizingMaskIntoConstraints = false
                nav.view.layer.cornerRadius = 14
                nav.view.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
                nav.view.clipsToBounds = true
                presenter.view.addSubview(nav.view)
                NSLayoutConstraint.activate([
                    nav.view.leadingAnchor.constraint(equalTo: web.leadingAnchor),
                    nav.view.trailingAnchor.constraint(equalTo: web.trailingAnchor),
                    nav.view.topAnchor.constraint(equalTo: web.centerYAnchor),
                    nav.view.bottomAnchor.constraint(equalTo: web.bottomAnchor),
                ])
                nav.didMove(toParent: presenter)
                presenter.view.layoutIfNeeded()
                page.activateCanvas()
                return
            }
            if let x = markX, let y = markY {
                nav.modalPresentationStyle = .popover
                nav.preferredContentSize = CGSize(width: 390, height: 260)
                let popover = nav.popoverPresentationController
                popover?.sourceView = web
                popover?.sourceRect = CGRect(x: max(0, min(1, x)) * web.bounds.width,
                                             y: max(0, min(1, y)) * web.bounds.height,
                                             width: 1, height: 1)
                popover?.delegate = page
            } else {
                nav.modalPresentationStyle = .fullScreen
            }
            presenter.present(nav, animated: true)
        }
    }
}

/// One tall page that grows as she writes, with the tool picker always showing.
final class InkPageController: UIViewController, PKCanvasViewDelegate, PKToolPickerObserver, UIPopoverPresentationControllerDelegate {
    private let canvas = PKCanvasView()
    private let picker = PKToolPicker()
    private let startDrawing: PKDrawing
    private let finish: ([String: Any]) -> Void
    private var finished = false
    private let compact: Bool
    private let embedded: Bool
    private let pencilOnly: Bool
    private let initialColor: UIColor?
    var onFieldChange: (([String: Any]) -> Void)?
    private var toolInUse = false
    private var lastPublished: PKDrawing?

    init(drawing: PKDrawing, title: String, done: String, cancel: String, compact: Bool, embedded: Bool, pencilOnly: Bool, accent: String?, finish: @escaping ([String: Any]) -> Void) {
        self.startDrawing = drawing
        self.finish = finish
        self.compact = compact
        self.embedded = embedded
        self.pencilOnly = pencilOnly
        if let accent, accent.hasPrefix("#"), accent.count == 7, let rgb = UInt32(accent.dropFirst(), radix: 16) {
            self.initialColor = UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
        } else {
            self.initialColor = nil
        }
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
        canvas.alwaysBounceVertical = !compact
        canvas.backgroundColor = .systemBackground
        // .default follows the iPad's own "Only Draw with Apple Pencil" setting (on once a Pencil is
        // paired), so a palm or finger scrolls and only the Pencil draws; the tool picker's menu can
        // switch finger drawing on. On an iPhone, a finger draws.
        canvas.drawingPolicy = pencilOnly ? .pencilOnly : (UIDevice.current.userInterfaceIdiom == .pad ? .default : .anyInput)
        let tool = PKInkingTool(.pen, color: initialColor ?? .label, width: 3)
        canvas.tool = tool
        if initialColor != nil { picker.selectedTool = tool }
        picker.addObserver(canvas)
        picker.addObserver(self)
        picker.setVisible(true, forFirstResponder: canvas)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        activateCanvas()
    }

    func activateCanvas() {
        picker.setVisible(true, forFirstResponder: canvas)
        canvas.becomeFirstResponder() // the tool picker shows for the canvas while it is first responder
        growPage()
    }

    func hideTools() {
        picker.setVisible(false, forFirstResponder: canvas)
        canvas.resignFirstResponder()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        growPage()
    }

    /// The page is always at least two screens tall, and a screen longer than the ink.
    private func growPage() {
        guard canvas.bounds.width > 0 else { return }
        let ink = canvas.drawing.bounds
        let width = embedded && !ink.isNull ? max(canvas.bounds.width, ink.maxX + 4) : canvas.bounds.width
        let inkBottom = ink.isNull ? 0 : ink.maxY
        let height = compact ? max(canvas.bounds.height, inkBottom + 4) : max(canvas.bounds.height * 2, inkBottom + canvas.bounds.height)
        if abs(canvas.contentSize.height - height) > 1 || canvas.contentSize.width != width {
            canvas.contentSize = CGSize(width: width, height: height)
        }
    }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        growPage()
        if !toolInUse { publishFieldInk() }
    }

    func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) { toolInUse = true }

    func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
        toolInUse = false
        // PencilKit commits the final stroke at the end of this event.
        DispatchQueue.main.async { [weak self] in self?.publishFieldInk() }
    }

    private func publishFieldInk() {
        guard let onFieldChange, canvas.drawing != (lastPublished ?? startDrawing) else { return }
        lastPublished = canvas.drawing
        onFieldChange(inkPayload())
    }

    @objc fileprivate func cancelTapped() {
        close(["cancelled": true])
    }

    @objc private func doneTapped() {
        if embedded && canvas.drawing == startDrawing { cancelTapped(); return }
        close(inkPayload())
    }

    func inkPayload() -> [String: Any] {
        let drawing = canvas.drawing
        if drawing.strokes.isEmpty { return ["empty": true] }
        // The picture: the full page width, from the top to just under the ink, on white,
        // drawn as in light mode (PencilKit shows black ink as white in dark mode).
        let width = embedded ? max(canvas.bounds.width, drawing.bounds.maxX + 4) : canvas.bounds.width
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
        // Positions are normalised to the same rendered page used for the PNG.
        let strokeBounds = drawing.strokes.prefix(20000).compactMap { stroke -> [CGFloat]? in
            let box = stroke.renderBounds.intersection(rect)
            guard !box.isNull, !box.isEmpty else { return nil }
            return [box.minX / rect.width, box.minY / rect.height, box.maxX / rect.width, box.maxY / rect.height]
        }
        return [
            "strokeBounds": strokeBounds,
            "drawing": drawing.dataRepresentation().base64EncodedString(),
            "png": image.pngData()?.base64EncodedString() ?? "",
            "width": Int(rect.width * 2),
            "height": Int(rect.height * 2),
            "colors": colors,
        ]
    }

    func adaptivePresentationStyle(for controller: UIPresentationController) -> UIModalPresentationStyle { .none }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard !finished else { return }
        finished = true
        finish(["cancelled": true])
    }

    private func close(_ result: [String: Any]) {
        guard !finished else { return }
        finished = true
        picker.setVisible(false, forFirstResponder: canvas)
        picker.removeObserver(canvas)
        picker.removeObserver(self)
        canvas.resignFirstResponder()
        if embedded, let nav = navigationController {
            nav.willMove(toParent: nil)
            nav.view.removeFromSuperview()
            nav.removeFromParent()
            finish(result)
        } else {
            dismiss(animated: true) { [finish] in finish(result) }
        }
    }

    private static func hex(_ color: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        let c = { (v: CGFloat) in Int((max(0, min(1, v)) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", c(r), c(g), c(b))
    }
}
