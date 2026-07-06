import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // Opaque cover added over the window when the app backgrounds WITH App lock
    // enabled, so the user's portfolio never appears in the iOS app-switcher
    // snapshot. The JS AppLock overlay (driven by visibilitychange) cannot be
    // guaranteed to composite a new frame before iOS captures that snapshot, so a
    // synchronous native cover is the reliable guard. Removed on foreground, where
    // the JS overlay takes over the actual Face ID re-lock.
    private var privacyCover: UIView?

    // App lock is a device-local opt-in stored by the web layer via
    // @capacitor/preferences (key "volnar.appLock"), which persists to
    // UserDefaults under the "CapacitorStorage." prefix.
    private func appLockEnabled() -> Bool {
        return UserDefaults.standard.string(forKey: "CapacitorStorage.volnar.appLock") == "1"
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // iOS captures the app-switcher snapshot right after this returns. With App
        // lock on, cover the window synchronously so the snapshot shows a blank
        // themed screen instead of the portfolio. Skipped when App lock is off, so
        // users who didn't opt in keep their normal multitasking thumbnail. Using
        // didEnterBackground (not willResignActive) avoids re-covering every time
        // the Face ID sheet transiently resigns the app.
        guard appLockEnabled(), privacyCover == nil, let window = window else { return }
        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.075, green: 0.067, blue: 0.035, alpha: 1) // ~#131109
                : UIColor(red: 0.965, green: 0.961, blue: 0.945, alpha: 1) // ~#F6F5F1
        }
        window.addSubview(cover)
        privacyCover = cover
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Coming back to the foreground: drop the native cover so the JS AppLock
        // overlay (which prompts for Face ID) is what the user sees.
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Forward APNs registration results to the Capacitor push-notifications
    // plugin (it listens for these notification-center posts; without the
    // forwarding the JS 'registration' event never fires).
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
