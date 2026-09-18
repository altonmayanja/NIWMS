/**
 * NIWMS Report Intelligence Engine v2.1
 *
 * A fully internal, rule-based intelligence engine that analyzes
 * employee activity submissions and generates consistent monthly reports.
 *
 * This is NOT a chatbot. NOT an LLM. NOT an external AI service.
 *
 * The engine is:
 *   - Deterministic: same inputs → same outputs
 *   - Auditable: every output traceable to daily report data
 *   - Predictable: rule-based, template-driven
 *   - Private: no data leaves the system
 */

export { DEFAULT_CATEGORIES, classifyActivity, getPrimaryCategory, type ActivityCategory } from './categories'
export {
  processMonthlyActivities,
  type DailyActivity,
  type ActivityWithCategories,
  type ProcessedReportData,
  type ReportStatistics,
  type CategoryBreakdown,
  type WeekActivity,
} from './statistics'
export { generateMonthlyReport, type MonthlyReportOutput } from './generator'
export { extractAchievements } from './achievements'
