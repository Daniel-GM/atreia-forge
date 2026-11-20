import { useMemo } from 'react';
import { fold, itemName } from './data.js';

export const matchesFaction = (recipe, faction) => !recipe.faction || faction === 'all' || recipe.faction === faction;
export const gameOrder = (a, b) => Number(a.mechanism === 'succession') - Number(b.mechanism === 'succession') || a.level - b.level || a.order - b.order || a.id.localeCompare(b.id);

export function useRecipeList(catalog, language, faction, profession, category, query) {
  const allRecipes = useMemo(() => catalog.recipes.filter(r => matchesFaction(r, faction)), [catalog, faction]);
  const counts = useMemo(() => allRecipes.reduce((acc, r) => { acc[r.profession] = (acc[r.profession] || 0) + 1; return acc; }, {}), [allRecipes]);
  const profRecipes = useMemo(() => allRecipes.filter(r => r.profession === profession).sort(gameOrder), [allRecipes, profession]);
  const categories = [...new Set(profRecipes.map(r => r.category))];
  const search = fold(query);
  const filtered = profRecipes.filter(r => (category === 'all' || r.category === category) && fold(itemName(catalog.items[r.itemId], language)).includes(search));
  return { allRecipes, counts, profRecipes, categories, filtered };
}
