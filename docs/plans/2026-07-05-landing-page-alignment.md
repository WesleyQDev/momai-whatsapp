# Plano: Alinhar Seção de Extensões do Landing Page com Desktop

## Problema

A seção de extensões (`/extensoes`) do landing page tem estilo visual diferente do desktop app:

| Aspecto | Landing Page | Desktop App |
|---------|-------------|-------------|
| Card estilo | `hover:-translate-y-1`, border genérica | `hover:border-accent/40 hover:bg-accent/5` |
| Ícone | SVGs inline hardcoded | `resolveSkillIcon()` (emoji/SVG/DOMPurify) |
| Stars | Não mostra | Busca do GitHub via API |
| Detalhe | README genérico | SkillDetailView com versão, stars, tools, permissões |
| Fundo ícone | `getGradient()` hash | `icon_bg` do manifest |

## Escopo (APENAS extensões)

1. **ExtensionCard.tsx** — Alinhar estilo visual
2. **ExtensionsPage.tsx** — Buscar stars, alinhar detalhe
3. **NÃO mexer** em: cores, fontes, navbar, contato, hero, footer

---

## Fase 1: ExtensionCard.tsx

**Arquivo:** `apps/landing-page/src/components/ExtensionCard.tsx`

### Mudanças:

1. **Card hover**: Trocar `hover:-translate-y-1` por `hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5`
2. **Fundo ícone**: Usar `icon_bg` do card (se disponível) em vez de `getGradient()` hash
3. **Stars**: Adicionar badge de stars quando `stars > 0`
4. **Props**: Adicionar `stars?: number` e `iconBg?: string` ao `ExtensionCardProps`

### Novo estilo do card:
```tsx
<button className="group relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-tertiary)]/60 p-6 text-left backdrop-blur-xl transition-all duration-300 hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 active:scale-[0.98]">
```

### Fundo do ícone:
```tsx
// Se iconBg existe, usa ele. Senão, usa getGradient()
const bgStyle = iconBg 
  ? { backgroundColor: iconBg }
  : undefined;
const bgClass = iconBg 
  ? '' 
  : `bg-gradient-to-br ${gradClass}`;
```

---

## Fase 2: ExtensionsPage.tsx

**Arquivo:** `apps/landing-page/src/pages/ExtensionsPage.tsx`

### Mudanças:

1. **Buscar stars**: Para cada extensão com `repo`, buscar stars do GitHub
2. **Passar stars para ExtensionCard**
3. **Detalhe da extensão**: Alinhar com `SkillDetailView` do desktop

### Fetch de stars:
```tsx
useEffect(() => {
  const fetchStars = async () => {
    const results = await Promise.all(
      extensions.map(async (ext) => {
        if (!ext.repo) return { id: ext.id, stars: 0 };
        try {
          const res = await fetch(`https://api.github.com/repos/${ext.repo}`);
          const data = await res.json();
          return { id: ext.id, stars: data.stargazers_count || 0 };
        } catch {
          return { id: ext.id, stars: 0 };
        }
      })
    );
    setStarsMap(Object.fromEntries(results.map(r => [r.id, r.stars])));
  };
  if (extensions.length > 0) fetchStars();
}, [extensions]);
```

### Detalhe da extensão (quando clica):
Alinhar com o desktop:
- Header com ícone grande + nome + badge de categoria
- Metadata: autor, versão, stars
- Link para GitHub
- README renderizado

---

## Fase 3: Interface Extension

**Arquivo:** `apps/landing-page/src/pages/ExtensionsPage.tsx`

Atualizar interface `Extension` para incluir campos novos:
```tsx
interface Extension {
  // ... existente
  stars?: number;
  icon_bg?: string;
}
```

---

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `apps/landing-page/src/components/ExtensionCard.tsx` | Estilo hover, fundo ícone, stars |
| `apps/landing-page/src/pages/ExtensionsPage.tsx` | Fetch stars, alinhar detalhe |

**Total: 2 arquivos**

---

## Validação

1. `pnpm --filter landing-page lint` — 0 erros
2. `pnpm --filter landing-page typecheck` — 0 erros
3. `pnpm --filter landing-page build` — build OK
4. Verificar visualmente com `pnpm --filter landing-page dev`
5. Comparar cards com `ExtensionsView.tsx` do desktop

---

## Ordem

1. ExtensionCard.tsx (estilo + stars)
2. ExtensionsPage.tsx (fetch stars + detalhe)
