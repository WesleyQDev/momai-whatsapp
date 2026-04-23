# Graph Report - .  (2026-04-22)

## Corpus Check
- Large corpus: 1174 files · ~1,786,583 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1069 nodes · 1718 edges · 30 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 310 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend Orchestration|Backend Orchestration]]
- [[_COMMUNITY_Frontend API & Features|Frontend API & Features]]
- [[_COMMUNITY_React UI Layer|React UI Layer]]
- [[_COMMUNITY_Voice & State Management|Voice & State Management]]
- [[_COMMUNITY_Core & Python Management|Core & Python Management]]
- [[_COMMUNITY_FortScript Gaming|FortScript Gaming]]
- [[_COMMUNITY_Architecture & Concepts|Architecture & Concepts]]
- [[_COMMUNITY_Text-to-Speech & Voice|Text-to-Speech & Voice]]
- [[_COMMUNITY_Voice API & Data Models|Voice API & Data Models]]
- [[_COMMUNITY_Mobile & Web Presence|Mobile & Web Presence]]
- [[_COMMUNITY_Electron Main Process|Electron Main Process]]
- [[_COMMUNITY_Notes Service|Notes Service]]
- [[_COMMUNITY_Reminders System|Reminders System]]
- [[_COMMUNITY_Skill Runtimes|Skill Runtimes]]
- [[_COMMUNITY_Chat Interface|Chat Interface]]
- [[_COMMUNITY_Message Rendering|Message Rendering]]
- [[_COMMUNITY_Health App UI|Health App UI]]
- [[_COMMUNITY_Core Skills|Core Skills]]
- [[_COMMUNITY_Build & Release|Build & Release]]
- [[_COMMUNITY_Brand Assets|Brand Assets]]
- [[_COMMUNITY_Onboarding & Tiers|Onboarding & Tiers]]
- [[_COMMUNITY_Chat Utilities|Chat Utilities]]
- [[_COMMUNITY_Active Reminders|Active Reminders]]
- [[_COMMUNITY_Backend Simulators|Backend Simulators]]
- [[_COMMUNITY_Test Fixtures|Test Fixtures]]
- [[_COMMUNITY_Status Tests|Status Tests]]
- [[_COMMUNITY_Overlay Controller|Overlay Controller]]
- [[_COMMUNITY_Store Icons|Store Icons]]
- [[_COMMUNITY_FortScript Brand|FortScript Brand]]
- [[_COMMUNITY_Services Init|Services Init]]

## God Nodes (most connected - your core abstractions)
1. `React` - 54 edges
2. `WakeWordDetector` - 35 edges
3. `handleRequest()` - 27 edges
4. `t()` - 26 edges
5. `streamLlamaChat()` - 25 edges
6. `QuickTranscriber` - 18 edges
7. `bootstrapPython()` - 18 edges
8. `AGENTS.md Development Guide` - 16 edges
9. `TTSManager` - 15 edges
10. `log()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Scheduler Skill` --semantically_similar_to--> `Smart Reminders`  [INFERRED] [semantically similar]
  apps/momai/scripts/skills/core/scheduler/SKILL.md → saude/index.html
- `Pre-initialize TTS in background to reduce first-response latency.` --uses--> `Settings`  [INFERRED]
  C:\Users\wesle\dev\momai\apps\core\startup.py → C:\Users\wesle\dev\momai\apps\core\database\models.py
- `Initialize only the runtime pieces required by the Python sidecar.` --uses--> `Settings`  [INFERRED]
  C:\Users\wesle\dev\momai\apps\core\startup.py → C:\Users\wesle\dev\momai\apps\core\database\models.py
- `stop_chat_voice()` --calls--> `stop_all()`  [INFERRED]
  C:\Users\wesle\dev\momai\apps\core\api\routes\chat_voice.py → C:\Users\wesle\dev\momai\apps\core\services\voice\tts.py
