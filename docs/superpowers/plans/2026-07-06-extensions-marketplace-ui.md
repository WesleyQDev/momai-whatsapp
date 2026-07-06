# Extensions Marketplace UI Redesign - Iteration 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the extensions details page to a 3-column layout, simplify icons to reduce clutter, enhance contrast/readability across the screens, and implement a glowing indicator for active extensions.

**Architecture:** 
- Change details page grid in `ExtensionsView.tsx` from 10-column layout (70/30 split) to a 12-column layout:
  - Left column (`lg:col-span-3`): Version History.
  - Middle column (`lg:col-span-6`): About description & system requirements.
  - Right column (`lg:col-span-3`): Information table & Permissions.
- Increase background brightness/contrast using `#16161a` and `#232329` for cards.
- Remove decorative icons next to headers ("Sobre", "Requisitos", "Histórico", "Informações", "Permissões") and bullet points.
- Refactor the active/enabled extension badge to display a green glowing indicator (`animate-pulse`).

**Tech Stack:** React, Tailwind CSS, TypeScript.

---

## Proposed Changes and Responsibilities

### [ExtensionsView.tsx](file:///c:/Users/wesle/dev/momai/apps/momai/src/renderer/src/views/ExtensionsView.tsx)
- Reorganize elements in `SkillDetailView` to form a 3-column layout.
- Update Tailwind styles for better contrast: replace dark background classes (`bg-zinc-900`, `bg-zinc-800/40`, `border-zinc-800`) with higher contrast alternatives.
- Clean up icons from headers and list bullets.
- Implement pulsating/glowing indicators for active extensions.

---

## Tasks

### Task 1: Refactor Details Page to a 3-Column Layout

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Relocate Version History in HTML**
  Move the Version History Section code block to be rendered *before* the Description ("Sobre esta extensão") section inside `SkillDetailView`.

- [ ] **Step 2: Update Grid Layout**
  Change the grid container to a 12-column grid and group the columns as follows:
  ```typescript
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
    {/* Left Column: Version History (25% -> lg:col-span-3) */}
    <div className="lg:col-span-3 space-y-6">
      {/* Version History Section */}
    </div>

    {/* Center Column: Description & Requirements (50% -> lg:col-span-6) */}
    <div className="lg:col-span-6 space-y-6">
      {/* About Section */}
      {/* Requirements Section */}
    </div>

    {/* Right Column: Information & Permissions (25% -> lg:col-span-3) */}
    <div className="lg:col-span-3 space-y-6">
      {/* Specs Section */}
      {/* Permissions Section */}
    </div>
  </div>
  ```

- [ ] **Step 3: Adjust elements for narrow columns**
  Ensure Version History cards inside the timeline stack content vertically if width is constrained.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(detail): refactor layout to a balanced 3-column grid"
  ```

---

### Task 2: Simplify Icons and Reduce Clutter

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Remove decorative icons from detail page section headers**
  Identify and remove:
  - `<InformationCircleIcon className="w-4 h-4 text-violet-400" />` from "Sobre esta extensão" header.
  - `<CpuChipIcon className="w-4 h-4 text-violet-400/80" />` from "Requisitos do Sistema" header.
  - `<ClockIcon className="w-4 h-4 text-violet-400" />` from "Histórico de Versões" header.
  - `<BoltIcon className="w-4 h-4 text-amber-400" />` from "Permissões" header.

- [ ] **Step 2: Clean up permission bullet list**
  Remove the purple glowing dot div next to permission items in the sidebar:
  ```typescript
  // Replace:
  <div className="w-1 h-1 rounded-full bg-violet-400 mt-1.5 shrink-0 shadow-[0_0_5px_rgba(167,139,250,0.5)]" />
  // With a simple dash or native list dot:
  <span className="text-zinc-500 mr-2 shrink-0">•</span>
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(detail): remove section header icons and simplify list bullets"
  ```

---

### Task 3: Improve Contrast, Text Readability, and Tag Styling

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Increase background/border contrast**
  Update the styling classes in `ExtensionsView.tsx` to make elements easier to see:
  - Replace deep dark background classes (`bg-zinc-900`) with a cleaner high-contrast dark color (`bg-[#121214]`).
  - Update card backgrounds: replace `bg-zinc-800/20` and `bg-zinc-950/20` with `bg-[#1a1a1f]/80` or `bg-zinc-900/60` and borders to `border-zinc-800`.
  - Ensure text elements use `text-zinc-100` (for primary content/descriptions) and `text-zinc-300` (for secondary labels) rather than dark gray.

- [ ] **Step 2: Polish Tag Filters**
  Redesign the tag selection buttons (Todas, Utilitário, etc.) at the top of the Store Catalog to look like flat, clean, high-contrast badges:
  - Base state: `bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700`
  - Active state: `bg-violet-600/20 border-violet-500 text-violet-400`

- [ ] **Step 3: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(store): raise contrast, improve text readability and tag filter styling"
  ```

---

### Task 4: Glowing Indicator for Active Status

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Add a pulsating green dot helper**
  Create or inject a glowing dot indicator component for active status:
  ```typescript
  const ActiveGlow = () => (
    <span className="relative flex h-2 w-2 mr-1.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
    </span>
  )
  ```

- [ ] **Step 2: Update status displays in Catalog Cards, Library Table, and Details**
  - **Catalog Cards**: Modify `SkillCard` active badge to render `ActiveGlow` next to the text "Ativa".
  - **Library Table**: Render `ActiveGlow` next to the text "Ativa".
  - **Details Page**: Render `ActiveGlow` in the active badge.

- [ ] **Step 3: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(store): implement pulsating active status glow indicators"
  ```

---

## Self-Review

1. **Spec Coverage**: The plan covers all elements requested by the user: 3-column layout, contrast improvement, tag polishing, icon simplification, and glowing active status indicator.
2. **Placeholders**: No placeholders or vague commands are used. Every step has precise files and commands.
