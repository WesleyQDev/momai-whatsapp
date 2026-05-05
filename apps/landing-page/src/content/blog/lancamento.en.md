---
title: The birth of a private assistant
date: February 22, 2026
excerpt: Meet MomAI, a privacy-focused personal assistant that runs 100% locally on your computer.
image: https://i.ibb.co/LXgHdCFK/image.png
---

I'm launching the first version of **MomAI**, a personal computer assistant that runs entirely on your hardware.

## What is MomAI?

MomAI is a local artificial intelligence assistant. It requires no login and never sends your data to any server. Everything runs and is stored on your own machine. It can access the internet when you ask, but the decision is always yours.

The name comes from the idea of being the "mother" of your system — it organizes, remembers, and helps with whatever you need. And it's completely free.

## What can it do today?

In this version you can create and manage notes, schedule reminders with voice notification, and ask it to fetch information from the internet. Voice activation also works: just say **"Luna"** and it starts listening, all processed locally.

It also detects when you're running a game or heavy process on your PC and pauses AI processes automatically to avoid impacting performance.

## Requirements

**16GB of RAM** and a **graphics card with at least 6GB of VRAM** are recommended. MomAI runs language models locally using **llama.cpp** with the **Qwen** model, which requires decent hardware but guarantees fully offline operation.

## Architecture

The frontend is built with Electron and React, and the backend uses Python with FastAPI. Communication between them happens via WebSocket and REST API. On the backend, AI orchestration is handled by LangGraph — an agent system that decides which tool to use for each situation.

The project will still undergo changes, but the foundation is solid. MomAI already has an extension store to expand its capabilities, and new features will be added frequently through regular updates.

— WesleyQDev