- `getRecurrenceMeta()` --calls--> `t()`  [INFERRED]
  C:\Users\wesle\dev\momai\apps\momai\src\renderer\src\components\chat\RemindersSidebar.tsx → C:\Users\wesle\dev\momai\apps\core\utils\i18n.py

## Hyperedges (group relationships)
- **Shared Landing Page UI Components** — index_landing, blog_page, changelog_page, contato_page, doar_page, form_page [INFERRED 0.85]
- **Structured Response Rendering Pipeline** — structured_responses, node_core_sse, skill_registry, response_renderer [EXTRACTED 1.00]
- **Voice Processing Subsystem** — whisper_stt, kokoro_tts, wake_word [EXTRACTED 1.00]
- **Core MomAI Skills** — scheduler_skill, search_skill, weather_skill [INFERRED 0.85]
- **MomAI SaÃºde Shared Website UI** — saude_index_page, saude_como_usar_page, saude_contato_page, saude_doar_page, saude_form_page [INFERRED 0.85]
- **MomAI Local-First AI Ecosystem** — momai_desktop_assistant, momai_saude_app, llama_cpp, langgraph [INFERRED 0.75]
- **Onboarding Intelligence Tier Selection** — onboarding_png_ui, intelligence_tier_lite, intelligence_tier_pro, intelligence_tier_ultra [INFERRED 0.85]
- **MomAI Brand Identity Asset Group** — icon_gif_momai_logo, icon_png_momai_logo, momai_resources_icon_png [INFERRED 0.85]
- **Microsoft Store Icon File Variants** — icone_microsoft_store_png_icon, ms_store_icon_png_icon, microsoft_store_brand [INFERRED 0.80]
- **Shared Cat Branding Identity** — momai_app_icon_gif, momai_app_icon_png, saude_app_icon_gif, saude_app_icon_png [INFERRED 0.90]
- **Saude Health Android Ecosystem** — saude_health_project, android_platform_logo, saude_emocional_illustration [INFERRED 0.75]
- **Three Pillars of Health** — saude_fisica_physical_health, saude_mental_mental_health, saude_social_social_health [INFERRED 0.85]
- **MomAI App Core Screens** — tutorial_print01_settings_screen, tutorial_print02_profile_screen, tutorial_print03_activity_screen, tutorial_print04_nutrition_screen [INFERRED 0.90]
- **Nutrition Tracking Pipeline** — tutorial_print04_meal_logger, tutorial_print04_calorie_tracker, tutorial_print04_macro_tracker [INFERRED 0.90]

## Communities

### Community 0 - "Backend Orchestration"
Cohesion: 0.04
Nodes (99): advanceReminder(), announceReady(), appendMessage(), applyPerformanceProfile(), broadcast(), buildExtensionsPayload(), buildLocalizedFallbackReply(), buildMemoryContextAndSources() (+91 more)

### Community 1 - "Frontend API & Features"
Cohesion: 0.03
Nodes (54): createMemoryFolder(), createMemoryNote(), deleteMemoryFolder(), deleteMemoryNote(), fetchExtensionRegistry(), fetchExtensions(), fetchHardwareStats(), fetchSettings() (+46 more)

### Community 2 - "React UI Layer"
Cohesion: 0.02
Nodes (16): React, formatSize(), formatTokens(), ResourceFooter(), getRenderer(), StructuredResponseRenderer(), handleComplete(), handleNext() (+8 more)

### Community 3 - "Voice & State Management"
Cohesion: 0.05
Nodes (68): attachCoreIpcHandlers(), emitInitProgress(), ensureNodeCoreLlamaWarmup(), ensurePythonSidecar(), getCorePath(), getCurrentTier(), getLlamaBinPath(), getNodeCoreDataDir() (+60 more)

### Community 4 - "Core & Python Management"
Cohesion: 0.04
Nodes (51): _bind_tts_callbacks(), broadcast_to_sockets(), ensure_tts_runtime(), get_graph_state(), get_pending_graph_data(), get_wake_word_detector_class(), is_ai_busy(), is_call_mode() (+43 more)

