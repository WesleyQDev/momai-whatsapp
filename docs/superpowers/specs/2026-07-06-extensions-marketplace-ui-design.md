# Spec: Extensions Marketplace UI Redesign (Microsoft Store Style - Iteration 2)

Redesign the extensions marketplace in MomAI to look like a professional, desktop-native marketplace inspired by the Microsoft Store, adding a dedicated "Library" view for managing installed extensions and a structured 3-column layout for extension details.

## 1. Objectives

- **Professional Aesthetics**: High contrast, readable typography, and clean layouts. Raise brightness/contrast so elements are easy to distinguish.
- **3-Column Detail Layout**: 
  - Left column (25%): Version History timeline.
  - Middle column (50%): "Sobre" / Description markdown and System requirements.
  - Right column (25%): Specifications ("Informações") and Permissions.
- **Glow-Active Status**: Genuinely active extensions have a glowing green dot indicator and high-contrast, clean badges.
- **Modern Tag Pills**: Flat modern tags with clean margins and borders.
- **Reduced Icon Clutter**: Remove standard/generic AI icon accents from headers and lists. Let clean typography define the sections.

---

## 2. Visual Design

### 2.1 Color Palette & Contrast
- **Backgrounds**: High-contrast dark theme. Use `bg-[#121214]` for main screen and `bg-[#1a1a1e]/80` for cards.
- **Borders**: Highly visible, crisp borders using `border-zinc-800/80` and hover states highlighting with `border-zinc-700`.
- **Text**: Primary content in `text-zinc-100`, secondary in `text-zinc-300`, and helper labels in `text-zinc-400` (avoiding overly dark `text-zinc-550` or `text-zinc-600` for content).
- **Glow Status Indicator**: Genuinely active extensions display a pulsating green dot:
  - `<div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />`

### 2.2 Navigation Top Bar
- **Tab Removal**: Keep old tabs removed.
- **Right Command Section**:
  - Search bar: Thin rounded border, search query.
  - Mode toggle: Switch pill for `DEV` and `TESTAR LOJA`.
  - **Library Toggle**: A folder/collection icon button toggles the screen state between the Catalog Grid (Loja) and the Library Table (Biblioteca).

---

## 3. Screen Specs

### 3.1 Screen 1: Catalog View (Store)
- **Grid Layout**: Clean 3-column grid of extensions.
  - **Cards**: Flat design with transition-all (`hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:border-zinc-700/60`).
  - **Active State**: Pulsating green dot inside a clean badge.

### 3.2 Screen 2: Library View (Biblioteca)
- **Title**: "Biblioteca" header.
- **Table Columns**:
  - **Nome**: Small rounded icon + bold title.
  - **Versão**: Installed version string.
  - **Status**: Pulsating green dot next to "Ativa", gray dot next to "Inativa".
  - **Ações**: Toggle switch (Ativar/Desativar) and a trash icon button (Desinstalar).

### 3.3 Screen 3: Detail View
- **Hero Header**:
  - Left-aligned icon: Larger size (`w-24 h-24`), rounded corners, subtle shadow.
  - Right content: Extension title, developer name, star rating, action buttons (`Ativar/Desativar`, `Atualizar` if update available, `Desinstalar`).
- **3-Column Grid Layout (25/50/25 split)**:
  - **Left Column (25% - Version History)**:
    - A vertical timeline layout where version nodes are connected by a vertical line, showing date, version badge, and changelog text.
  - **Middle Column (50% - About & Requirements)**:
    - **Sobre**: Well-styled typography for the description/readme markdown.
    - **Requisitos**: Card with CPU/OS and internet requirements.
  - **Right Column (25% - Sidebar)**:
    - **Informações**: Table listing Developer, Category, Risk level.
    - **Permissões**: Clean list of required permission strings with simple bullet dots (no generic icons).

---

## 4. Verification Plan

- **Layout Integrity**: Verify that the 3-column details page renders correctly on wide screens and wraps gracefully on narrow viewports.
- **Contrast Check**: Visually verify text readability across all panels in both Store Catalog and Library views.
