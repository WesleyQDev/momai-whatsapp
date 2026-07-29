# Release Pipeline — MomAI

Pipeline completa de release em 2 partes. Você controla os gatilhos.

## Fluxo

```
/release v1.x.x
    │
    ├── PARTE 1: PREP
    │   ├── [AGENTE] Bump versão no package.json
    │   ├── [AGENTE] Cria git tag v1.x.x
    │   ├── [AGENTE] Push tag
    │   ├── [AGENTE] Avisa "Pronto! Build AppX: <comando>"
    │   └── [VOCÊ]   Roda build AppX + publica na Microsoft Store
    │
    └── "pode continuar a release"
         │
         ├── PARTE 2: BUILD + PUBLICA
         │   ├── [AGENTE] Build .exe
         │   ├── [AGENTE] Publica GitHub Release (MomAI-App)
         │   ├── [AGENTE] Build Linux
         │   ├── [AGENTE] Upload Linux assets na mesma release
         │   ├── [AGENTE] Cria PR de changelog
         │   ├── [VOCÊ]   Aprova PR de changelog
         │   ├── [AGENTE] Sugere tópicos de blog
         │   ├── [VOCÊ]   Escolhe um tópico
         │   ├── [AGENTE] Escreve post + pede imagem
         │   ├── [VOCÊ]   Passa path da imagem
         │   ├── [AGENTE] Cria PR com post + imagem
         │   └── [VOCÊ]   Aprova PR
         │
         └── ✅ Pipeline concluída
```

## Comando

```
/release v1.x.x
```

O agente guia cada etapa. Você só executa o build AppX manualmente e aprova PRs.

## Regras

1. **Você sempre autoriza cada parte**
2. **Build AppX é manual** (você roda local)
3. **Agente builda EXE e Linux** (via pnpm)
4. **Changelog vira PR** — você aprova antes de publicar
5. **Blog post vira PR** — você escolhe o tópico e fornece a imagem
6. **Data fixa, escopo flexível** — o que não couber, próxima release
