const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

exports.command = 'create <project-name>'
exports.describe = 'Scaffold a new MomAI extension project'
exports.builder = {
  'project-name': {
    type: 'string',
    describe: 'Name of the extension project (used as folder name and extension ID)'
  }
}

exports.handler = function (argv) {
  const name = String(argv.projectName || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
  if (!name) {
    console.error('Error: project-name is required (lowercase, alphanumeric + hyphens)')
    process.exit(1)
  }

  const targetDir = path.resolve(name)
  if (fs.existsSync(targetDir)) {
    console.error(`Error: Directory "${name}" already exists`)
    process.exit(1)
  }

  const templatesDir = path.join(__dirname, '..', 'templates')

  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

  // Copy and interpolate templates
  const templateFiles = [
    ['manifest.json', { id: name, name: argv.projectName }],
    ['src/index.ts', {}],
    ['build.mjs', {}],
    ['tsconfig.json', {}],
    ['package.json', { name }],
    ['.gitignore', {}]
  ]

  for (const [relPath, vars] of templateFiles) {
    const src = path.join(templatesDir, relPath)
    const dest = path.join(targetDir, relPath)
    let content = fs.readFileSync(src, 'utf8')
    for (const [k, v] of Object.entries(vars)) {
      content = content.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v)
    }
    // Remove template comments (lines starting with #)
    content = content.replace(/^#.*$/gm, '').trim()
    fs.writeFileSync(dest, content)
  }

  console.log(`\n  Created MomAI extension in "${name}/"\n`)
  console.log('  Next steps:')
  console.log(`    cd ${name}`)
  console.log('    npm install')
  console.log('    npm run build')
  console.log('    npx momai-sdk dev\n')
}
