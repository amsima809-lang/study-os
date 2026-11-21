import Foundation
import Capacitor
import EventKit

/// Busy times from the calendars on the phone (iCloud, and Google, Exchange or other accounts added
/// in Settings), so the term preview can show when she is already busy.
///
/// Only start and end times leave this file: never an event's title, place, notes or people. An
/// event she marked "free" is left out; an all-day event counts only if marked busy. The page calls
///   Capacitor.Plugins.AppCalendar.status()            -> { status: "granted" | "denied" | "notDetermined" | "restricted" | "writeOnly" }
///   Capacitor.Plugins.AppCalendar.request()           -> { granted }   (the system's own permission prompt, once)
///   Capacitor.Plugins.AppCalendar.busy({ from, to })  -> { blocks: [{ start, end }] }   (ISO 8601, UTC)
/// Nothing is stored here; the page does not send the times to the server either.
@objc(AppCalendarPlugin)
public class AppCalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppCalendarPlugin"
    public let jsName = "AppCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "busy", returnType: CAPPluginReturnPromise),
    ]
    private let store = EKEventStore()

    private func statusName() -> String {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            switch status {
            case .fullAccess: return "granted"
            case .writeOnly: return "writeOnly"
            case .denied: return "denied"
            case .restricted: return "restricted"
            case .notDetermined: return "notDetermined"
            @unknown default: return "denied"
            }
        }
        switch status {
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        default: return "granted" // .authorized before iOS 17
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["status": statusName()])
    }

    /// Reading needs full access (iOS 17: "Your app can't request read-only access").
    @objc func request(_ call: CAPPluginCall) {
        let done: (Bool, Error?) -> Void = { granted, _ in call.resolve(["granted": granted]) }
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents(completion: done)
        } else {
            store.requestAccess(to: .event, completion: done)
        }
    }

    /// "2026-11-15T17:00:00.000Z" (JavaScript's toISOString) or without the milliseconds.
    private func parseDate(_ text: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }

    /// The host of the site the app shows: events from this app's own calendar feed carry it as
    /// their URL (server/src/calendarFeed.ts), and are left out: they are her classes, not her busy time.
    private func ownHost() -> String? {
        return bridge?.config.serverURL.host
    }

    @objc func busy(_ call: CAPPluginCall) {
        guard statusName() == "granted" else { call.reject("not allowed", "NOT_ALLOWED"); return }
        let iso = ISO8601DateFormatter()
        guard let fromText = call.getString("from"), let toText = call.getString("to"),
              let from = parseDate(fromText), let to = parseDate(toText), to > from,
              to.timeIntervalSince(from) <= 62 * 24 * 3600 else {
            call.reject("bad range", "BAD_RANGE"); return
        }
        let own = ownHost()
        // The app's own feed, subscribed on this phone, is named after the app ("Termtrail · …"): skip it too.
        let appName = (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String) ?? ""
        let calendars = store.calendars(for: .event).filter { calendar in
            if calendar.type == .birthday { return false }
            if calendar.type == .subscription && !appName.isEmpty && calendar.title.hasPrefix(appName) { return false }
            return true
        }
        let events = store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: calendars))
        let blocks: [[String: String]] = events.compactMap { event in
            // Not busy: her own Termtrail feed, a cancelled event, an invitation she declined.
            if let own = own, event.url?.host == own { return nil }
            if event.status == .canceled { return nil }
            if let me = event.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined { return nil }
            let busy: Bool
            switch event.availability {
            case .free: busy = false
            case .busy, .unavailable, .tentative: busy = true
            default: busy = !event.isAllDay // the account does not say: a timed event counts, an all-day one does not
            }
            guard busy, let start = event.startDate, let end = event.endDate else { return nil }
            return ["start": iso.string(from: start), "end": iso.string(from: end)]
        }
        call.resolve(["blocks": blocks])
    }
}
