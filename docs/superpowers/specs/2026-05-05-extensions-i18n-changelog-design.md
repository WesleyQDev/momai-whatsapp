# Landing Page: Extensions Tab, i18n & Changelog Cleanup

## Overview

Add three features to the MomAI landing page React SPA: an Extensions browser tab, internationalization (PT-BR/EN/ES), and a cleaned-up changelog focused on user-facing features only.

---

## 1. Extensions Tab (`/#/extensoes`)

### Route
- `HashRouter` route `/extensoes` → `ExtensionsPage`
- Navbar link "Extensões" / "Extensions" / "Extensiones" (i18n) between Changelog and Contato

### Data Flow
1. Page mounts → `fetch` from `https://raw.githubusercontent.com/WesleyQDev/MomAI-App/main/community-extensions.json`
2. Parse JSON array → render card grid
3. User clicks card → show modal
4. Modal fetches `README.md` from `https://raw.githubusercontent.com/{repo}/main/README.md`
5. Render markdown with `marked` library (already in dependencies)

### Components
| Component | Responsibility |
|-----------|---------------|
| `src/pages/ExtensionsPage.tsx` | Fetches JSON, renders grid, manages selected extension state |
| `src/components/ExtensionCard.tsx` | Single card: name, description, category badge, author, version |
| `src/components/ExtensionModal.tsx` | Modal overlay with markdown-rendered README, close button |

### Locale-aware Display
- `community-extensions.json` has `locales.pt-BR`, `locales.en`, etc. per extension
- Use current language to pick translated `name` and `description`
- Fallback to root-level `name`/`description` if locale not found

### Error Handling
- JSON fetch fails → "Não foi possível carregar a lista de extensões"
- README fetch fails → "README não disponível para esta extensão"

---

## 2. Internationalization (PT-BR / EN / ES)

### Language Selector
- Positioned in Navbar, right next to the dark/light theme toggle
- Shows current language flag + code (e.g., 🇧🇷 pt-BR)
- Click opens dropdown with other flags and codes (🇺🇸 en, 🇪🇸 es)
- Selection saved to `localStorage`, fallback to `navigator.language`

### Library
- `react-i18next` + `i18next`
- JSON translation files at `src/locales/{pt-BR,en,es}.json`

### i18n Structure
```
src/locales/
  i18n.ts              # i18next init with backend, detector
  pt-BR.json           # Portuguese translations
  en.json              # English translations
  es.json              # Spanish translations
```

### What Gets Translated
- **Navbar**: all links, download button, logo alt text
- **Homepage**: HeroSection, FeaturesSection, HowItWorksSection, SocialProofSection, DownloadSection, VideoSection, MobileAppsSection, Footer
- **Pages**: ContatoPage, DoarPage, ChangelogPage, ReportarErroPage, ExtensionsPage
- **Blog**: BlogPage hero text, metadata labels (not post content - each post variant handles its own locale)

### Blog i18n
- File naming convention: `lancamento.pt-BR.md`, `lancamento.en.md`, `lancamento.es.md`
- BlogPage filters by current language
- `import.meta.glob` updated to match `*.@(pt-BR|en|es).md`
- Parsed frontmatter includes `lang` field for filtering

### Extension i18n
- Extensions from `community-extensions.json` use the `locales` map per extension
- Card name/description rendered in current language, fallback to root fields

---

## 3. Changelog Cleanup

### Principle
- Keep only entries that describe user-facing changes to the MomAI desktop application
- Remove entries about: CI/CD pipelines, build tooling, GitHub Actions, Google Analytics, repo documentation, website/landing page itself

### Removed per Version (summary)
- v1.3.0: remove CI/CD, repo docs, landing page commits
- v1.0.8: remove Google Play compliance pages, CI/CD, build scripts
- v0.9.1: remove pnpm workspace migration (relevance only to devs)
- v0.8.2/v0.8.1/v0.8.0: focus on desktop features, remove landing page commits
- v0.5.0: remove analytics, CNAME
- Older versions: audit and strip infra-only entries

### Format
- Each version: `## X.X.X - YYYY-MM-DD` + one-line title + sections (✨, ⚙️, 🐛)
- At most 3 sections per version: Novas Funcionalidades, Melhorias, Correções
- Each item is one line: `- **Title:** Description`

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/ExtensionsPage.tsx` | Extensions listing page |
| `src/components/ExtensionCard.tsx` | Extension card component |
| `src/components/ExtensionModal.tsx` | README modal |
| `src/locales/i18n.ts` | i18next configuration |
| `src/locales/pt-BR.json` | Portuguese translations |
| `src/locales/en.json` | English translations |
| `src/locales/es.json` | Spanish translations |
| `src/components/LanguageSwitcher.tsx` | Language dropdown in navbar |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/extensoes` route |
| `src/components/Navbar.tsx` | Add Extensões link + LanguageSwitcher |
| `src/lib/blog.ts` | Update glob pattern, filter by locale |
| `src/content/blog/*.md` | Rename with locale suffix, add translations |
| `CHANGELOG.md` | Clean up non-user-facing entries |

## Non-Goals
- No server-side rendering
- No real-time updates for extensions list (fetch on page load)
- Extension READMEs are NOT translated client-side (each repo provides its own)
