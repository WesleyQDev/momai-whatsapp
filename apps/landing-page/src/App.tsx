import { HashRouter, Routes, Route, Outlet } from 'react-router-dom'
import { BackgroundEffects } from './components/BackgroundEffects'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { HomePage } from './pages/HomePage'
import { BlogPage } from './pages/BlogPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { ContatoPage } from './pages/ContatoPage'
import { ReportarErroPage } from './pages/ReportarErroPage'
import { DoarPage } from './pages/DoarPage'

function Layout() {
  return (
    <div className="relative z-10 min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <BackgroundEffects />
      <Navbar />
      <Outlet />
      <Footer />
    </div>
  )
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/post/:postId" element={<BlogPage />} />
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
