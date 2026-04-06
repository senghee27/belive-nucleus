import type { Metadata } from "next"
import { DM_Sans, JetBrains_Mono } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "BeLive Nucleus",
  description: "CEO Command Center",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Nucleus" />
        <link rel="apple-touch-icon" href="/icons/nucleus-192.png" />
        <meta name="theme-color" content="#080E1C" />
      </head>
      <body className="min-h-full bg-[#080E1C] text-[#E8EEF8] font-[family-name:var(--font-dm-sans)]">
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: '#0D1525',
              border: '1px solid #1A2035',
              color: '#E8EEF8',
            },
          }}
        />
      </body>
    </html>
  )
}
