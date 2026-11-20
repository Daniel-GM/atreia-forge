import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const base = new URL('../public/', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('data/catalog.json', base), 'utf8'))
const output = fileURLToPath(new URL('items/', base))
await mkdir(output, { recursive: true })
const initial = catalog.recipes.find(recipe => recipe.id === catalog.defaultRecipeId)
const initialIds = [initial.itemId, ...initial.materials.map(row => row.itemId)]
const records = [...initialIds.map(id => catalog.items[id]), ...Object.values(catalog.items)]
const assets = [...new Set(records.filter(item => item.icon).map(item => item.icon.split('/').at(-1)))]
// Optional authoring dependency. Serving the checked-in thumbnails needs no image processor.
const sharp = process.argv.includes('--optimize') ? createRequire(import.meta.url)('sharp') : null
const featureIcon = catalog.items[initial.itemId].icon.split('/').at(-1)
const snapshot = catalog.sources[0].revision
const gameArt = 'https://assets.playnccdn.com/static-aion2-gamedata/resources/'
const repo = `https://raw.githubusercontent.com/SkeeveAN/Aion-DPS-Meter/${snapshot}/Client/assets/aion2/`
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const failures = []

async function thumbnail(bytes, name) {
  const size = name === featureIcon ? 256 : 128
  if (!sharp || (bytes[25] === 3 && bytes.readUInt32BE(16) <= size)) return bytes
  return sharp(bytes).resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .png({ palette: true, quality: 94, effort: 9 }).toBuffer()
}

async function save(name) {
  if (!/^[\w]+\.png$/.test(name)) throw new Error('Invalid icon filename')
  const path = join(output, name)
  try {
    const existing = await readFile(path)
    if (existing.subarray(0, 8).equals(png)) {
      const optimized = await thumbnail(existing, name)
      if (optimized !== existing) await writeFile(path, optimized)
      return
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  // The Global client and NC's image service occasionally use different filenames.
  const locations = [gameArt + name, repo + 'items/icons/' + name, repo + 'craft/icons/' + name]
  for (const url of locations) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) })
    if (response.status === 404 || response.status === 403) continue
    if (!response.ok) throw new Error(`Image service returned HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.subarray(0, 8).equals(png)) continue
    await writeFile(path, await thumbnail(bytes, name))
    return
  }
  failures.push(name)
}

const pending = [...assets]
await Promise.all(Array.from({ length: 4 }, async () => {
  while (pending.length) await save(pending.shift())
}))
if (failures.length) throw new Error(`Could not resolve ${failures.join(', ')}`)
console.log(`${assets.length} unique PNG icons available locally`)
