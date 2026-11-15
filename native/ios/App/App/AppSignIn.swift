import UIKit
import Capacitor
import AuthenticationServices

/// The app's one screen: Capacitor's web view, plus the app's own plugin.
/// `Main.storyboard` names this class.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppSignInPlugin())
    }
}

/// Signing in with Google from the app.
///
/// Google refuses a sign-in inside an app's web view. This opens the site's sign-in address in
/// the system's own sign-in sheet (ASWebAuthenticationSession: a real browser, sharing Safari's
/// cookies) and hands the page back the address the sheet returned to. That address carries a
/// one-time code, which the page exchanges for its session (server/src/appSignIn.ts).
///
/// The page calls `Capacitor.Plugins.AppSignIn.start({ url })` and gets `{ url }` back.
///
/// Two limits, because the page in the web view comes from a server:
///  - the sheet only opens an https address under the app's own site (`server.url`);
///  - the sheet only returns to this app's own scheme, its bundle identifier.
@objc(AppSignInPlugin)
public class AppSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AppSignInPlugin"
    public let jsName = "AppSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    /// Is this an address of the app's own site?
    static func isOwnSite(_ url: URL, home: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", home.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(), host == home.host?.lowercased(),
              url.port == home.port, url.user == nil, url.password == nil else { return false }
        // No "/../" that would climb out of the app's own part of the site.
        if url.path.contains("..") || url.absoluteString.lowercased().contains("%2e") { return false }
        let base = home.path.hasSuffix("/") ? home.path : home.path + "/"
        return url.path.hasPrefix(base)
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let text = call.getString("url"), let url = URL(string: text),
              let home = bridge?.config.serverURL, AppSignInPlugin.isOwnSite(url, home: home) else {
            call.reject("Not an address of this app's site.", "BAD_URL")
            return
        }
        guard let scheme = Bundle.main.bundleIdentifier else {
            call.reject("The app has no identifier.", "FAILED")
            return
        }

        DispatchQueue.main.async {
            self.session?.cancel()
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.session = nil
                if let callback = callback {
                    call.resolve(["url": callback.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Cancelled.", "CANCELLED")
                } else {
                    call.reject(error?.localizedDescription ?? "The sign-in did not finish.", "FAILED")
                }
            }
            session.presentationContextProvider = self
            // Share Safari's cookies: someone already signed in to Google there is not asked again.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("The sign-in sheet could not open.", "FAILED")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
