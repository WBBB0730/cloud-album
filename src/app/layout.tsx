import { Geist, Geist_Mono } from 'next/font/google'
import type { Metadata, Viewport } from 'next'

import '@/styles/global.css'
import { ClientOnlyGate } from '@/components/app/client-only-gate'
import { GlobalLoadingProvider } from '@/components/app/global-loading'
import { ViewportSize } from '@/components/app/viewport-size'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Cloud Album',
  description: '私有家庭云相册',
  applicationName: 'Cloud Album',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Cloud Album',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
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
          <ViewportSize />
          <GlobalLoadingProvider>
            <ThemeProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster richColors position="top-center" />
            </ThemeProvider>
          </GlobalLoadingProvider>
        </ClientOnlyGate>
      </body>
    </html>
  )
}
