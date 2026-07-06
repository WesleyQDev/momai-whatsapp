# Spec: Extensions Marketplace UI Redesign (Microsoft Store Style)

Redesign the extensions marketplace in MomAI to look like a professional, desktop-native marketplace inspired by the Microsoft Store, adding a dedicated "Library" view for managing installed extensions and a structured layout for extension details.

## 1. Objectives

- **Professional Aesthetics**: Transition away from generic/AI-looking cards to a polished Windows 11 / Microsoft Store dark theme.
- **Enhanced Layout**: Use a 2-column detail grid with hero header and timeline version history.
- **Dedicated Library**: Remove the top tabs and introduce a "Biblioteca" (Library) icon to toggle a clean list view of installed extensions.
- **Consistency**: Unified badges, clean focus states, hover transitions, and cohesive typography.

---

## 2. Visual Design

### 2.1 Color Palette & Theme
- **Backgrounds**: Deep dark zinc-900 (`#18181b`) and card backgrounds of zinc-950/40 (`#09090b` with opacity) with backdrop blur.
- **Borders**: Thin, high-precision borders using zinc-800 (`#27272a`) and hover glow using zinc-700/60 (`#3f3f46`).
- **Primary Accents**: Violet/Emerald for branding buttons.
- **Badges**: Flat, solid backgrounds with low opacity and high-contrast text (e.g. `bg-emerald-500/10 text-emerald-400` for active/official badges).

### 2.2 Navigation Top Bar
- **Tab Removal**: Remove the "Loja" and "Minhas Skills" tabs.
- **Right Command Section**:
  - Search bar: Thin rounded border, magnifying glass icon.
  - Mode toggle: Switch pill for `DEV` and `TESTAR LOJA`.
  - **Library Toggle**: A folder/collection icon button. Toggles the screen state between the Catalog Grid (Loja) and the Library Table (Biblioteca).

---

## 3. Screen Specs

### 3.1 Screen 1: Catalog View (Store)
- **Featured Section**: Carousel of featured extensions with large icons and subtle colored background gradients.
- **Grid Layout**: Clean 3-column grid of extensions.
  - **Cards**: Flat design with transition-all (`hover:-translate-y-1 hover:shadow-xl hover:border-zinc-700/50`).
  - **Card Footer**: Developer initial avatar in a round badge next to the GitHub star count.

### 3.2 Screen 2: Library View (Biblioteca)
- **Title**: "Biblioteca" header.
- **Updates Action**: "Verificar Atualizações" (Check for Updates) button at the top right of the list.
- **Table Columns**:
  - **Nome**: Small rounded icon + bold title.
  - **Versão**: Installed version string.
  - **Status**: Mode-aware enabled state badge (`Ativa` / `Desativada`).
  - **Ações**: Toggle switch (Ativar/Desativar) and a trash icon button (Desinstalar).

### 3.3 Screen 3: Detail View
- **Hero Header**:
  - Left-aligned icon: Larger size (`w-24 h-24`), rounded corners, subtle shadow.
  - Right content: Extension title, developer name, star rating, action buttons (`Ativar/Desativar`, `Atualizar` if update available, `Desinstalar`).
- **Grid Layout (70/30 split)**:
  - **Main Column (70%)**:
    - **Sobre**: Well-styled typography for the description/readme markdown.
    - **Requisitos**: Card with CPU/OS and internet requirements.
    - **Histórico**: A vertical timeline layout where version nodes are connected by a vertical line, showing date, version badge, and changelog text.
  - **Sidebar Column (30%)**:
    - **Informações**: Table listing Developer, Category, Risk level.
    - **Permissões**: Grouped clean list of required permission strings with icons.

---

## 4. Verification Plan

- **Layout Integrity**: Verify that toggling between Catalog and Library displays correctly without rendering both at once.
- **Responsiveness**: Verify that the 2-column detail grid wraps correctly on narrower screens.
- **Interaction**: Ensure all action buttons (Toggle Active, Uninstall, Install) update states instantly in the Library list view.
