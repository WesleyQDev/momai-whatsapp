---
title: "Pro, Lite and Ultra: understanding MomAI's modes"
date: April 28, 2026
excerpt: Choosing between MomAI's modes can be confusing. Each one balances performance, features, and hardware usage differently. Find out which one suits you best.
image: /images/Modos/Seuhardware.png
author: WesleyQDev
---

First things first: MomAI is 100% free, requires no login, has no subscription, and doesn't collect your data. You download, install, and use it. Everything runs locally, and the only external access is when you ask for an internet search.

The Lite, Pro, and Ultra modes are not payment plans or locked feature tiers. They exist because every computer is different, and the idea is that the assistant adapts to what you have, not the other way around. If your hardware can handle more, it delivers more. If it's more modest, it does more with less.

If you have a basic notebook with 6GB of RAM, it doesn't make sense to load a 4B parameter model and a full voice pipeline. If you have a GPU with 8GB of VRAM, it also doesn't make sense to be limited to a small model. Each mode exists for this: you choose the ideal balance between capability and consumption for your computer.

## Lite

Lite is the most stripped-down mode. It loads the Qwen3.5-0.8B model, which takes about 1.3GB, and runs in text only — no voice, no Python backend, no frills. Responses go up to 192 tokens and consumption stays around 1.5GB of RAM or VRAM. It runs on CPU or GPU without requiring a dedicated graphics card.

Left out are speech synthesis and recognition, the Luna wake word, call mode, internet access, note and reminder creation, and semantic memory. The Python backend isn't even started, so there's no extra process consuming memory. This is the right mode if your PC has less than 8GB of RAM or if you just want quick text and don't care about voice.

## Pro

Pro is the middle ground. It uses the Qwen3.5-2B model, about 2.2GB, and activates the Python backend with voice synthesis. Responses go up to 320 tokens and consumption is around 2.8GB of RAM or VRAM. Synthesis uses Kokoro-ONNX with support for 9 languages and automatic CUDA acceleration if you have an NVIDIA GPU, and the voice is pre-initialized so the first response has no delay.

Still excluded are the wake word, call mode, audio transcription, internet tools, notes, reminders, and semantic memory. It works well with 8GB of RAM or more. This is what I recommend for most people who want a speaking assistant without weighing down the system.

## Ultra

Ultra is the complete mode. It loads Qwen3.5-4B with about 3.8GB and more precise quantization (Q4_K_XL), runs a separate embedding model for semantic memory, and activates absolutely everything MomAI can do. Responses of up to 512 tokens and consumption around 5.5GB of RAM or VRAM.

On top of everything Pro has, Ultra adds the Luna wake word, call mode with real-time audio and streamed captions, speech transcription with Faster-Whisper, internet access, note and reminder creation, semantic memory with embeddings, and intelligent skill discovery by similarity. I recommend a GPU with at least 6GB of VRAM. This is the mode for those who want to get the most out of the assistant and have the hardware for it.

## About context

One important thing: unlike what you might read elsewhere, the context is not fixed per mode. MomAI automatically adjusts the context window size based on your hardware, specifically available RAM, GPU VRAM, and the economy mode you chose in settings (minimum, medium, maximum, or custom). If you have plenty of memory, the system increases the context as far as your hardware can handle. If you're on a tighter PC, it reduces it to avoid stuttering. Everything is automatic and this applies to all three modes. An Ultra with plenty of VRAM can reach over 8K tokens, while a Lite on a low-memory PC will operate with less. The system finds the balance on its own.

## Which one to choose?

Looking at it objectively, the choice is simple: if you have a PC with 6 to 8GB of RAM and just want to chat via text, go with Lite. If you have 8GB or more and want to hear the assistant respond, Pro is ideal. Now, if you have a GPU with 6GB or more of VRAM and want everything MomAI offers, Ultra is the way to go. For workstations that won't miss the resources, also go Ultra without a second thought.

And the best part is you can switch between modes whenever you want through settings, without losing anything. Today your PC is more modest and you use Lite. If you upgrade tomorrow, activate Ultra and you're done. Your data stays local regardless of the mode, because it never leaves your machine. In the end, the idea is that MomAI adapts to you, not the other way around.
