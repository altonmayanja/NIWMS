/**
 * NIWMS Report Intelligence Engine — Achievement Extraction Module
 *
 * RULES:
 *   - Never invent information
 *   - Never fabricate achievements
 *   - Only generate achievements when activity patterns indicate completed work
 *   - Every achievement must be traceable to submitted daily reports
 *   - If insufficient evidence exists, return "No significant achievement patterns detected."
 *
 * Achievement Detection Strategies:
 *   1. DIVERSE COMPLETION: Activities across 4+ categories with 5+ submissions
 *   2. HIGH CONSISTENCY: 90%+ submission rate
 *   3. DEEP EXPERTISE: Single category > 40% of all activities
 *   4. HIGH VOLUME: 30+ total activities recorded
 *   5. CONSISTENCY STREAK: 10+ consecutive workday submissions
 *   6. NO ACHIEVEMENT: If none of the above thresholds are met
 */

import { ProcessedReportData, CategoryBreakdown } from './statistics'

interface AchievementCandidate {
  text: string
  evidence: string
  confidence: 'high' | 'medium' | 'low'
}

function capitalizeFirst(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Strategy 1: Diverse Work Completion
 * Triggered when employee worked across 4+ categories with reasonable activity count.
 */
function detectDiverseCompletion(data: ProcessedReportData): AchievementCandidate | null {
  const cats = data.categoryBreakdown
  if (cats.length < 4 || data.statistics.totalReportsSubmitted < 5) return null

  const topAreas = cats.slice(0, 4).map((c) => c.categoryName)
  const areaText = topAreas.length === 2
    ? `${topAreas[0]} and ${topAreas[1]}`
    : `${topAreas.slice(0, -1).join(', ')}, and ${topAreas[topAreas.length - 1]}`

  return {
    text: `Demonstrated versatile contribution across ${cats.length} operational areas including ${areaText.toLowerCase()}, reflecting broad organizational impact.`,
    evidence: `${cats.length} categories worked across ${data.statistics.totalReportsSubmitted} reports`,
    confidence: 'high',
  }
}

/**
 * Strategy 2: High Reporting Consistency
 * Triggered when submission rate is >= 90%.
 */
function detectHighConsistency(data: ProcessedReportData): AchievementCandidate | null {
  if (data.statistics.submissionRate < 90) return null
  return {
    text: `Achieved ${data.statistics.submissionRate}% reporting consistency (${data.statistics.totalReportsSubmitted} of ${data.statistics.expectedReports} working days), demonstrating strong accountability and reliability.`,
    evidence: `Submission rate: ${data.statistics.submissionRate}%`,
    confidence: 'high',
  }
}

/**
 * Strategy 3: Deep Expertise / Specialization
 * Triggered when a single category exceeds 40% of total activities.
 */
function detectDeepExpertise(data: ProcessedReportData): AchievementCandidate | null {
  const top = data.categoryBreakdown[0]
  if (!top || top.percentage < 40 || data.statistics.totalActivitiesRecorded < 10) return null

  return {
    text: `Developed deep expertise in ${top.categoryName.toLowerCase()} operations, handling ${top.count} activities (${top.percentage}% of total workload) throughout the reporting period.`,
    evidence: `${top.categoryName}: ${top.count} activities (${top.percentage}%)`,
    confidence: 'high',
  }
}

/**
 * Strategy 4: High Activity Volume
 * Triggered when total activities exceed 30.
 */
function detectHighVolume(data: ProcessedReportData): AchievementCandidate | null {
  if (data.statistics.totalActivitiesRecorded < 30) return null

  return {
    text: `Maintained high productivity with ${data.statistics.totalActivitiesRecorded} recorded activities across ${data.statistics.categoriesWorked} categories during the reporting period.`,
    evidence: `${data.statistics.totalActivitiesRecorded} activities recorded`,
    confidence: 'medium',
  }
}

/**
 * Strategy 5: Consistency Streak
 * Triggered when consecutive submission streak reaches 10+ days.
 */
function detectConsistencyStreak(data: ProcessedReportData): AchievementCandidate | null {
  if (data.statistics.longestStreak < 10) return null

  return {
    text: `Maintained a consecutive daily reporting streak of ${data.statistics.longestStreak} days, reflecting consistent engagement and documentation practices.`,
    evidence: `Longest streak: ${data.statistics.longestStreak} days`,
    confidence: 'high',
  }
}

/**
 * Strategy 6: Significant Activity Focus Area (Dominant)
 * Triggered when two categories combined exceed 60% of activities.
 * This shows the employee was focused on specific operational priorities.
 */
function detectFocusedImpact(data: ProcessedReportData): AchievementCandidate | null {
  if (data.categoryBreakdown.length < 2) return null
  const top = data.categoryBreakdown[0]
  const second = data.categoryBreakdown[1]
  const combined = top.percentage + second.percentage
  if (combined < 60 || data.statistics.totalActivitiesRecorded < 8) return null

  return {
    text: `Demonstrated focused operational impact in ${top.categoryName.toLowerCase()} and ${second.categoryName.toLowerCase()}, contributing ${combined}% of all recorded activities.`,
    evidence: `${top.categoryName} + ${second.categoryName}: ${combined}%`,
    confidence: 'medium',
  }
}

/**
 * Main Achievement Extraction Function.
 *
 * Returns achievements based on pattern detection.
 * Each achievement is backed by real data evidence.
 * If no patterns qualify, returns a single "no achievements" message.
 */
export function extractAchievements(data: ProcessedReportData): string[] {
  const candidates: AchievementCandidate[] = []

  // Run all detection strategies
  const strategies = [
    detectHighConsistency(data),
    detectConsistencyStreak(data),
    detectDeepExpertise(data),
    detectDiverseCompletion(data),
    detectHighVolume(data),
    detectFocusedImpact(data),
  ]

  // Collect valid candidates
  const seen = new Set<string>()
  for (const candidate of strategies) {
    if (!candidate) continue
    // Deduplicate by normalized text
    const normalized = candidate.text.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      candidates.push(candidate)
    }
  }

  // Sort: high confidence first, then medium, then low
  candidates.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.confidence] - order[b.confidence]
  })

  // If no achievements detected, return the "no evidence" message
  if (candidates.length === 0) {
    return ['No significant achievement patterns detected.']
  }

  // Cap at 8 achievements
  return candidates.slice(0, 8).map((c) => c.text)
}
