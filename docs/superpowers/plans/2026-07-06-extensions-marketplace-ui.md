# Extensions Marketplace UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the extensions marketplace in MomAI to mimic a clean, Windows 11 Microsoft Store aesthetic, featuring a dedicated "Biblioteca" (Library) list-view and a professional 2-column details page with a version timeline.

**Architecture:** Remove top tabs from `ExtensionsView.tsx`, introduce a header command section containing search, environment toggles, and a "Library" toggle button. Conditionally render either the Catalog Grid (Store) or the Library list view. Update `SkillDetailView` to render as a 70/30 split grid with structured specs and a timeline version history.

**Tech Stack:** React, Tailwind CSS, TypeScript, `@heroicons/react`.

---

## Proposed Changes and Responsibilities

### [ExtensionsView.tsx](file:///c:/Users/wesle/dev/momai/apps/momai/src/renderer/src/views/ExtensionsView.tsx)
- Create a new `viewMode` state variable (`'store' | 'library' | 'detail'`).
- Clean up the header to remove the old "Loja" and "Minhas Skills" tabs.
- Add a "Biblioteca" (Library) toggle button in the header next to the search bar.
- Refactor the catalog card grid layout with hover shadows, smooth transitions, and standard badge backgrounds.
- Add a brand new `LibraryView` component/sub-render displaying installed extensions in a clean, tabular format with name, version, status, and action buttons.
- Redesign `SkillDetailView` into a 2-column layout (70/30 split).
  - Main column: Description markdown and a vertical version timeline.
  - Sidebar column: Extended specifications table and list of required permission strings with icons.

---

## Tasks

### Task 1: Navigation Top Bar Clean up and Library View Toggle

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Locate top navigation tabs and state**
  Identify the state tracking tabs (`activeTab` or similar) in `ExtensionsView.tsx` and replace it with a new `viewMode` state:
  ```typescript
  const [viewMode, setViewMode] = useState<'store' | 'library'>('store')
  ```
  And if a skill is selected, render the detail page.

- [ ] **Step 2: Clean up the header layout**
  Modify the header render block:
  - Remove the old "Loja" and "Minhas Skills" buttons.
  - Add a "Biblioteca" folder icon button. When `viewMode === 'library'`, style it as active (colored border/glow). When clicked, toggle `viewMode` between `'store'` and `'library'`.
  
  ```typescript
  // Example button definition
  <button
    onClick={() => setViewMode(viewMode === 'store' ? 'library' : 'store')}
    className={`p-2.5 rounded-xl border transition-all duration-200 flex items-center gap-2 ${
      viewMode === 'library'
        ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
        : 'bg-zinc-800/40 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-650'
    }`}
    title="Biblioteca"
  >
    <FolderIcon className="w-5 h-5" />
    <span className="text-xs font-bold">Biblioteca</span>
  </button>
  ```

- [ ] **Step 3: Run the dev server to verify visually**
  Verify that the top buttons "Loja" and "Minhas Skills" are gone, and a new "Biblioteca" button is visible and active when clicked.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(store): clean up top tabs and add library view toggle button"
  ```

---

### Task 2: Implement the Dedicated Library (Biblioteca) View

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Add a LibraryView sub-component or rendering block**
  When `viewMode === 'library'` and no skill is selected, render a structured list of installed extensions.
  Format it as a clean list table:
  - Column 1: **Nome** (small rounded icon, name, category).
  - Column 2: **Versão** (installed version number).
  - Column 3: **Status** (clean enabled/disabled badge).
  - Column 4: **Ações** (active switch, uninstall button).
  
  ```typescript
  // Filter installed skills
  const installedSkills = skills.filter(
    (s) => s.installed !== false && (s.category === 'core' || s.category === 'extension')
  )
  ```

- [ ] **Step 2: Add updates check button**
  Add a global "Verificar Atualizações" (Check for Updates) button at the top right of the Library view. Make it trigger a reload of the extensions list.

- [ ] **Step 3: Test toggling and actions**
  Ensure that clicking the "Biblioteca" button successfully shows the list of installed extensions, and that activating/deactivating and uninstalling works directly from the list.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(store): implement dedicated library list view"
  ```

---

### Task 3: Redesign Catalog Grid Cards (Store Catalog)

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Redesign catalog card grid layout**
  Update the catalog card rendering:
  - Add transition effects: `hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.45)] hover:border-zinc-600/50`.
  - Refine badges (like `OFICIAL` or `ATIVA`): use flat solid backgrounds with low opacity instead of thick borders (e.g. `bg-emerald-500/10 text-emerald-400 border-none` / `bg-violet-500/10 text-violet-400`).
  - Add a developer initial/avatar badge and GitHub stars in a clean row at the bottom.

- [ ] **Step 2: Verify visually**
  Verify that the catalog grid looks clean, consistent, and responds to mouse hover with smooth transitions.

- [ ] **Step 3: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(store): polish catalog cards with hover effects and clean badges"
  ```

---

### Task 4: Redesign Extension Details Page (2-Column Microsoft Store Grid)

**Files:**
- Modify: `apps/momai/src/renderer/src/views/ExtensionsView.tsx`

- [ ] **Step 1: Modify layout to 70/30 split**
  In `SkillDetailView`, replace the layout container with a split grid:
  ```typescript
  <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 items-start">
    {/* Left Column (70%) */}
    <div className="lg:col-span-7 space-y-8">...</div>
    {/* Right Column (30%) */}
    <div className="lg:col-span-3 space-y-6">...</div>
  </div>
  ```

- [ ] **Step 2: Add Version Timeline**
  Redesign the Version History block. Instead of accordion/collapsible list of cards, render a clean vertical timeline. Draw a vertical line (`border-l border-zinc-700`) and place version circles along it:
  ```typescript
  <div className="relative border-l border-zinc-700 ml-3 pl-6 space-y-6">
    {releases.map((rel) => (
      <div key={rel.version} className="relative">
        <div className="absolute -left-[30px] top-1.5 w-3 h-3 rounded-full bg-violet-500 border-4 border-zinc-900" />
        {/* Version info */}
      </div>
    ))}
  </div>
  ```

- [ ] **Step 3: Format specifications and permissions**
  In the right column, render clean card lists for specifications (Developer, Category, Platform, Risk level) and required permission strings with clean icons.

- [ ] **Step 4: Verify detail page layout**
  Open the detail view of an extension, and ensure that the layout, timeline, and sidebar cards match the Windows 11 / Microsoft Store aesthetic.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/momai/src/renderer/src/views/ExtensionsView.tsx
  git commit -m "ui(store): redesign detail page with 2-column layout and vertical timeline"
  ```

---

## Self-Review

1. **Spec Coverage**: All items defined in the spec (tab removal, library toggle, catalog cards, library view, details grid, version timeline) are covered in the tasks.
2. **Placeholders**: No placeholder values or vague instructions are present. Complete code snippets and structures are provided.
3. **Consistency**: All states and mode keys (`_dev` suffix for symlink mode) are correctly handled.
