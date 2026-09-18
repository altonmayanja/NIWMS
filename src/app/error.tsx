'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-[#c47b32]/10 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-[#c47b32]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-500 mb-8">
              An unexpected error occurred. This has been logged for review.
              Please try refreshing the page.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => reset()}
                className="px-5 py-2.5 bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg font-medium text-sm transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium text-sm border border-gray-200 transition-colors"
              >
                Go Home
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-left">
                <p className="text-xs font-mono text-red-700 break-all">{error.message}</p>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
