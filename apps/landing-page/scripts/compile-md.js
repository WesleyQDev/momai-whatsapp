import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { watch } from 'chokidar'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const blogDir = path.join(__dirname, '..', 'src', 'content', 'blog')
const outputFile = path.join(blogDir, 'posts.json')

const MONTHS_PT = {
  janeiro: 0, janeiro: 0, jan: 0,
  fevereiro: 1, fev: 1,
  marco: 2, mar: 2, março: 2,
  abril: 3, abr: 3,
  maio: 4,
  junho: 5, jun: 5,
  julho: 6, jul: 6,
  agosto: 7, ago: 7,
  setembro: 8, set: 8, sept: 8,
  outubro: 9, out: 9,
  novembro: 10, nov: 10,
  dezembro: 11, dez: 11,
}

function parseFrontmatter(content) {
  const fm = {}
  let markdownContent = content

  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3)
    if (end !== -1) {
      const frontmatter = content.slice(3, end).trim()
      markdownContent = content.slice(end + 3).trim()

      frontmatter.split('\n').forEach((line) => {
        const idx = line.indexOf(':')
        if (idx !== -1) {
          let val = line.slice(idx + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          } else if (val === 'true') {
            val = true
          } else if (val === 'false') {
            val = false
          }
          fm[line.slice(0, idx).trim()] = val
        }
      })
    }
  }

  return { attributes: fm, content: markdownContent }
}

function parsePortugueseDate(dateStr) {
  if (!dateStr) return new Date(0)

  const match = dateStr.match(/(\d{1,2})\s+de\s+(\w+)\s*,?\s*(\d{4})/i)
  if (!match) {
    const fallback = new Date(dateStr)
    return isNaN(fallback.getTime()) ? new Date(0) : fallback
  }

  const [, day, monthStr, year] = match
  const month = MONTHS_PT[monthStr.toLowerCase()]
  if (month === undefined) return new Date(0)

  return new Date(Number(year), month, Number(day))
}

function compilePosts() {
  if (!fs.existsSync(blogDir)) {
    console.warn(`Blog directory not found: ${blogDir}`)
    fs.writeFileSync(outputFile, JSON.stringify([], null, 2), 'utf-8')
    return
  }

  const postFiles = fs
    .readdirSync(blogDir)
    .filter(file => file.endsWith('.md'))

  const posts = postFiles.map(file => {
    const content = fs.readFileSync(path.join(blogDir, file), 'utf-8')
    const { attributes, content: markdownContent } = parseFrontmatter(content)
    const fileName = file.replace('.md', '')

    return {
      id: fileName,
      title: attributes.title || fileName,
      date: attributes.date || '',
      excerpt: attributes.excerpt || '',
      image: attributes.image || '',
      content: markdownContent,
      featured: attributes.featured === true || attributes.featured === 'true',
    }
  })

  posts.sort((a, b) => {
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    return parsePortugueseDate(b.date).getTime() - parsePortugueseDate(a.date).getTime()
  })

  fs.writeFileSync(outputFile, JSON.stringify(posts, null, 2), 'utf-8')
  console.log(`✓ Generated posts.json with ${posts.length} posts`)
}

compilePosts()

if (process.argv.includes('--watch')) {
  console.log('Watching for changes...')
  watch(path.join(blogDir, '*.md')).on('change', () => {
    console.log('Markdown changed, recompiling...')
    compilePosts()
  })
}