### Community 5 - "FortScript Gaming"
Cohesion: 0.05
Nodes (55): AGENTS.md Development Guide, APPX Code Signing, Blog Page, Changelog Page, stop_chat_voice(), Contact Page, Core README, Donation Page (+47 more)

### Community 6 - "Architecture & Concepts"
Cohesion: 0.05
Nodes (39): speak_text(), exists(), runHydrate(), find_empty_excepts(), wait(), init_sidecar_task(), lifespan(), prewarm_tts_if_needed() (+31 more)

### Community 7 - "Text-to-Speech & Voice"
Cohesion: 0.05
Nodes (34): main(), Main entry point for the CLI., Pre-defined list of popular games and heavy applications with their process name, AppsMonitoring, Callbacks, FortScript, Functions, HeavyProcessConfig (+26 more)

### Community 8 - "Voice API & Data Models"
Cohesion: 0.07
Nodes (44): Base, BaseModel, ConversationSummary, Extension, ExternalNote, GamingApp, Message, Apps that, when opened, activate the resource saving mode. (+36 more)

### Community 9 - "Mobile & Web Presence"
Cohesion: 0.05
Nodes (54): AdMob, API REST, App Personalization, Calorie Counter, Contact Email Wesley, Expo, FormSubmit.co, Game Detection Performance Pause (+46 more)

### Community 10 - "Electron Main Process"
Cohesion: 0.21
Nodes (29): buildSnippet(), createFolder(), createNote(), deleteFolder(), deleteNote(), ensureNotesDir(), extractTitleFromContent(), getDataDir() (+21 more)

### Community 11 - "Notes Service"
Cohesion: 0.09
Nodes (15): createReminder(), deleteReminder(), updateReminder(), getRecurrenceMeta(), handleDelete(), handleDuplicate(), handleQuickAdd(), handleUpdate() (+7 more)

### Community 12 - "Reminders System"
Cohesion: 0.12
Nodes (21): main(), percentile(), postJson(), streamChat(), listIncompatibleBackends(), log(), pickEmbeddingModelPath(), buildEnv() (+13 more)

### Community 13 - "Skill Runtimes"
Cohesion: 0.1
Nodes (16): searchMemory(), init_db(), searchWeb(), ColorFormatter, configure_logging(), EndpointFilter, execute(), extractLocation() (+8 more)

### Community 14 - "Chat Interface"
Cohesion: 0.12
Nodes (3): generateSessionTitle(), handleCopy(), cleanMomaiActions()

### Community 15 - "Message Rendering"
Cohesion: 0.21
Nodes (17): Physical Health - Running & Fitness, Mental Health - Meditation & Mindfulness, Social Health - Community & Friendship, Bottom Navigation Bar, MomAI Health App, Settings Screen (ConfiguraÃ§Ãµes), Theme Toggle (Dark/Light), Voice Settings (Voz da MomAI) (+9 more)

### Community 16 - "Health App UI"
Cohesion: 0.16
Nodes (16): MomAI Node Core Ultra, clear_all_reminders tool, create_reminder tool, Scheduler Date Adherence Rationale, Scheduler Global Removal Warning Rationale, list_reminders tool, remove_reminder tool, remove_reminders_by_filter tool (+8 more)

### Community 17 - "Core Skills"
Cohesion: 0.22
Nodes (4): get_locale(), normalize_locale(), TestGetLocale, TestNormalizeLocale

### Community 18 - "Build & Release"
Cohesion: 0.23
Nodes (12): Android Platform Logo, Emotional Health Concept, Groq Black Icon (seeklogo), Groq (AI Inference Company), Groq Inline Icon, MomAI App Icon (GIF), MomAI App Icon (PNG), MomAI Desktop Application (+4 more)

