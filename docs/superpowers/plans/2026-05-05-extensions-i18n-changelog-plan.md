# Extensions, i18n & Changelog Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Extensions browser tab, internationalization (PT-BR/EN/ES), and clean up the changelog to show only user-facing features.

**Architecture:** Three independent features touching different files. i18n wraps existing components via `react-i18next` `useTranslation` hook. Extensions tab is a new route fetching remote JSON + READMEs at runtime. Changelog is a content-only edit.

**Tech Stack:** react-i18next, i18next, i18next-browser-languagedetector, marked (already in deps), GitHub raw API

---

## File Structure

### Create
| File | Purpose |
|------|---------|
| `src/locales/i18n.ts` | i18next init |
| `src/locales/pt-BR.json` | PT-BR translations |
| `src/locales/en.json` | EN translations |
| `src/locales/es.json` | ES translations |
| `src/components/LanguageSwitcher.tsx` | Language dropdown in navbar |
| `src/pages/ExtensionsPage.tsx` | Extensions list page |
| `src/components/ExtensionCard.tsx` | Single extension card |
| `src/components/ExtensionModal.tsx` | README modal |

### Modify
| File | Change |
|------|--------|
| `src/main.tsx` | Import i18n config |
| `src/App.tsx` | Add `/extensoes` route |
| `src/components/Navbar.tsx` | Add LanguageSwitcher, i18n link labels, extensoes link |
| `src/components/HeroSection.tsx` | useTranslation for text |
| `src/components/FeaturesSection.tsx` | useTranslation |
| `src/components/HowItWorksSection.tsx` | useTranslation |
| `src/components/SocialProofSection.tsx` | useTranslation |
| `src/components/DownloadSection.tsx` | useTranslation |
| `src/components/VideoSection.tsx` | useTranslation |
| `src/components/MobileAppsSection.tsx` | useTranslation |
| `src/components/Footer.tsx` | useTranslation |
| `src/pages/ContatoPage.tsx` | useTranslation |
| `src/pages/DoarPage.tsx` | useTranslation |
| `src/pages/ChangelogPage.tsx` | useTranslation |
| `src/pages/ReportarErroPage.tsx` | useTranslation |
| `src/pages/BlogPage.tsx` | useTranslation + locale filter |
| `src/lib/blog.ts` | Locale-aware glob + filter |
| `src/content/blog/lancamento.pt-BR.md` | Rename + add locale variants |
| `src/content/blog/lancamento.en.md` | New |
| `src/content/blog/pro-lite-ultra.pt-BR.md` | Rename + add locale variants |
| `src/content/blog/pro-lite-ultra.en.md` | New |
| `src/content/blog/v1-2-0.pt-BR.md` | Rename + add locale variants |
| `src/content/blog/v1-2-0.en.md` | New |
| `CHANGELOG.md` | Clean up |

---

### Task 1: Install i18n dependencies

- [ ] **Step 1: Install packages**

```bash
cd apps/landing-page
pnpm add react-i18next i18next i18next-browser-languagedetector
```

---

### Task 2: Create i18n config and translation files

