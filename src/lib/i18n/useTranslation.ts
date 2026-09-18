'use client'

import { useState, useCallback, useMemo } from 'react'
import { translations, type Locale } from './translations'

// Natural Intellects language preference. The historic 'ufmi_language' key is
// still read so returning users keep their saved language, but new writes use
// the product key.
const LANGUAGE_STORAGE_KEY = 'ni_language'
const LEGACY_LANGUAGE_STORAGE_KEY = 'ufmi_language'

function readSavedLocale(): Locale | null {
  if (typeof window === 'undefined') return null
  const saved =
    localStorage.getItem(LANGUAGE_STORAGE_KEY) ??
    localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY)
  if (saved && translations[saved as Locale]) return saved as Locale
  return null
}

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>('en')

  // Initialize locale from localStorage (only once, during first render)
  const mounted = useMemo(() => {
    return readSavedLocale() ?? ('en' as Locale)
  }, [])

  // Sync the initial locale from localStorage on mount
  const [initialized, setInitialized] = useState(false)
  useState(() => {
    const saved = readSavedLocale()
    if (saved) setLocaleState(saved)
    return undefined
  })

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    let text = translations[locale]?.[key] || translations.en[key] || key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v))
      })
    }
    return text
  }, [locale])

  const setLocale = useCallback((newLocale: Locale) => {
    if (translations[newLocale]) {
      setLocaleState(newLocale)
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLocale)
    }
  }, [])

  return { t, locale, setLocale, mounted: true }
}
