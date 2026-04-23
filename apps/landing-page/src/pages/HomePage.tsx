import { HeroSection } from '@/components/HeroSection'
import { SocialProofSection } from '@/components/SocialProofSection'
import { VideoSection } from '@/components/VideoSection'
import { FeaturesSection } from '@/components/FeaturesSection'
import { HowItWorksSection } from '@/components/HowItWorksSection'
import { DownloadSection } from '@/components/DownloadSection'
import { MobileAppsSection } from '@/components/MobileAppsSection'

export function HomePage() {
  return (
    <>
      <HeroSection />
      <SocialProofSection />
      <VideoSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DownloadSection />
      <MobileAppsSection />
    </>
  )
}
