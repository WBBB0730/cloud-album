'use client'

import { Toaster as HotToaster } from 'react-hot-toast'

export function AppToaster() {
  return (
    <HotToaster
      position="bottom-center"
      reverseOrder={false}
      gutter={8}
      containerStyle={{
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        zIndex: 2147483647,
      }}
      toastOptions={{
        duration: 3000,
        style: {
          border: '1px solid var(--album-line)',
          borderRadius: '10px',
          background: 'var(--album-surface)',
          color: 'var(--album-text)',
          fontSize: '14px',
          fontWeight: 500,
          padding: '10px 14px',
        },
        success: {
          iconTheme: {
            primary: 'var(--album-accent)',
            secondary: '#fff',
          },
        },
        error: {
          duration: 4000,
          iconTheme: {
            primary: '#c24141',
            secondary: '#fff',
          },
        },
      }}
    />
  )
}
