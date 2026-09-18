import { create } from 'zustand'

export interface UserProfile {
  employeeId?: string
  position?: string
}

export interface User {
  id: string
  username: string
  role: 'admin' | 'employee' | 'super_admin'
  status: string
  organizationId?: string
  organizationName?: string
  reportDeadline?: string
  membershipId?: string
  organizationRole?: string
  mustChangePassword?: boolean
  passwordChangedAt?: string | null
  profile: UserProfile | null
}

const INACTIVITY_TIMEOUT = 20 * 60 * 1000
let inactivityTimer: ReturnType<typeof setTimeout> | null = null
let activityHandlers: Array<[string, EventListener]> = []

function resetInactivityTimer(logoutFn: () => void) {
  if (typeof window === 'undefined') return
  if (inactivityTimer) clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(logoutFn, INACTIVITY_TIMEOUT)
}

function startActivityTracking(logoutFn: () => void) {
  if (typeof window === 'undefined' || activityHandlers.length) return
  const handler: EventListener = () => resetInactivityTimer(logoutFn)
  for (const event of ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']) {
    window.addEventListener(event, handler, { passive: true })
    activityHandlers.push([event, handler])
  }
}

function stopActivityTracking() {
  if (typeof window === 'undefined') return
  if (inactivityTimer) clearTimeout(inactivityTimer)
  inactivityTimer = null
  for (const [event, handler] of activityHandlers) window.removeEventListener(event, handler)
  activityHandlers = []
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  isInitialized: boolean
  login: (token: string | undefined, user: User) => void
  logout: () => Promise<void>
  initialize: () => Promise<void>
  patchUser: (partial: Partial<User>) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  isInitialized: false,

  login: (token, user) => {
    set({ token: token ?? null, user, isAuthenticated: true, isAdmin: user.role === 'admin' || user.role === 'super_admin' })
    startActivityTracking(get().logout)
    resetInactivityTimer(get().logout)
  },

  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    stopActivityTracking()
    set({ token: null, user: null, isAuthenticated: false, isAdmin: false })
  },

  patchUser: (partial) => {
    const current = get().user
    if (!current) return
    set({ user: { ...current, ...partial } })
  },

  initialize: async () => {
    if (typeof window === 'undefined') {
      set({ isInitialized: true })
      return
    }
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      if (!response.ok) throw new Error('Session expired')
      const user = await response.json() as User
      set({ user, token: null, isAuthenticated: true, isAdmin: user.role === 'admin' || user.role === 'super_admin', isInitialized: true })
      startActivityTracking(get().logout)
      resetInactivityTimer(get().logout)
      return
    } catch {
      stopActivityTracking()
      set({ token: null, user: null, isAuthenticated: false, isAdmin: false, isInitialized: true })
    }
  },
}))
