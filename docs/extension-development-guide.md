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

> [!IMPORTANT]
> **Os modos abaixo existem apenas para desenvolvimento.** Em builds empacotadas (produção/NSIS) o MomAI sempre usa o modo **Store**: extensões são instaladas diretamente em `{DATA_DIR}/extensions/<id>/` a partir do catálogo remoto `community-extensions.json`. A configuração `dev_mode` é ignorada em produção; symlinks em `.dev/` e o arquivo local `dev-extensions.json` não são usados.

Para desenvolver e testar uma extensão em tempo real com o MomAI rodando em modo de desenvolvimento (`pnpm dev`), você deve usar links simbólicos (**symlinks**). Isso permite que o código da extensão viva fora do repositório principal do MomAI.

### Passo 1: Clonar a Extensão
Clone o repositório da sua extensão em qualquer pasta de desenvolvimento de sua preferência (ex: `/caminho/para/minha-extensao`).

### Passo 2: Criar o Vínculo / Link Simbólico
Crie um link de diretório que aponte da **subpasta `.dev/`** dentro do diretório de extensões ativas do MomAI para a pasta física da sua extensão.

> [!IMPORTANT]
> **Os dois modos de desenvolvimento são ambientes completamente separados**, não compartilham extensões instaladas. O switcher "Dev (Symlinks)" e "Testar Loja" controla **qual raiz de filesystem** o MomAI varre naquele momento:
> - Em modo **Dev (Symlinks)** (padrão em dev), o MomAI lê **apenas** `data/extensions/.dev/<id>`. Só aparecem extensões que têm um symlink (ou pasta) criado manualmente em `.dev/`.
> - Em modo **Testar Loja**, o MomAI lê **apenas** `data/extensions/<id>`. Só aparecem extensões que foram baixadas pelo instalador a partir do `dev-extensions.json` local.
> - Trocar de modo **não move nem copia** nada entre as duas raízes. Cada ambiente é independente.
> - O `uninstallExtension` remove **ambas** as raízes, então você não acumula lixo se esquecer de trocar de modo.
> - Em builds empacotadas o conceito de modo não existe: o MomAI sempre instala e escaneia `data/extensions/<id>` diretamente (modo Store).

*   **No Windows (PowerShell):**
    > [!TIP]
    > O tipo `-ItemType Junction` é recomendado no Windows porque funciona exatamente como um link simbólico de pasta, mas **não exige privilégios de Administrador** para ser criado.

    > [!IMPORTANT]
    > O runtime do MomAI usa o diretório de dados do Electron (`app.getPath('userData')/data`). No Windows, isso é tipicamente `%APPDATA%\MomAI-Dev\data`. **Não crie o symlink em `apps\momai\data\`** — esse é o diretório local do monorepo, não é lido em runtime. Para descobrir o DATA_DIR em uso, procure a variável `MOMAI_NODE_CORE_DATA_DIR` nos logs ou no `.env`.

    ```powershell
    # Descubra o DATA_DIR correto:
    $dataDir = "$env:APPDATA\MomAI-Dev\data"
    New-Item -ItemType Directory -Path "$dataDir\extensions\.dev" -Force
    New-Item -ItemType Junction -Path "$dataDir\extensions\.dev\minha-extensao" -Value "C:\caminho\para\minha-extensao"
    ```
*   **No Linux / macOS (Terminal):**
    > [!IMPORTANT]
    > O DATA_DIR em runtime é `$HOME/.config/MomAI-Dev/data` (Linux) ou `$HOME/Library/Application Support/MomAI-Dev/data` (macOS). Verifique o DATA_DIR real checando a variável `MOMAI_NODE_CORE_DATA_DIR` nos logs.
    ```bash
    DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/MomAI-Dev/data"
    mkdir -p "$DATA_DIR/extensions/.dev"
    ln -s /caminho/para/minha-extensao "$DATA_DIR/extensions/.dev/minha-extensao"
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
    *   Em modo **Dev (Symlinks)**, o backend do MomAI (`registry.js`) varre `{DATA_DIR}/extensions/.dev/` e carrega o `SKILL.md` e `runtime.js` de cada subdiretório (ou symlink) encontrado.
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

1.  **Build e empacotamento:**
    *   Instale as dependências de produção: `npm install --production`
    *   Compile a UI (se tiver): `pnpm build` (roda esbuild → `dist/`)
    *   Crie um arquivo `.zip` contendo:
        *   `manifest.json`, `SKILL.md`, `runtime.js`
        *   `dist/` (bundles da UI, se houver)
        *   `node_modules/` (dependências de runtime — **obrigatório** para extensões com backend JS)
        *   `package.json` (para referência)
    *   **Não inclua** código-fonte (`src/`), configs de build (`build.mjs`, `tsconfig.json`), nem `node_modules` de dev (eslint, typescript, etc.)
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