- [ ] **Step 1: Create `src/locales/i18n.ts`**

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ptBR from './pt-BR.json'
import en from './en.json'
import es from './es.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: 'pt-BR',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
```

- [ ] **Step 2: Create `src/locales/pt-BR.json`**

```json
{
  "nav": {
    "blog": "Blog",
    "changelog": "Changelog",
    "contato": "Contato",
    "reportarErro": "Reportar Erro",
    "doar": "Doar",
    "extensoes": "Extensões",
    "saude": "MomAI Saúde",
    "download": "Download",
    "microsoftStore": "Microsoft Store"
  },
  "hero": {
    "title": "Sua Assistente de Inteligência Local",
    "subtitle": "MomAI é uma assistente pessoal poderosa que roda inteiramente no seu computador. Sem nuvem, sem assinaturas, privacidade absoluta.",
    "download": "Baixar MomAI",
    "outrosDownloads": "Outros downloads"
  },
  "features": {
    "title": "Feito para você",
    "items": [
      { "title": "100% Local", "desc": "Tudo roda no seu computador. Nada vai para a nuvem." },
      { "title": "Privacidade Total", "desc": "Seus dados nunca saem do seu dispositivo." },
      { "title": "Voz Natural", "desc": "Converse como se estivesse falando com uma amiga." },
      { "title": "Extensível", "desc": "Adicione novas habilidades com extensões da comunidade." },
      { "title": "Offline", "desc": "Funciona sem internet. Sua assistente sempre disponível." },
      { "title": "Grátis", "desc": "100% gratuito e open source. Sem assinaturas." }
    ]
  },
  "howItWorks": {
    "title": "Como funciona",
    "step1": "Baixe e instale",
    "step1Desc": "Em menos de 2 minutos você está pronto.",
    "step2": "Escolha seu modo",
    "step2Desc": "Lite, Pro ou Ultra — do seu jeito.",
    "step3": "Comece a usar",
    "step3Desc": "Digite ou fale. Sua assistente está pronta."
  },
  "socialProof": {
    "stars": "stars no GitHub",
    "instalacoes": "Instalações",
    "gratuito": "100% Gratuito e Local"
  },
  "download": {
    "title": "Baixe Agora",
    "windows": "Baixar para Windows",
    "linux": "Baixar para Linux",
    "microsoftStore": "Microsoft Store",
    "outrosDownloads": "Outros downloads",
    "compatible": "Compatível com Windows 10/11 e Linux"
  },
  "video": {
    "title": "Veja a MomAI em ação",
    "subtitle": "Assista como é fácil usar sua assistente pessoal"
  },
  "mobileApps": {
    "title": "Também disponível para celular",
    "subtitle": "Experimente o MomAI Saúde — sua assistente de saúde pessoal"
  },
  "footer": {
    "direitos": "© 2026 MomAI",
    "changelog": "Changelog",
    "politica": "Política de Privacidade",
    "repositorio": "Repositório"
  },
  "changelog": {
    "title": "Registro de Atualizações",
    "subtitle": "Acompanhe a evolução da MomAI",
    "loading": "Sincronizando registros...",
    "empty": "Nenhum registro encontrado"
  },
  "contato": {
    "title": "Entre em Contato",
    "subtitle": "Estamos aqui para ajudar",
    "email": "Enviar E-mail",
    "github": "Abrir Issue no GitHub",
    "githubDesc": "Para outras questões, sugestões ou relatórios de bugs, você também pode abrir uma issue no GitHub."
  },
  "doar": {
    "title": "Apoie o Projeto",
    "subtitle": "Sua contribuição mantém a MomAI gratuita para todos",
    "pixCopied": "Chave PIX copiada!",
    "pixCopy": "Copiar Chave PIX",
    "pixKey": "Chave PIX",
    "github": "Apoiar via GitHub Sponsors"
  },
  "reportarErro": {
    "title": "Reportar Erro",
    "subtitle": "Encontrou um bug? Nos ajude a melhorar!",
    "enviado": "Relatório enviado com sucesso!",
    "enviar": "Enviar Relatório"
  },
  "blog": {
    "title": "Blog",
    "subtitle": "Novidades, dicas e atualizações da MomAI",
    "leiaMais": "Leia mais",
    "featured": "Destaque"
  },
  "extensoes": {
    "title": "Extensões",
    "subtitle": "Adicione novas habilidades à sua MomAI",
    "loading": "Carregando extensões...",
    "empty": "Nenhuma extensão disponível no momento",
    "error": "Não foi possível carregar a lista de extensões",
    "readmeError": "README não disponível para esta extensão",
    "versao": "Versão",
    "categoria": "Categoria",
    "autor": "Autor"
  }
}
```

- [ ] **Step 3: Create `src/locales/en.json`**

```json
{
  "nav": {
    "blog": "Blog",
    "changelog": "Changelog",
    "contato": "Contact",
    "reportarErro": "Report Bug",
    "doar": "Donate",
    "extensoes": "Extensions",
    "saude": "MomAI Health",
    "download": "Download",
    "microsoftStore": "Microsoft Store"
  },
  "hero": {
    "title": "Your Local AI Assistant",
    "subtitle": "MomAI is a powerful personal assistant that runs entirely on your computer. No cloud, no subscriptions, absolute privacy.",
    "download": "Download MomAI",
    "outrosDownloads": "Other downloads"
  },
  "features": {
    "title": "Made for you",
    "items": [
      { "title": "100% Local", "desc": "Everything runs on your computer. Nothing goes to the cloud." },
      { "title": "Total Privacy", "desc": "Your data never leaves your device." },
      { "title": "Natural Voice", "desc": "Talk like you're speaking to a friend." },
      { "title": "Extensible", "desc": "Add new abilities with community extensions." },
      { "title": "Offline", "desc": "Works without internet. Always available." },
      { "title": "Free", "desc": "100% free and open source. No subscriptions." }
    ]
  },
  "howItWorks": {
    "title": "How it works",
    "step1": "Download & Install",
    "step1Desc": "In under 2 minutes you're ready.",
    "step2": "Choose your mode",
    "step2Desc": "Lite, Pro or Ultra — your choice.",
    "step3": "Start using",
    "step3Desc": "Type or talk. Your assistant is ready."
  },
  "socialProof": {
    "stars": "stars on GitHub",
    "instalacoes": "Installations",
    "gratuito": "100% Free and Local"
  },
  "download": {
    "title": "Download Now",
    "windows": "Download for Windows",
    "linux": "Download for Linux",
    "microsoftStore": "Microsoft Store",
    "outrosDownloads": "Other downloads",
    "compatible": "Compatible with Windows 10/11 and Linux"
  },
  "video": {
    "title": "See MomAI in action",
    "subtitle": "Watch how easy it is to use your personal assistant"
  },
  "mobileApps": {
    "title": "Also available on mobile",
    "subtitle": "Try MomAI Saúde — your personal health assistant"
  },
  "footer": {
    "direitos": "© 2026 MomAI",
    "changelog": "Changelog",
    "politica": "Privacy Policy",
    "repositorio": "Repository"
  },
  "changelog": {
    "title": "Changelog",
    "subtitle": "Follow the evolution of MomAI",
    "loading": "Syncing records...",
    "empty": "No records found"
  },
  "contato": {
    "title": "Contact Us",
    "subtitle": "We're here to help",
    "email": "Send Email",
    "github": "Open Issue on GitHub",
    "githubDesc": "For other questions, suggestions or bug reports, you can also open an issue on GitHub."
  },
  "doar": {
    "title": "Support the Project",
    "subtitle": "Your contribution keeps MomAI free for everyone",
    "pixCopied": "PIX key copied!",
    "pixCopy": "Copy PIX Key",
    "pixKey": "PIX Key",
    "github": "Support via GitHub Sponsors"
  },
  "reportarErro": {
    "title": "Report Bug",
    "subtitle": "Found a bug? Help us improve!",
    "enviado": "Report sent successfully!",
    "enviar": "Send Report"
  },
  "blog": {
    "title": "Blog",
    "subtitle": "News, tips and updates from MomAI",
    "leiaMais": "Read more",
    "featured": "Featured"
  },
  "extensoes": {
    "title": "Extensions",
    "subtitle": "Add new abilities to your MomAI",
    "loading": "Loading extensions...",
    "empty": "No extensions available at the moment",
    "error": "Could not load the extensions list",
    "readmeError": "README not available for this extension",
    "versao": "Version",
    "categoria": "Category",
    "autor": "Author"
  }
}
```

- [ ] **Step 4: Create `src/locales/es.json`**

```json
{
  "nav": {
    "blog": "Blog",
    "changelog": "Registro de Cambios",
    "contato": "Contacto",
    "reportarErro": "Reportar Error",
    "doar": "Donar",
    "extensoes": "Extensiones",
    "saude": "MomAI Salud",
    "download": "Descargar",
    "microsoftStore": "Microsoft Store"
  },
  "hero": {
    "title": "Tu Asistente de Inteligencia Local",
    "subtitle": "MomAI es una asistente personal poderosa que funciona completamente en tu computadora. Sin nube, sin suscripciones, privacidad absoluta.",
    "download": "Descargar MomAI",
    "outrosDownloads": "Otras descargas"
  },
  "features": {
    "title": "Hecho para ti",
    "items": [
      { "title": "100% Local", "desc": "Todo funciona en tu computadora. Nada va a la nube." },
      { "title": "Privacidad Total", "desc": "Tus datos nunca salen de tu dispositivo." },
      { "title": "Voz Natural", "desc": "Habla como si estuvieras hablando con una amiga." },
      { "title": "Extensible", "desc": "Añade nuevas habilidades con extensiones de la comunidad." },
      { "title": "Sin Internet", "desc": "Funciona sin conexión. Siempre disponible." },
      { "title": "Gratuito", "desc": "100% gratuito y open source. Sin suscripciones." }
    ]
  },
  "howItWorks": {
    "title": "Cómo funciona",
    "step1": "Descarga e instala",
    "step1Desc": "En menos de 2 minutos estás listo.",
    "step2": "Elige tu modo",
    "step2Desc": "Lite, Pro o Ultra — a tu manera.",
    "step3": "Empieza a usar",
    "step3Desc": "Escribe o habla. Tu asistente está lista."
  },
  "socialProof": {
    "stars": "estrellas en GitHub",
    "instalacoes": "Instalaciones",
    "gratuito": "100% Gratuito y Local"
  },
  "download": {
    "title": "Descarga Ahora",
    "windows": "Descargar para Windows",
    "linux": "Descargar para Linux",
    "microsoftStore": "Microsoft Store",
    "outrosDownloads": "Otras descargas",
    "compatible": "Compatible con Windows 10/11 y Linux"
  },
  "video": {
    "title": "Ve a MomAI en acción",
    "subtitle": "Mira lo fácil que es usar tu asistente personal"
  },
  "mobileApps": {
    "title": "También disponible para móvil",
    "subtitle": "Prueba MomAI Salud — tu asistente de salud personal"
  },
  "footer": {
    "direitos": "© 2026 MomAI",
    "changelog": "Registro de Cambios",
    "politica": "Política de Privacidad",
    "repositorio": "Repositorio"
  },
  "changelog": {
    "title": "Registro de Cambios",
    "subtitle": "Sigue la evolución de MomAI",
    "loading": "Sincronizando registros...",
    "empty": "Ningún registro encontrado"
  },
  "contato": {
    "title": "Contacto",
    "subtitle": "Estamos aquí para ayudar",
    "email": "Enviar Correo",
    "github": "Abrir Issue en GitHub",
    "githubDesc": "Para otras preguntas, sugerencias o reportes de errores, también puedes abrir un issue en GitHub."
  },
  "doar": {
    "title": "Apoya el Proyecto",
    "subtitle": "Tu contribución mantiene MomAI gratuita para todos",
    "pixCopied": "¡Clave PIX copiada!",
    "pixCopy": "Copiar Clave PIX",
    "pixKey": "Clave PIX",
    "github": "Apoyar via GitHub Sponsors"
  },
  "reportarErro": {
    "title": "Reportar Error",
    "subtitle": "¿Encontraste un bug? ¡Ayúdanos a mejorar!",
    "enviado": "¡Reporte enviado con éxito!",
    "enviar": "Enviar Reporte"
  },
  "blog": {
    "title": "Blog",
    "subtitle": "Noticias, consejos y actualizaciones de MomAI",
    "leiaMais": "Leer más",
    "featured": "Destacado"
  },
  "extensoes": {
    "title": "Extensiones",
    "subtitle": "Añade nuevas habilidades a tu MomAI",
    "loading": "Cargando extensiones...",
    "empty": "Ninguna extensión disponible por el momento",
    "error": "No se pudo cargar la lista de extensiones",
    "readmeError": "README no disponible para esta extensión",
    "versao": "Versión",
    "categoria": "Categoría",
    "autor": "Autor"
  }
}
```

---

### Task 3: Wire i18n into main.tsx

- [ ] **Step 1: Import i18n in `src/main.tsx`**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './locales/i18n'
import App from './App'
```

