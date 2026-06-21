import { CURRENT_VARIANT } from './variants'
import { app } from 'electron'
import { join } from 'path'

// Side-effect import: must be the FIRST import in index.ts so that
// (1) process.env is configured BEFORE any other module reads it, AND
// (2) app.setName / app.setPath are called BEFORE any module calls
//     app.getPath('userData') (notably ./logger).
//
// Do not import './constants' or any module that transitively imports it
// from this file — the order would defeat the purpose.
process.env.PORT = String(CURRENT_VARIANT.corePort)
process.env.MOMAI_PYTHON_SIDECAR_PORT = String(CURRENT_VARIANT.pythonPort)
process.env.MOMAI_LLAMA_PORT = String(CURRENT_VARIANT.llamaPort)
process.env.MOMAI_EMBEDDING_PORT = String(CURRENT_VARIANT.embeddingPort)

app.setName(CURRENT_VARIANT.appName)
app.setAppUserModelId(CURRENT_VARIANT.appId)
app.setPath('userData', join(app.getPath('appData'), CURRENT_VARIANT.userDataSubdir))
