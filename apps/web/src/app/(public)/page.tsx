import type { Metadata } from 'next'

import { FinalCTA } from '@/components/landing/FinalCTA'
import { HeroSection } from '@/components/landing/HeroSection'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LanguageBanner } from '@/components/landing/LanguageBanner'
import { LiveDemoStrip } from '@/components/landing/LiveDemoStrip'
import { SocialProof } from '@/components/landing/SocialProof'
import { TopNav } from '@/components/landing/TopNav'
import en from '@/i18n/en.json'
import { getTranslation } from '@/i18n/getTranslation'

function t(key: string, params?: Record<string, string>): string {
  return getTranslation(en, en, key, params)
}

export const metadata: Metadata = {
  title: t('landing.heroTitle'),
  description: t('landing.heroSubtitle'),
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <TopNav />
      <main className="flex-1">
        <HeroSection />
        <LiveDemoStrip />
        <HowItWorks />
        <SocialProof />
        <LanguageBanner />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  )
}
