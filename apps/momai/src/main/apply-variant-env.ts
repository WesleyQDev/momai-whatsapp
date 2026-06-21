import { CURRENT_VARIANT } from './variants'

// Side-effect import: must be the FIRST import in index.ts so that
// process.env is configured BEFORE any other module (notably
// ./constants, which evaluates API_PORT from process.env at load time)
// reads it.
//
// Do not import './constants' or any module that transitively imports it
// from this file — the order would defeat the purpose.
process.env.PORT = String(CURRENT_VARIANT.corePort)
process.env.MOMAI_PYTHON_SIDECAR_PORT = String(CURRENT_VARIANT.pythonPort)
process.env.MOMAI_LLAMA_PORT = String(CURRENT_VARIANT.llamaPort)
process.env.MOMAI_EMBEDDING_PORT = String(CURRENT_VARIANT.embeddingPort)
