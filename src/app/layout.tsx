import { Geist, Geist_Mono } from 'next/font/google'
import type { Metadata, Viewport } from 'next'

import '@/styles/global.css'
import { AppToaster } from '@/components/app/app-toaster'
import { AppHistoryRecorder } from '@/components/app/app-history-recorder'
import { ClientOnlyGate } from '@/components/app/client-only-gate'
import { GlobalLoadingProvider } from '@/components/app/global-loading'
import { ViewportSize } from '@/components/app/viewport-size'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: '拾云',
  description: '一个轻量的云相册',
  applicationName: '拾云',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '拾云',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn(
        'antialiased',
        fontMono.variable,
        'font-sans',
        geist.variable
      )}
    >
      {process.env.NODE_ENV === 'development' ? (
        <head>
          <script
            src="https://unpkg.com/react-grab@0.1.30/dist/index.global.js"
            crossOrigin="anonymous"
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `
window.addEventListener("react-grab:init", function (event) {
  event.detail && event.detail.setOptions && event.detail.setOptions({ activationMode: "hold" });
});
window.__REACT_GRAB__ && window.__REACT_GRAB__.setOptions && window.__REACT_GRAB__.setOptions({ activationMode: "hold" });
              `.trim(),
            }}
          />
        </head>
      ) : null}
      <body>
        <ClientOnlyGate>
          <AppHistoryRecorder />
          <ViewportSize />
          <GlobalLoadingProvider>
            <ThemeProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <AppToaster />
            </ThemeProvider>
          </GlobalLoadingProvider>
        </ClientOnlyGate>
      </body>
    </html>
  )
}
