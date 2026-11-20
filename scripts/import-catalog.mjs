import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Source tables are pinned together so recipe, item and localization IDs share a build.
const revision = '91c67327e7b6f9ecbe8afa56e216ff03336c54e8'
const repository = 'https://github.com/SkeeveAN/Aion-DPS-Meter'
const raw = `https://raw.githubusercontent.com/SkeeveAN/Aion-DPS-Meter/${revision}/`
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const sourceDir = process.env.FORJA_CATALOG_CACHE || join(tmpdir(), `forja-catalog-${revision}`)
const regionalPath = new URL('./nc-items.json', import.meta.url)
const tables = {
  recipes: 'Client/assets/aion2/craft/recipes.json',
  names: 'Client/assets/aion2/items/item_names.json',
  icons: 'Client/assets/aion2/items/item_icons.json',
  materialIcons: 'Client/assets/aion2/craft/item_icons.json',
  license: 'LICENSE',
}
const languages = ['en', 'de', 'fr', 'es', 'ru', 'pt', 'ja', 'ko']
const grades = [null, 'common', 'rare', 'epic', 'unique', 'heroic']
const professions = {
  Blacksmithing: 'blacksmithing', Tailoring: 'armorsmithing',
  Jewelcrafting: 'handicrafting', Alchemy: 'alchemy', Cooking: 'cooking',
}
const categories = {
  Greatsword: 'greatsword', Sword: 'longsword', Dagger: 'dagger', Mace: 'mace', Guarder: 'guard',
  Helmet: 'helm', Shoulder: 'pauldrons', Torso: 'breastplate', Pants: 'greaves',
  Gloves: 'gloves', Boots: 'boots', Cape: 'cloak', Bow: 'bow', Staff: 'staff', Necklace: 'necklace',
  Earring: 'earrings', Ring: 'ring', Bracelet: 'bracelet', Magicbook: 'spellbook', Orb: 'orb',
  Potion: 'potion', Scroll: 'scroll', Food: 'food',
}

async function sourceFile(key) {
  const cacheFile = join(sourceDir, `${key}.txt`)
  try {
    return await readFile(cacheFile, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const response = await fetch(raw + tables[key], { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Could not load ${tables[key]} (HTTP ${response.status})`)
  const text = await response.text()
  await writeFile(cacheFile, text)
  return text
}

await mkdir(sourceDir, { recursive: true })
const entries = await Promise.all(Object.keys(tables).map(async key => {
  const text = await sourceFile(key)
  return [key, key === 'license' ? text : JSON.parse(text)]
}))
const source = Object.fromEntries(entries)
const all = new Map(source.recipes.recipes.map(recipe => [recipe.id, recipe]))
const regional = JSON.parse(await readFile(regionalPath, 'utf8'))
const iconIndex = { ...source.icons, ...source.materialIcons }
const items = {}
const recipes = []

function register(id) {
  const key = String(id)
  if (items[key]) return key
  const row = source.names[key]
  if (!row || !grades[row[0]]) throw new Error(`Missing item name or grade for ${id}`)
  if (!row[1]) throw new Error(`Missing base name for ${id}`)
  const names = Object.fromEntries(languages.map((lang, index) => [lang, row[index + 1] || row[1]]))
  const nc = regional.items[key]
  for (const lang of ['en-nc', 'ko-nc', 'zh-nc']) {
    if (nc?.[lang]) names[lang] = nc[lang]
  }
  names['en-nc'] ??= names.en
  names['ko-nc'] ??= names.ko
  // The Global Balaur's Essence has no numeric match in the Taiwan dictionary.
  // NC publishes its Traditional Chinese name in the regional update and material guide.
  if (key === '600590001') names['zh-nc'] ??= '龍族精髓'
  const asset = iconIndex[key] || nc?.asset
  if (!asset || !/^[A-Za-z0-9_]+$/.test(asset)) throw new Error(`Missing or invalid asset name for ${id}`)
  items[key] = { id: key, names, grade: grades[row[0]], icon: `/items/${asset}.png` }
  return key
}

function category(row, item) {
  if (row.tab.startsWith('Misc_') || row.learn === 'Advancement') return 'material'
  if (row.tab === 'MagicStone') return item.names.en.includes('Soulstone') ? 'soulstone' : 'manastone'
  if (!categories[row.tab]) throw new Error(`Unknown category ${row.tab} on ${row.id}`)
  return categories[row.tab]
}

for (const row of all.values()) {
  // A Combo record describes a possible output of another recipe. It has no inputs of its own.
  if (row.learn === 'Combo') continue
  if (!row.k.length || !professions[row.cat] || !['D', 'L'].includes(row.race)) {
    throw new Error(`Unrecognized recipe ${row.id}`)
  }
  const itemId = register(row.p)
  const materials = row.k.map(([id, quantity, options]) => {
    const material = { itemId: register(id), quantity }
    if (options?.length) {
      material.alternatives = options.map(([other, amount]) => ({ itemId: register(other), quantity: amount }))
    }
    return material
  })
  const outcome = all.get(row.cr)
  if (row.combo && !outcome) throw new Error(`Missing combo for ${row.id}`)
  recipes.push({
    id: String(row.id), itemId, profession: professions[row.cat],
    category: category(row, items[itemId]), level: row.lv, order: row.order,
    faction: row.race === 'L' ? 'elyos' : 'asmodian',
    mechanism: row.type === 'Succession' ? 'succession' : 'craft',
    yield: row.n, materials,
    combo: outcome ? { itemId: register(outcome.p), chance: row.combo / 100, quantity: outcome.n } : null,
  })
}
recipes.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
const catalog = {
  defaultRecipeId: '111066001',
  sources: [
    { name: 'Aion DPS Meter · Global client', url: `${repository}/tree/${revision}/Client/assets/aion2`, revision },
    { name: 'NCSOFT Taiwan item dictionary', url: 'https://tw.ncsoft.com/aion2_tw/v2.0/dict/search/item?locale=zh-TW&page=1&size=1', retrieved: regional.retrieved },
    { name: 'Balaur’s Essence · NCSOFT Taiwan', url: 'https://lounge.plaync.com/feed/78922?country=TW&locale=zh-TW' },
    { name: 'AION 2 game data and artwork © NCSOFT', url: 'https://aion2.plaync.com/' },
  ],
  items, recipes,
}
await mkdir(join(publicDir, 'data'), { recursive: true })
await writeFile(join(publicDir, 'data', 'catalog.json'), JSON.stringify(catalog))
await writeFile(join(publicDir, 'data', 'NOTICE.txt'), `AION 2 game data, localizations and artwork © NCSOFT Corporation.\n\nGlobal client records adapted from ${repository} at ${revision}.\n\n${source.license}`)
console.log(`${recipes.length} recipes, ${Object.keys(items).length} item records`)
