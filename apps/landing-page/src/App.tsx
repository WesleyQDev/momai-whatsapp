import { HashRouter, Routes, Route, Outlet } from "react-router";
import { BackgroundEffects } from "./components/BackgroundEffects";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { SaudeLayout } from "./components/SaudeLayout";
import { HomePage } from "./pages/HomePage";
import { BlogPage } from "./pages/BlogPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { ExtensionsPage } from "./pages/ExtensionsPage";
import { ContatoPage } from "./pages/ContatoPage";
import { ReportarErroPage } from "./pages/ReportarErroPage";
import { DoarPage } from "./pages/DoarPage";
import { SaudeHomePage } from "./pages/SaudeHomePage";
import { SaudeComoUsarPage } from "./pages/SaudeComoUsarPage";
import { SaudeContatoPage } from "./pages/SaudeContatoPage";
import { SaudeDoarPage } from "./pages/SaudeDoarPage";
import { SaudeReportarErroPage } from "./pages/SaudeReportarErroPage";

function Layout() {
  return (
    <div className="relative z-10 min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <BackgroundEffects />
      <Navbar />
      <Outlet />
      <Footer />
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/post/:postId" element={<BlogPage />} />
          <Route path="/extensoes" element={<ExtensionsPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/contato" element={<ContatoPage />} />
          <Route path="/reportar-erro" element={<ReportarErroPage />} />
          <Route path="/doar" element={<DoarPage />} />
        </Route>
        <Route element={<SaudeLayout />}>
          <Route path="/saude" element={<SaudeHomePage />} />
          <Route path="/saude/como-usar" element={<SaudeComoUsarPage />} />
          <Route path="/saude/contato" element={<SaudeContatoPage />} />
          <Route path="/saude/doar" element={<SaudeDoarPage />} />
          <Route
            path="/saude/reportar-erro"
            element={<SaudeReportarErroPage />}
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
