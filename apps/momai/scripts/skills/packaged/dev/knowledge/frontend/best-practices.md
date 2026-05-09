# Frontend Playbook (MomAI)

## Design alignment

- Priorize consistência visual com o tema MomAI: contraste alto, bordas suaves, brilho leve e foco em leitura.
- Evite layouts genéricos. Use hierarquia clara com cards e microestados.

## UI patterns

- Componentes de chat devem ser compactos e escaneáveis.
- Preferir ações explícitas em botões em vez de comportamento implícito.
- Em mensagens longas, oferecer expandir/recolher para reduzir ruído.

## Snippets úteis

```tsx
const [expanded, setExpanded] = useState(false)
<button onClick={() => setExpanded((v) => !v)}>{expanded ? 'Ocultar' : 'Expandir'}</button>
```

## Tailwind notes

- Use classes semânticas já existentes (border-border, text-text, bg-card).
- Evite introduzir cor fora da paleta do app sem necessidade.
