import { HashRouter, Routes, Route, Outlet } from 'react-router-dom'
import { BackgroundEffects } from './components/BackgroundEffects'
import { Navbar } from './components/Navbar'
import { UpdateBanner } from './components/UpdateBanner'
import { Footer } from './components/Footer'
import { HeroSection } from './components/HeroSection'
import { VideoSection } from './components/VideoSection'
import { FeaturesSection } from './components/FeaturesSection'
import { HowItWorksSection } from './components/HowItWorksSection'
import { DownloadSection } from './components/DownloadSection'
import { MobileAppsSection } from './components/MobileAppsSection'
import { BlogPage } from './pages/BlogPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { ContatoPage } from './pages/ContatoPage'
import { ReportarErroPage } from './pages/ReportarErroPage'
import { DoarPage } from './pages/DoarPage'

function Layout() {
  return (
    <div className="relative z-10 min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <BackgroundEffects />
      <UpdateBanner />
      <Navbar />
      <Outlet />
      <Footer />
    </div>
  )
}

function HomePage() {
  return (
    <>
      <HeroSection />
      <VideoSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DownloadSection />
      <MobileAppsSection />
    </>
  )
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/contato" element={<ContatoPage />} />
          <Route path="/reportar-erro" element={<ReportarErroPage />} />
          <Route path="/doar" element={<DoarPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