### Community 19 - "Brand Assets"
Cohesion: 0.31
Nodes (10): Google Gemini Brand, Google Gemini Logo SVG, MomAI Logo GIF, MomAI Logo PNG, Lite Intelligence Tier, Pro Intelligence Tier, Ultra Intelligence Tier, MomAI Brand Identity (+2 more)

### Community 20 - "Onboarding & Tiers"
Cohesion: 0.28
Nodes (3): handleFinish(), handleGlobalKeyDown(), withTimeout()

### Community 22 - "Chat Utilities"
Cohesion: 0.29
Nodes (4): clearChatHistory(), fetchSessions(), handleDelete(), loadSessions()

### Community 23 - "Active Reminders"
Cohesion: 0.38
Nodes (4): fetchActiveReminders(), fetchAndUpdate(), notify(), startPolling()

### Community 25 - "Backend Simulators"
Cohesion: 0.4
Nodes (3): Simulates a developer backend logging API requests., Simulates a developer backend logging API requests., simulate_requests()

### Community 27 - "Test Fixtures"
Cohesion: 0.67
Nodes (2): getOccurrenceForDate(), isSameDay()

### Community 30 - "Status Tests"
Cohesion: 0.67
Nodes (1): TestStatusRoute

### Community 31 - "Overlay Controller"
Cohesion: 0.67
Nodes (2): Simulates a background streaming helper/overlay controller., streaming_overlay()

### Community 32 - "Store Icons"
Cohesion: 1.0
Nodes (3): Microsoft Store Icon (Portuguese Filename), Microsoft Store Brand, Microsoft Store Icon

### Community 37 - "FortScript Brand"
Cohesion: 1.0
Nodes (2): FortScript Brand, FortScript Logo

### Community 42 - "Services Init"
Cohesion: 1.0
Nodes (1): Remove markdown formatting and emojis so TTS reads clean text.

## Knowledge Gaps
- **130 isolated node(s):** `Custom format to avoid dual timestamps and inject ANSI colors.`, `Monkey-patch threading.Thread.start to robustly handle race conditions.`, `Apps that, when opened, activate the resource saving mode.`, `Lazy-load heavy dependencies (ctranslate2, numpy, sounddevice, faster_whisper).`, `Wake Word Detector with proper end-of-speech detection.      Instead of contin` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Test Fixtures`** (4 nodes): `reminders.ts`, `getNextOccurrence()`, `getOccurrenceForDate()`, `isSameDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Status Tests`** (3 nodes): `test_status.py`, `test_get_status_returns_ok()`, `TestStatusRoute`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Overlay Controller`** (3 nodes): `overlay_controller.py`, `Simulates a background streaming helper/overlay controller.`, `streaming_overlay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FortScript Brand`** (2 nodes): `FortScript Brand`, `FortScript Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Services Init`** (1 nodes): `Remove markdown formatting and emojis so TTS reads clean text.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `React` connect `React UI Layer` to `Frontend API & Features`, `FortScript Gaming`, `Mobile & Web Presence`, `Notes Service`, `Chat Interface`, `Onboarding & Tiers`, `Chat Utilities`, `Active Reminders`?**
  _High betweenness centrality (0.299) - this node is a cross-community bridge._
- **Why does `FastAPI` connect `FortScript Gaming` to `Voice API & Data Models`, `Mobile & Web Presence`, `Core & Python Management`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Why does `LanÃ§amento MomAI Post` connect `Mobile & Web Presence` to `React UI Layer`, `Voice & State Management`, `FortScript Gaming`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `WakeWordDetector` (e.g. with `Returns whether call mode is active.` and `Enable or disable call mode.`) actually correct?**
  _`WakeWordDetector` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `t()` (e.g. with `.test_returns_translation_for_existing_key()` and `.test_returns_key_for_missing_translation()`) actually correct?**
  _`t()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Custom format to avoid dual timestamps and inject ANSI colors.`, `Monkey-patch threading.Thread.start to robustly handle race conditions.`, `Apps that, when opened, activate the resource saving mode.` to the rest of the system?**
  _130 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Orchestration` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._