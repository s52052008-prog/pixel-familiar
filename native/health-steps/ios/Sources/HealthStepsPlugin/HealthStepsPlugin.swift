import Foundation
import Capacitor
import HealthKit

/// 幻獸日記：讀取「健康」App 每天的步數（只讀）。
/// 手動在健康 App 裡新增的步數（HKMetadataKeyWasUserEntered）不算，避免作弊。
@objc(HealthStepsPlugin)
public class HealthStepsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthStepsPlugin"
    public let jsName = "HealthSteps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDailySteps", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private var stepType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .stepCount) }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = stepType else {
            call.reject("這台裝置不能使用健康資料")
            return
        }
        store.requestAuthorization(toShare: nil, read: [type]) { ok, error in
            if let error = error { call.reject(error.localizedDescription); return }
            call.resolve(["granted": ok])
        }
    }

    /// 回傳最近 days 天（含今天）每天的步數：{ days: [{ date: "2026-11-17", steps: 8123 }, ...] }
    @objc func getDailySteps(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let type = stepType else {
            call.reject("這台裝置不能使用健康資料")
            return
        }
        let days = max(1, min(call.getInt("days") ?? 1, 30))
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)
        guard let start = calendar.date(byAdding: .day, value: -(days - 1), to: startOfToday) else {
            call.reject("日期計算失敗")
            return
        }
        var interval = DateComponents()
        interval.day = 1
        let range = HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate)
        let notManual = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyWasUserEntered, operatorType: .notEqualTo, value: true)
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [range, notManual])
        let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate,
                                                options: .cumulativeSum, anchorDate: startOfToday, intervalComponents: interval)
        query.initialResultsHandler = { _, results, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let fmt = DateFormatter()
            fmt.calendar = Calendar(identifier: .gregorian)
            fmt.locale = Locale(identifier: "en_US_POSIX")
            fmt.timeZone = calendar.timeZone
            fmt.dateFormat = "yyyy-MM-dd"
            var out: [[String: Any]] = []
            results?.enumerateStatistics(from: start, to: now) { stat, _ in
                let value = stat.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0
                out.append(["date": fmt.string(from: stat.startDate), "steps": Int(value)])
            }
            call.resolve(["days": out])
        }
        store.execute(query)
    }
}
