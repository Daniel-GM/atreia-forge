import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

// NC's dictionary sorts by grade, then ID. Read the categories used by Global recipes,
// and fetch the other NC locales only for pages that contain a requested item.
const snapshot = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url)))
const outputFile = new URL('./nc-items.json', import.meta.url)
const retrieved = new Date().toISOString().slice(0, 10)
const cache = join(tmpdir(), `forja-item-dictionary-${retrieved}`)
await mkdir(cache, { recursive: true })
const root = 'https://tw.ncsoft.com'
const locales = { 'zh-nc': 'zh-TW', 'en-nc': 'en-US', 'ko-nc': 'ko-KR' }
const categories = { 1: 'Equip_Weapon', 2: 'Equip_Armor', 3: 'Equip_Accessory', 5: 'Usable_001', 6: 'Misc_001' }
const groups = new Map()
const ids = Object.keys(snapshot.items)
const items = Object.fromEntries(ids.map(id => [id, {}]))
for (const id of ids) {
  const category = categories[id[0]]
  if (!category) throw new Error(`Unrecognized dictionary category for ${id}`)
  if (!groups.has(category)) groups.set(category, [])
  groups.get(category).push(Number(id))
}

let nextRequest = 0
async function json(url, cacheKey) {
  const path = join(cache, `${cacheKey}.json`)
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const when = Math.max(Date.now(), nextRequest)
  nextRequest = when + 270
  await delay(Math.max(0, when - Date.now()))
  const reply = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (reply.status === 404) return null
  if (!reply.ok) throw new Error(`Dictionary returned HTTP ${reply.status} (${cacheKey})`)
  const data = await reply.json()
  await writeFile(path, JSON.stringify(data))
  return data
}

function page(category, n, lang) {
  const url = new URL('/aion2_tw/v2.0/dict/search/item', root)
  const [primary, secondary] = category.split('~')
  const params = new URLSearchParams({ category1: primary, locale: locales[lang], page: n, size: 50 })
  if (secondary) params.set('category2', secondary)
  url.search = params
  return json(url, `${category}-${lang}-${n}`)
}

function record(row, lang) {
  const id = String(row.id)
  if (!items[id] || !row.name) return
  items[id][lang] = row.name
  if (row.image || row.icon) {
    const filename = new URL(row.image || row.icon).pathname.split('/').at(-1)
    if (/^[\w]+\.png$/.test(filename)) items[id].asset = filename.slice(0, -4)
  }
}

async function collect(category, number) {
  const data = await page(category, number, 'zh-nc')
  const content = data?.contents
  if (!Array.isArray(content)) throw new Error(`Invalid dictionary page ${number} in ${category}`)
  const relevant = content.filter(row => items[row.id])
  if (relevant.length) {
    for (const row of relevant) record(row, 'zh-nc')
    for (const lang of ['en-nc', 'ko-nc']) {
      const translated = await page(category, number, lang)
      for (const row of translated.contents) record(row, lang)
    }
  }
}

for (const [category, targets] of groups) {
  const sections = category === 'Usable_001'
    ? ['Potion', 'Food', 'Scroll', 'MagicStone'].map(section => category + '~' + section)
    : [category]
  for (const section of sections) {
    const first = await page(section, 1, 'zh-nc')
    let nextPage = 1
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (nextPage <= first.pagination.lastPage) await collect(section, nextPage++)
    }))
  }
  console.log(`${category}: ${targets.filter(id => items[id]['zh-nc']).length}/${targets.length}`)
}

// Some bound materials are absent from the searchable list but have a public definition.
for (const id of ids) {
  const missing = Object.keys(locales).filter(lang => !items[id][lang])
  for (const lang of missing) {
    const query = new URLSearchParams({ id, enchantLevel: '0', lang: locales[lang].slice(0, 2) })
    const data = await json(`${root}/aion2/api/gameconst/item?${query}`, `detail-${id}-${lang}`)
    if (data && String(data.id) === id) record(data, lang)
  }
}
await writeFile(outputFile, JSON.stringify({ retrieved, items }))
console.log(Object.fromEntries(Object.keys(locales).map(lang => [lang, ids.filter(id => items[id][lang]).length])))
