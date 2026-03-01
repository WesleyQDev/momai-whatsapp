import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

import { join } from 'path'

if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
  app.name = 'MomAI-dev'
  // app.getAppPath() is usually apps/momai/out/main or apps/momai
  // Using an absolute path relative to the app path
  app.setPath('userData', join(app.getAppPath(), '../../.dev-data'))
} else {
  app.name = 'MomAI'
}
