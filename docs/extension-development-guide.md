# Guia de Desenvolvimento de Extensões do MomAI

Este guia descreve como desenvolver, testar localmente e publicar novas extensões descentralizadas para o **MomAI**.

O MomAI possui um modelo de arquitetura híbrido onde o núcleo (Core) da aplicação é de código fechado, enquanto todas as extensões adicionais (como WhatsApp, Launcher e Dashboard) são de **código aberto** e vivem em seus próprios repositórios independentes.

---

## 1. Estrutura Padrão de uma Extensão

Toda extensão descentralizada deve conter a seguinte estrutura de arquivos para que possa ser interpretada e carregada pelo runtime do MomAI:

```text
minha-extensao/
├── manifest.json         # Metadados, permissões declarativas, rotas e componentes UI
├── SKILL.md              # Prompt de sistema e descrição lexical de intenções para o LLM
├── package.json          # Dependências JS de build e runtime
├── build.mjs             # Configuração do esbuild para compilar o frontend (React)
├── runtime.js            # Lógica em Node.js executada no processo isolado (opcional se não houver backend)
├── src/
│   ├── page.tsx          # UI de página cheia da extensão (React + Tailwind)
│   ├── panel.tsx         # UI de painel lateral (React + Tailwind)
│   └── registry-bridge.ts# Ponte para registrar componentes no host
└── dist/                 # (Gitignored) Bundles gerados pelo build (page.js, panel.js)
```

### O manifesto (`manifest.json`)
Exemplo mínimo de manifesto para uma extensão com UI e backend em JS:

```json
{
  "id": "minha-extensao",
  "name": "Minha Extensão",
  "version": "1.0.0",
  "description": "Uma extensão fantástica para o MomAI.",
  "author": "Seu Nome",
  "icon": "Puzzle",
  "permissions": ["filesystem:read", "network"],
  "ui": {
    "page": {
      "path": "dist/page.js",
      "label": "Minha Extensão"
    },
    "panel": {
      "path": "dist/panel.js",
      "label": "Painel Lateral"
    }
  },
  "theme": {
    "gradient": "from-violet-600 to-purple-500",
    "accent": "violet"
  }
}
```

---

## 2. Fluxo de Desenvolvimento Local (Symlinks)

Para desenvolver e testar uma extensão em tempo real com o MomAI rodando em modo de desenvolvimento (`pnpm dev`), você deve usar links simbólicos (**symlinks**). Isso permite que o código da extensão viva fora do repositório principal do MomAI.

### Passo 1: Clonar a Extensão
Clone o repositório da sua extensão em qualquer pasta de desenvolvimento de sua preferência (ex: `/caminho/para/minha-extensao`).

### Passo 2: Criar o Vínculo / Link Simbólico
Crie um link de diretório que aponte do diretório de extensões ativas do MomAI para a pasta física da sua extensão. Execute o comando a partir da **raiz do monorepo do MomAI**:

*   **No Windows (PowerShell):**
    > [!TIP]
    > O tipo `-ItemType Junction` é recomendado no Windows porque funciona exatamente como um link simbólico de pasta, mas **não exige privilégios de Administrador** para ser criado.
    ```powershell
    New-Item -ItemType Junction -Path ".\apps\momai\data\extensions\minha-extensao" -Value "C:\caminho\para\minha-extensao"
    ```
*   **No Linux / macOS (Terminal):**
    ```bash
    ln -s /caminho/para/minha-extensao ./apps/momai/data/extensions/minha-extensao
    ```

### Passo 3: Rodar o compilador da extensão em modo Watch
Entre na pasta da extensão e inicie o compilador em modo de observação (`watch`), para que qualquer alteração de código React gere automaticamente novos bundles em `dist/`:
```bash
cd /caminho/para/minha-extensao
pnpm install
pnpm dev  # ou o comando correspondente que roda esbuild --watch
```

### Passo 4: Rodar o MomAI
A partir da raiz do monorepo principal do MomAI, inicie o modo de desenvolvimento:
```bash
pnpm dev
```

*   **Como funciona em runtime:**
    *   O backend do MomAI (`registry.js`) detecta automaticamente a nova extensão na pasta `data/extensions/minha-extensao` e carrega o arquivo `SKILL.md` e o `runtime.js`.
    *   O Vite dev server do MomAI intercepta requisições feitas para `/extensions/minha-extensao/dist/page.js` e lê diretamente os arquivos atualizados em tempo real.
    *   Qualquer mudança na UI do React será atualizada bastando recarregar a interface do MomAI (F5 ou `Ctrl + R` se em janela de dev).

---

## 3. Bundling de UI e Aliases Externos

As interfaces React das extensões devem ser compiladas como módulos ESM. Para evitar inflar o tamanho do bundle e causar conflitos de runtime, alguns pacotes principais são declarados como **externos** (externalizados) e são injetados pelo próprio host do MomAI em tempo de execução:
*   `react`
*   `react-dom`
*   `react/jsx-runtime`

No arquivo `build.mjs` da sua extensão, certifique-se de configurar o esbuild desta forma:
```js
import esbuild from 'esbuild'

esbuild.build({
  entryPoints: ['src/page.tsx', 'src/panel.tsx'],
  bundle: true,
  format: 'esm',
  outdir: 'dist',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  // ... outras configurações
})
```

---

## 4. Publicação e Distribuição

O MomAI gerencia a instalação de extensões em dois níveis:

*   **`community-extensions.json` (Produção/Remoto):** Fica hospedado no repositório público do GitHub (`WesleyQDev/MomAI-App`). Serve como a vitrine da Store e a lista de segurança oficial dos usuários finais.
*   **`dev-extensions.json` (Desenvolvimento/Local):** Fica na raiz do monorepo do MomAI. Serve apenas para testes locais de download em ambiente de desenvolvimento (`pnpm dev`).

Quando a extensão estiver pronta para o lançamento público:

1.  **Release no GitHub:**
    *   Crie um arquivo `.zip` contendo apenas os arquivos de runtime necessários (removendo `node_modules` e código-fonte cru, mantendo apenas `manifest.json`, `SKILL.md`, `runtime.js` e a pasta `dist/`).
    *   Faça o upload deste ZIP em uma **Release pública** no repositório GitHub da extensão (ex: `v1.0.0`).
2.  **Adicionar ao Catálogo da Store:**
    *   Para o ambiente de **produção**, faça um commit ou envie um PR adicionando a extensão ao arquivo `community-extensions.json` no repositório público `WesleyQDev/MomAI-App`.
    *   Para testar o fluxo de download em **desenvolvimento**, adicione a entrada correspondente no arquivo local `dev-extensions.json` na raiz do monorepo:
    ```json
    {
      "id": "minha-extensao",
      "name": "Minha Extensão",
      "description": "Uma descrição rápida.",
      "author": "Seu Nome",
      "version": "1.0.0",
      "download_url": "https://github.com/usuario/minha-extensao/releases/download/v1.0.0/minha-extensao.zip",
      "sha256": "hash_sha256_do_arquivo_zip"
    }
    ```
