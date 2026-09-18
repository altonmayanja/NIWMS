/**
 * NIWMS Report Intelligence Engine — Statistics & Processing
 * 
 * Core processing pipeline:
 *   1. Clean data (deduplicate, normalize)
 *   2. Split multi-activity entries
 *   3. Classify each activity into categories
 *   4. Calculate comprehensive statistics
 *   5. Detect dominant focus areas and recurring tasks
 */

import { format, startOfMonth, endOfMonth, eachDayOfInterval, getISOWeek } from 'date-fns'
import { ActivityCategory, classifyActivity, getPrimaryCategory } from './categories'

// ──── TYPES ────

export interface DailyActivity {
  date: string
  activityText: string
  createdAt: string
  location?: string | null
  timeIn?: string | null
  timeOut?: string | null
  comments?: string | null
}

export interface ActivityWithCategories {
  date: string
  activityText: string
  createdAt: string
  location?: string | null
  timeIn?: string | null
  timeOut?: string | null
  comments?: string | null
  categories: ActivityCategory[]
  primaryCategory: ActivityCategory | null
}

export interface CategoryBreakdown {
  categoryId: string
  categoryName: string
  count: number
  percentage: number
  color: string
  description: string
  sampleActivities: string[]
}

export interface WeekActivity {
  weekNumber: number
  weekLabel: string
  activityCount: number
  reportCount: number
}

export interface ReportStatistics {
  // Submission stats
  totalReportsSubmitted: number
  expectedReports: number
  submissionRate: number
  missedSubmissions: number

  // Activity stats
  totalActivitiesRecorded: number
  avgActivitiesPerDay: number
  avgActivitiesPerReport: number
  totalWords: number
  avgWordsPerReport: number

  // Temporal stats
  mostActiveDay: string | null
  mostActiveDayCount: number
  mostActiveWeek: string | null
  mostActiveWeekCount: number

  // Streak stats
  longestStreak: number
  currentStreak: number

  // Category stats
  categoriesWorked: number
  topCategory: string
  mostFrequentCategory: string
  top3Categories: { name: string; count: number; percentage: number }[]

  // Focus detection
  dominantFocus: string | null
}

export interface ProcessedReportData {
  activities: ActivityWithCategories[]
  dailyReports: { date: string; activityCount: number }[]
  statistics: ReportStatistics
  categoryBreakdown: CategoryBreakdown[]
  topCategories: CategoryBreakdown[]
  weekBreakdown: WeekActivity[]
  recurringTasks: string[]
  dominantFocusArea: string | null
}

// ──── HELPERS ────

function getExpectedWorkDays(month: string): number {
  const [year, mon] = month.split('-').map(Number)
  const start = startOfMonth(new Date(year, mon - 1, 1))
  const end = endOfMonth(start)
  const days = eachDayOfInterval({ start, end })
  return days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6).length
}

function splitActivities(text: string): string[] {
  return text
    .split(/[\n\r]+/)
    .map((line) => line
      .replace(/^[\s\-\*\d.)]+\s*/, '')
      .replace(/\s{2,}/g, ' ')
      .trim())
    .filter((line) => line.length > 3)
}