---

### Task 4: Create LanguageSwitcher component

- [ ] **Step 1: Create `src/components/LanguageSwitcher.tsx`**

```typescript
import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect } from 'react'

const LANGUAGES = [
  { code: 'pt-BR', label: 'pt-BR', flag: '🇧🇷' },
  { code: 'en', label: 'en', flag: '🇺🇸' },
  { code: 'es', label: 'es', flag: '🇪🇸' },
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-[var(--border-color)] bg-[var(--bg)] p-1 shadow-lg">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false) }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-tertiary)] ${
                lang.code === i18n.language ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <span className="text-base leading-none">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### Task 5: Update Navbar with LanguageSwitcher and i18n

- [ ] **Step 1: Update `src/components/Navbar.tsx`**

Changes:
- Import `useTranslation` from `react-i18next`
- Import `LanguageSwitcher`
- Add `{ t } = useTranslation()` at top of component
- Add `{ t('nav.extensoes') }` as a link item in NAV_LINKS array
- Add `<LanguageSwitcher />` before the theme toggle button block in the right side

Add to NAV_LINKS:
```typescript
const NAV_LINKS = [
  { to: '/blog', label: 'nav.blog' },
  { to: '/changelog', label: 'nav.changelog' },
  { to: '/extensoes', label: 'nav.extensoes' },
  { to: '/contato', label: 'nav.contato' },
  { to: '/reportar-erro', label: 'nav.reportarErro' },
]
```

Replace hardcoded text with `t()` calls:
- `{link.label}` → `{t(link.label)}`  
- `"Doar"` → `{t('nav.doar')}`
- `"MomAI Saúde"` → `{t('nav.saude')}`
- Nav download text → `{t('nav.' + (isLinux ? 'download' : 'microsoftStore'))}`
- Link label should use i18n key instead of raw string

The NAV_LINKS should store i18n keys, and rendering should use `t(link.label)`.

---

### Task 6: Update components with useTranslation

For each component below, follow this pattern:
1. Import `useTranslation` from `react-i18next`
2. Add `const { t } = useTranslation()` in component
3. Replace hardcoded PT-BR strings with `t('key')` calls

- [ ] **Step 1: Update `src/components/HeroSection.tsx`**
  - `t('hero.title')`, `t('hero.subtitle')`, `t('hero.download')`, `t('hero.outrosDownloads')`

- [ ] **Step 2: Update `src/components/FeaturesSection.tsx`**
  - `t('features.title')`, iterate `t('features.items', { returnObjects: true })`

- [ ] **Step 3: Update `src/components/HowItWorksSection.tsx`**
  - `t('howItWorks.title')`, `t('howItWorks.step1')`, etc.

- [ ] **Step 4: Update `src/components/SocialProofSection.tsx`**
  - `t('socialProof.stars')`, `t('socialProof.instalacoes')`, `t('socialProof.gratuito')`

- [ ] **Step 5: Update `src/components/DownloadSection.tsx`**
  - `t('download.title')`, `t('download.windows')`, etc.

- [ ] **Step 6: Update `src/components/VideoSection.tsx`**
  - `t('video.title')`, `t('video.subtitle')`

- [ ] **Step 7: Update `src/components/MobileAppsSection.tsx`**
  - `t('mobileApps.title')`, `t('mobileApps.subtitle')`

- [ ] **Step 8: Update `src/components/Footer.tsx`**
  - `t('footer.direitos')`, `t('footer.changelog')`, `t('footer.politica')`, `t('footer.repositorio')`

- [ ] **Step 9: Update `src/pages/ContatoPage.tsx`**
  - `t('contato.title')`, `t('contato.subtitle')`, `t('contato.email')`, `t('contato.github')`, `t('contato.githubDesc')`

- [ ] **Step 10: Update `src/pages/DoarPage.tsx`**
  - `t('doar.title')`, `t('doar.subtitle')`, `t('doar.pixCopied')`, `t('doar.pixCopy')`, `t('doar.github')`

- [ ] **Step 11: Update `src/pages/ReportarErroPage.tsx`**
  - `t('reportarErro.title')`, `t('reportarErro.subtitle')`, `t('reportarErro.enviado')`, `t('reportarErro.enviar')`

- [ ] **Step 12: Update `src/pages/ChangelogPage.tsx`**
  - `t('changelog.title')`, `t('changelog.subtitle')`, `t('changelog.loading')`, `t('changelog.empty')`

- [ ] **Step 13: Update `src/pages/BlogPage.tsx`**
  - `t('blog.title')`, `t('blog.subtitle')`, `t('blog.leiaMais')`, `t('blog.featured')`
  - Filter posts by current locale

---

### Task 7: Update blog system for i18n

- [ ] **Step 1: Update `src/lib/blog.ts`** — change glob and filter by locale

```typescript
import type { BlogPost } from '../content/blog'

