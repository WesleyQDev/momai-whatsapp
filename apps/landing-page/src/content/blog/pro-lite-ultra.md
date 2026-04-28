---
title: "Pro, Lite e Ultra: entenda os modos da MomAI"
date: 28 de Abril, 2026
excerpt: Escolher entre os modos da MomAI pode gerar dúvidas. Cada um equilibra desempenho, recursos e consumo de hardware de forma diferente. Veja qual combina com você.
image: /images/Modos/Seuhardware.png
author: WesleyQDev
---

Antes de tudo: a MomAI é 100% gratuita, não pede login, não tem assinatura e não coleta seus dados. Você baixa, instala e usa. Tudo roda local, e o único acesso externo é quando você pedir uma busca na internet.

Os modos Lite, Pro e Ultra não são planos de pagamento nem tiers de funcionalidade bloqueada. Eles existem porque cada computador é diferente, e a ideia é que a assistente se adapte ao que você tem, não o contrário. Se o seu hardware aguenta mais, ela entrega mais. Se é mais modesto, ela faz mais com menos.

Se você tem um notebook básico com 6GB de RAM, não faz sentido carregar um modelo de 4B parâmetros e um pipeline de voz inteiro. Se você tem uma GPU com 8GB de VRAM, também não faz sentido ficar limitado a um modelo pequeno. Cada modo existe pra isso: você escolhe o equilíbrio ideal entre capacidade e consumo pro seu computador.

## Lite

O Lite é o modo mais enxuto. Carrega o modelo Qwen3.5-0.8B, que ocupa cerca de 1.3GB, e roda apenas em texto, sem voz, sem backend Python, sem firula nenhuma. As respostas vão até 192 tokens e o consumo fica por volta de 1.5GB de RAM ou VRAM. Roda em CPU ou GPU sem exigir placa de vídeo dedicada.

Do lado de fora ficam a síntese e o reconhecimento de fala, a wake word Luna, o modo chamada, acesso à internet, criação de notas e lembretes, e a memória semântica. O backend Python nem é iniciado, então não tem processo extra ocupando memória. É o modo certo se seu PC tem menos de 8GB de RAM ou se você só quer texto rápido e não liga pra voz.

## Pro

O Pro é o meio termo. Usa o modelo Qwen3.5-2B, cerca de 2.2GB, e ativa o backend Python com síntese de voz. As respostas vão até 320 tokens e o consumo fica em torno de 2.8GB de RAM ou VRAM. A síntese usa Kokoro-ONNX com suporte a 9 idiomas e aceleração CUDA automática se você tiver GPU NVIDIA, e a voz é pré-inicializada pra primeira resposta não ter atraso.

O que fica de fora ainda é a wake word, o modo chamada, transcrição de áudio, ferramentas de internet, notas, lembretes e memória semântica. Funciona bem com 8GB de RAM ou mais. É o que eu recomendo pra maioria das pessoas que quer uma assistente que fala sem pesar no sistema.

## Ultra

O Ultra é o modo completo. Carrega o Qwen3.5-4B com cerca de 3.8GB e uma quantização mais precisa (Q4_K_XL), roda um modelo de embeddings separado pra memória semântica, e ativa absolutamente tudo que a MomAI pode fazer. Respostas de até 512 tokens e consumo por volta de 5.5GB de RAM ou VRAM.

Além de tudo que o Pro tem, o Ultra adiciona a wake word Luna, o modo chamada com áudio em tempo real e legendas streamadas, transcrição de fala com Faster-Whisper, acesso à internet, criação de notas e lembretes, memória semântica com embeddings e descoberta inteligente de skills por similaridade. Recomendo GPU com pelo menos 6GB de VRAM. É o modo pra quem quer extrair o máximo da assistente e tem hardware pra isso.

## Sobre o contexto

Uma coisa importante: diferente do que você pode ler por aí, o contexto não é fixo por modo. A MomAI ajusta automaticamente o tamanho da janela de contexto baseado no seu hardware, especificamente a memória RAM disponível, a VRAM da placa de vídeo e o modo de economia que você escolheu nas configurações (mínimo, médio, máximo ou personalizado). Se você tem bastante memória, o sistema aumenta o contexto até onde seu hardware aguenta. Se está num PC mais apertado, ele reduz pra não engasgar. Tudo automático e isso vale pros três modos. Um Ultra com bastante VRAM pode chegar a mais de 8K tokens, enquanto um Lite num PC com pouca memória vai operar com menos. O sistema encontra o equilíbrio sozinho.

## Qual escolher?

Olhando friamente, a escolha é simples: se você tem um PC com 6 a 8GB de RAM e só quer conversar por texto, vai de Lite. Se tem 8GB ou mais e quer ouvir a assistente respondendo, o Pro é o ideal. Agora, se você tem uma GPU com 6GB ou mais de VRAM e quer tudo que a MomAI oferece, o Ultra é o caminho. Para workstations que não vão sentir falta dos recursos, também vai de Ultra sem pensar duas vezes.

E o melhor é que você pode trocar entre os modos quando quiser pelas configurações, sem perder nada. Hoje seu PC é mais modesto e você usa Lite. Se fizer um upgrade amanhã, ativa o Ultra e pronto. Seus dados continuam locais independente do modo, porque eles nunca saem da sua máquina. No fim, a ideia é que a MomAI se adapte a você, e não o contrário.