function removeDuplicates(activities: DailyActivity[]): DailyActivity[] {
  const seen = new Set<string>()
  return activities.filter((a) => {
    const normalized = a.activityText.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function calculateStreaks(dates: string[]): { longest: number; current: number } {
  if (dates.length === 0) return { longest: 0, current: 0 }

  const sorted = [...new Set(dates)].sort()
  let longest = 1
  let tempLongest = 1

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00')
    const curr = new Date(sorted[i] + 'T00:00:00')
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      tempLongest++
      longest = Math.max(longest, tempLongest)
    } else {
      tempLongest = 1
    }
  }

  const today = new Date()
  const mostRecent = new Date(sorted[sorted.length - 1] + 'T00:00:00')
  const daysSinceLast = Math.round((today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24))
  const current = daysSinceLast <= 1 ? tempLongest : 0

  return { longest, current }
}

function calculateWeekBreakdown(
  activities: ActivityWithCategories[],
  month: string
): WeekActivity[] {
  const weekMap: Record<number, { activities: Set<string>; dates: Set<string> }> = {}

  for (const a of activities) {
    const date = new Date(a.date + 'T00:00:00')
    const weekNum = getISOWeek(date)
    if (!weekMap[weekNum]) {
      weekMap[weekNum] = { activities: new Set(), dates: new Set() }
    }
    weekMap[weekNum].activities.add(a.activityText.toLowerCase())
    weekMap[weekNum].dates.add(a.date)
  }

  return Object.entries(weekMap)
    .map(([week, data]) => ({
      weekNumber: Number(week),
      weekLabel: `Week ${week}`,
      activityCount: data.activities.size,
      reportCount: data.dates.size,
    }))
    .sort((a, b) => a.weekNumber - b.weekNumber)
}

function findRecurringTasks(activities: ActivityWithCategories[]): string[] {
  const patternCounts: Record<string, number> = {}

  for (const a of activities) {
    const phrases = a.activityText
      .split(/[.,;]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 10 && p.length < 80)

    for (const phrase of phrases) {
      const normalized = phrase
        .replace(/\b(the|a|an|is|was|were|to|for|of|in|on|at|with|and|or|also)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (normalized.length > 8) {
        // Group similar phrases by their first 4 significant words
        const words = normalized.split(' ').slice(0, 4).join(' ')
        patternCounts[words] = (patternCounts[words] || 0) + 1
      }
    }
  }

  return Object.entries(patternCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([task]) => task)
}

/**
 * TASK DETECTION ENGINE
 * Identifies the dominant work focus from activity patterns.
 * Uses category concentration + keyword frequency analysis.
 */
function detectDominantFocus(
  categoryBreakdown: CategoryBreakdown[],
  totalActivities: number
): string | null {
  if (totalActivities === 0 || categoryBreakdown.length === 0) return null

  const top = categoryBreakdown[0]

  // If top category is > 40% of all activities, it's the dominant focus
  if (top.percentage >= 40) {
    return `${top.categoryName} Operations`
  }

  // If top 2 categories together are > 60%, combine them
  if (categoryBreakdown.length >= 2) {
    const combined = top.percentage + categoryBreakdown[1].percentage
    if (combined >= 60) {
      return `${top.categoryName} & ${categoryBreakdown[1].categoryName}`
    }
  }

  // Otherwise use top category with a qualifier
  return `${top.categoryName} (Primary Focus)`
}

// ──── MAIN PROCESSING FUNCTION ────

export function processMonthlyActivities(
  dailyReports: DailyActivity[],
  month: string,
  categories: ActivityCategory[]
): ProcessedReportData {
  // STEP 1: Clean data — remove duplicates
  const cleanedActivities = removeDuplicates(dailyReports)

  // STEP 2: Split into individual activities and classify
  const allActivities: ActivityWithCategories[] = []
  for (const report of cleanedActivities) {
    const subActivities = splitActivities(report.activityText)
    for (const text of subActivities) {
      const cats = classifyActivity(text, categories)
      const primary = getPrimaryCategory(text, categories)
      allActivities.push({
        date: report.date,
        activityText: text,
        createdAt: report.createdAt,
        location: report.location,
        timeIn: report.timeIn,
        timeOut: report.timeOut,
        comments: report.comments,
        categories: cats,
        primaryCategory: primary,
      })
    }
  }

  // STEP 3: Build daily report summary
  const dailyReportMap: Record<string, number> = {}
  for (const a of allActivities) {
    dailyReportMap[a.date] = (dailyReportMap[a.date] || 0) + 1
  }
  const dailyReportsSummary = Object.entries(dailyReportMap)
    .map(([date, activityCount]) => ({ date, activityCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // STEP 4: Category breakdown
  const categoryMap: Record<string, { count: number; activities: string[] }> = {}
  for (const activity of allActivities) {
    const primaryCat = activity.primaryCategory
    if (primaryCat) {
      if (!categoryMap[primaryCat.id]) {
        categoryMap[primaryCat.id] = { count: 0, activities: [] }
      }
      categoryMap[primaryCat.id].count++
      if (categoryMap[primaryCat.id].activities.length < 3) {
        categoryMap[primaryCat.id].activities.push(activity.activityText)
      }
    }
  }

  const totalActivities = allActivities.length
  const categoryBreakdown: CategoryBreakdown[] = Object.entries(categoryMap)
    .map(([catId, data]) => {
      const cat = categories.find((c) => c.id === catId)!
      return {
        categoryId: catId,
        categoryName: cat.name,
        count: data.count,
        percentage: totalActivities > 0 ? Math.round((data.count / totalActivities) * 100) : 0,
        color: cat.color,
        description: cat.description,
        sampleActivities: data.activities,
      }
    })
    .sort((a, b) => b.count - a.count)

  // STEP 5: Calculate statistics
  const expectedWorkDays = getExpectedWorkDays(month)
  const uniqueDates = [...new Set(cleanedActivities.map((a) => a.date))]
  const submissionRate = expectedWorkDays > 0
    ? Math.round((uniqueDates.length / expectedWorkDays) * 100)
    : 0
  const missedSubmissions = Math.max(0, expectedWorkDays - uniqueDates.length)

  const totalWords = allActivities.reduce(
    (sum, a) => sum + a.activityText.split(/\s+/).filter(Boolean).length,
    0
  )

  // Day of week analysis
  const dayCounts: Record<string, number> = {}
  for (const d of uniqueDates) {
    const dayName = format(new Date(d + 'T00:00:00'), 'EEEE')
    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1
  }
  let mostActiveDay: string | null = null
  let mostActiveDayCount = 0
  for (const [day, count] of Object.entries(dayCounts)) {
    if (count > mostActiveDayCount) {
      mostActiveDay = day
      mostActiveDayCount = count
    }
  }

  // Week breakdown
  const weekBreakdown = calculateWeekBreakdown(allActivities, month)
  let mostActiveWeek: string | null = null
  let mostActiveWeekCount = 0
  for (const week of weekBreakdown) {
    if (week.activityCount > mostActiveWeekCount) {
      mostActiveWeek = week.weekLabel
      mostActiveWeekCount = week.activityCount
    }
  }

  // Streaks
  const { longest: longestStreak, current: currentStreak } = calculateStreaks(uniqueDates)

  // Top categories
  const topCategories = categoryBreakdown.slice(0, 3)
  const top3Categories = topCategories.map((c) => ({
    name: c.categoryName,
    count: c.count,
    percentage: c.percentage,
  }))

  // Recurring tasks
  const recurringTasks = findRecurringTasks(allActivities)

  // Dominant focus
  const dominantFocusArea = detectDominantFocus(categoryBreakdown, totalActivities)

  const statistics: ReportStatistics = {
    totalReportsSubmitted: uniqueDates.length,
    expectedReports: expectedWorkDays,
    submissionRate,
    missedSubmissions,
    totalActivitiesRecorded: totalActivities,
    avgActivitiesPerDay: uniqueDates.length > 0 ? Math.round((totalActivities / uniqueDates.length) * 10) / 10 : 0,
    avgActivitiesPerReport: uniqueDates.length > 0 ? Math.round((totalActivities / uniqueDates.length) * 10) / 10 : 0,
    totalWords,
    avgWordsPerReport: uniqueDates.length > 0 ? Math.round(totalWords / uniqueDates.length) : 0,
    mostActiveDay,
    mostActiveDayCount,
    mostActiveWeek,
    mostActiveWeekCount,
    longestStreak,
    currentStreak,
    categoriesWorked: categoryBreakdown.length,
    topCategory: topCategories[0]?.categoryName || 'N/A',
    mostFrequentCategory: topCategories[0]?.categoryName || 'N/A',
    top3Categories,
    dominantFocus: dominantFocusArea,
  }

  return {
    activities: allActivities,
    dailyReports: dailyReportsSummary,
    statistics,
    categoryBreakdown,
    topCategories,
    weekBreakdown,
    recurringTasks,
    dominantFocusArea,
  }
}