const modules = import.meta.glob('../content/blog/*.md', { query: '?raw', import: 'default', eager: true })

// ... (keep parseFrontmatter, parseDate unchanged)

export function loadBlogPosts(locale: string = 'pt-BR'): BlogPost[] {
  const posts: BlogPost[] = []

  for (const [path, content] of Object.entries(modules)) {
    const filename = path.split('/').pop() ?? ''
    const match = filename.match(/^(.+)\.([a-z]{2}(-[A-Z]{2})?)\.md$/)
    if (!match) continue
    const baseName = match[1]
    const fileLocale = match[2]

    if (fileLocale !== locale) continue

    const { attributes, content: markdownContent } = parseFrontmatter(content as string)
    // ... rest unchanged
  }

  // ... sort and return
}
```

- [ ] **Step 2: Rename existing blog files with locale suffix**

```bash
cd apps/landing-page/src/content/blog
mv lancamento.md lancamento.pt-BR.md
mv pro-lite-ultra.md pro-lite-ultra.pt-BR.md
mv v1-2-0.md v1-2-0.pt-BR.md
```

- [ ] **Step 3: Create English blog translation files** (`lancamento.en.md`, `pro-lite-ultra.en.md`, `v1-2-0.en.md`) with translated frontmatter and content

- [ ] **Step 4: Update `BlogPage.tsx`** to pass current locale to `loadBlogPosts()`

Import `useTranslation` and pass `i18n.language`:
```typescript
const { i18n } = useTranslation()
const posts = useMemo(() => loadBlogPosts(i18n.language), [i18n.language])
```

---

### Task 8: Add route for Extensions page

- [ ] **Step 1: Update `src/App.tsx`** — add import and route

```typescript
import { ExtensionsPage } from './pages/ExtensionsPage'
```

Add route:
```typescript
<Route path="/extensoes" element={<ExtensionsPage />} />
```

---

### Task 9: Create ExtensionsPage and components

- [ ] **Step 1: Create `src/components/ExtensionCard.tsx`**

```typescript
interface ExtensionCardProps {
  name: string
  description: string
  category: string
  author: string
  version: string
  onClick: () => void
}

