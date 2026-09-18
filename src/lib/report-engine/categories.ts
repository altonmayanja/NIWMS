/**
 * NIWMS Report Intelligence Engine — Activity Categories
 * 
 * Configurable by administrators. Each category has a set of keywords
 * used for automatic classification of employee activity descriptions.
 * 
 * This is a RULE-BASED system — no LLM, no AI service calls.
 * Classification is deterministic, auditable, and fully private.
 */

export interface ActivityCategory {
  id: string
  name: string
  color: string
  keywords: string[]
  description: string
}

export const DEFAULT_CATEGORIES: ActivityCategory[] = [
  {
    id: 'technical-support',
    name: 'Technical Support',
    color: '#0B1F6D',
    description: 'Troubleshooting, repairs, and technical assistance',
    keywords: [
      'troubleshoot', 'support', 'assist', 'help', 'fix', 'repair',
      'debug', 'resolve', 'issue', 'problem', 'error', 'fault', 'broken',
      'not working', 'malfunction', 'crash', 'slow', 'unresponsive',
      'diagnose', 'investigate', 'restore', 'recover',
    ],
  },
  {
    id: 'software-installation',
    name: 'Software Installation',
    color: '#059669',
    description: 'Installing, deploying, and updating software systems',
    keywords: [
      'install', 'installed', 'installation', 'deployment', 'deploy', 'upgrade',
      'update', 'updated', 'patch', 'version', 'software', 'application', 'app',
      'reinstall', 'uninstall', 'configure', 'configuration', 'setup', 'set up',
      'migrate', 'migration',
    ],
  },
  {
    id: 'networking',
    name: 'Networking',
    color: '#D97706',
    description: 'Network infrastructure, internet, and connectivity',
    keywords: [
      'internet', 'network', 'router', 'connectivity', 'wifi', 'wi-fi',
      'lan', 'wan', 'cable', 'switch', 'firewall', 'dns', 'ip address',
      'bandwidth', 'connection', 'online', 'offline', 'proxy', 'server',
      'access point', 'ethernet', 'fiber', 'modem',
    ],
  },
  {
    id: 'administration',
    name: 'Administration',
    color: '#7C3AED',
    description: 'Meetings, documentation, planning, and organizational tasks',
    keywords: [
      'meeting', 'documentation', 'reporting', 'filing', 'schedule',
      'planning', 'organize', 'coordinate', 'review', 'approve', 'assessment',
      'budget', 'inventory', 'procurement', 'policy', 'memo', 'correspondence',
      'briefing', 'agenda', 'minutes', 'prepare', 'presentation',
    ],
  },
  {
    id: 'production-support',
    name: 'Production Support',
    color: '#DC2626',
    description: 'Film, media, and content production activities',
    keywords: [
      'filming', 'editing', 'media', 'production', 'video', 'audio',
      'camera', 'lighting', 'sound', 'studio', 'shoot', 'footage',
      'premiere', 'screening', 'post-production', 'graphics', 'animation',
      'director', 'script', 'cast', 'scene', 'render',
    ],
  },
  {
    id: 'data-management',
    name: 'Data Management',
    color: '#0891B2',
    description: 'Data entry, backup, storage, and database operations',
    keywords: [
      'data', 'database', 'backup', 'migration', 'import', 'export',
      'excel', 'spreadsheet', 'entry', 'record', 'archive', 'storage',
      'statistics', 'analysis', 'analytics', 'dashboard', 'query', 'report',
    ],
  },
  {
    id: 'communication',
    name: 'Communication',
    color: '#CA8A04',
    description: 'Emails, phone calls, stakeholder engagement, and outreach',
    keywords: [
      'email', 'phone', 'call', 'message', 'notification', 'announcement',
      'newsletter', 'social media', 'website', 'blog', 'press', 'public',
      'stakeholder', 'client', 'customer', 'vendor', 'partner',
      'informed', 'notified', 'contacted', 'replied',
    ],
  },
  {
    id: 'security',
    name: 'Security',
    color: '#B91C1C',
    description: 'Security, access control, and compliance',
    keywords: [
      'security', 'password', 'access', 'permission', 'login', 'auth',
      'encrypt', 'malware', 'virus', 'threat', 'vulnerability', 'audit',
      'compliance', 'risk', 'safety', 'protocol', 'surveillance',
      'unauthorized', 'breach', 'protect',
    ],
  },
  {
    id: 'training',
    name: 'Training',
    color: '#2563EB',
    description: 'Training sessions, workshops, and skill development',
    keywords: [
      'training', 'workshop', 'seminar', 'course', 'learned', 'learning',
      'taught', 'coaching', 'mentoring', 'orientation', 'onboarding',
      'certification', 'skill', 'development', 'tutorial', 'lesson',
      'capacity building', 'knowledge', 'instructed',
    ],
  },
  {
    id: 'research',
    name: 'Research',
    color: '#4F46E5',
    description: 'Research, analysis, and information gathering',
    keywords: [
      'research', 'survey', 'study', 'analyze', 'analysis', 'findings',
      'investigation', 'evaluate', 'assessment', 'benchmark', 'comparison',
      'review literature', 'data collection', 'sample', 'hypothesis',
      'experiment', 'observation', 'field work',
    ],
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    color: '#64748B',
    description: 'Equipment maintenance, cleaning, and facility upkeep',
    keywords: [
      'maintenance', 'clean', 'cleaning', 'service', 'servicing', 'inspect',
      'inspection', 'replace', 'replaced', 'repair', 'fix', 'upkeep',
      'calibrate', 'adjust', 'lubricate', 'overhaul', 'refurbish',
      'equipment', 'facility', 'office', 'premises',
    ],
  },
]

/**
 * Classify a single activity text into ALL matching categories.
 * An activity can belong to multiple categories.
 */
export function classifyActivity(text: string, categories: ActivityCategory[]): ActivityCategory[] {
  const lowerText = text.toLowerCase()
  return categories.filter((cat) =>
    cat.keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()))
  )
}

/**
 * Get the primary (best matching) category for an activity.
 * Returns the category with the most keyword matches.
 * Ties broken by category order (first defined wins).
 */
export function getPrimaryCategory(text: string, categories: ActivityCategory[]): ActivityCategory | null {
  const lowerText = text.toLowerCase()
  let bestMatch: ActivityCategory | null = null
  let bestCount = 0

  for (const cat of categories) {
    const matchCount = cat.keywords.filter((kw) => lowerText.includes(kw.toLowerCase())).length
    if (matchCount > bestCount) {
      bestCount = matchCount
      bestMatch = cat
    }
  }

  return bestMatch
}

/**
 * Get all category IDs that an activity matches, sorted by match strength.
 */
export function getCategoryScores(text: string, categories: ActivityCategory[]): { category: ActivityCategory; score: number }[] {
  const lowerText = text.toLowerCase()
  return categories
    .map((cat) => ({
      category: cat,
      score: cat.keywords.filter((kw) => lowerText.includes(kw.toLowerCase())).length,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
}