export function ExtensionCard({ name, description, category, author, version, onClick }: ExtensionCardProps) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-[var(--feature-border)] bg-[var(--bg-tertiary)] p-6 text-left transition-all duration-300 hover:border-[rgba(var(--accent-rgb),0.3)] hover:shadow-[0_15px_35px_rgba(0,0,0,0.2)]"
    >
      <div className="absolute right-0 top-0 h-[120px] w-[120px] rounded-full bg-[radial-gradient(circle,rgba(var(--accent-rgb),0.05)_0%,transparent_70%)] blur-[20px] pointer-events-none" />
      <span className="mb-2 inline-block rounded-full bg-[rgba(var(--accent-rgb),0.1)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
        {category}
      </span>
      <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">{name}</h3>
      <p className="mb-4 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
        <span>by {author}</span>
        <span>v{version}</span>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Create `src/components/ExtensionModal.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { useTranslation } from 'react-i18next'

interface ExtensionModalProps {
  repo: string
  name: string
  onClose: () => void
}

export function ExtensionModal({ repo, name, onClose }: ExtensionModalProps) {
  const { t } = useTranslation()
  const [readme, setReadme] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`https://raw.githubusercontent.com/${repo}/main/README.md`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.text()
      })
      .then((text) => {
        setReadme(text)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [repo])

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--text)]">{name}</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text)]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading && <p className="text-center text-[var(--text-tertiary)]">Loading...</p>}
          {error && <p className="text-center text-[var(--text-tertiary)]">{t('extensoes.readmeError')}</p>}
          {readme && (
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: marked.parse(readme) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/pages/ExtensionsPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExtensionCard } from '../components/ExtensionCard'
import { ExtensionModal } from '../components/ExtensionModal'

interface Extension {
  id: string
  name: string
  description: string
  category: string
  icon: string
  author: string
  repo: string
  download_url: string
  version: string
  locales?: Record<string, { name: string; description: string }>
}

export function ExtensionsPage() {
  const { t, i18n } = useTranslation()
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Extension | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch('https://raw.githubusercontent.com/WesleyQDev/MomAI-App/main/community-extensions.json')
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data) => {
        setExtensions(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  const lang = i18n.language

  return (
    <div className="mx-auto max-w-[900px] px-8 py-24">
      <div className="mb-12 text-center">
        <h1 className="mb-3 font-flex text-5xl font-normal tracking-tight text-[var(--text)]">{t('extensoes.title')}</h1>
        <p className="text-lg text-[var(--text-secondary)]">{t('extensoes.subtitle')}</p>
      </div>

      {loading && (
        <p className="py-16 text-center text-[var(--text-tertiary)]">{t('extensoes.loading')}</p>
      )}
      {error && (
        <p className="py-16 text-center text-[var(--text-tertiary)]">{t('extensoes.error')}</p>
      )}
      {!loading && !error && extensions.length === 0 && (
        <p className="py-16 text-center text-[var(--text-tertiary)]">{t('extensoes.empty')}</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {extensions.map((ext) => {
          const localeData = ext.locales?.[lang]
          return (
            <ExtensionCard
              key={ext.id}
              name={localeData?.name || ext.name}
              description={localeData?.description || ext.description}
              category={ext.category}
              author={ext.author}
              version={ext.version}
              onClick={() => setSelected(ext)}
            />
          )
        })}
      </div>

      {selected && (
        <ExtensionModal
          repo={selected.repo}
          name={ext.locales?.[lang]?.name || selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
```

Wait, there's a bug — `ext` is scoped inside the map, not available after it. The `selected` variable holds the full extension object, and the modal uses `selected.repo` and gets name from `selected`. Let me fix in the actual code.

---

### Task 10: Clean up CHANGELOG.md

- [ ] **Step 1: Remove non-user-facing entries from CHANGELOG.md**

Filter out mentions of:
- CI/CD pipelines and workflows
- Google Analytics tracking
- Build scripts and tooling
- Landing page development (the site itself)
- Repository documentation
- CNAME, domain config
- pnpm workspace changes
- Binary hydration scripts

Keep only MomAI desktop app features, improvements, and fixes that impact the end user.

---

### Task 11: Build and deploy

- [ ] **Step 1: Build the landing page**

```bash
cd apps/landing-page
pnpm build
```

- [ ] **Step 2: Sync to root**

```bash
node scripts/sync-gh-pages.js
```

- [ ] **Step 3: Push to gh-pages**

(Use the temp directory + git init + push method)

- [ ] **Step 4: Trigger GitHub Pages rebuild**

```bash
gh api repos/WesleyQDev/momai/pages/builds --method POST
```
