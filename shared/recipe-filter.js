export const matchesFaction = (recipe, faction) => !recipe.faction || faction === 'all' || recipe.faction === faction;
export const isBound = item => /\(Bound\)$/i.test(item?.names?.en || '');

export function saleRecipes(catalog, faction) {
  return catalog.recipes.filter(recipe => recipe.mechanism === 'craft' && matchesFaction(recipe, faction) &&
    (!isBound(catalog.items[recipe.itemId]) || (recipe.combo && !isBound(catalog.items[recipe.combo.itemId]))));
}
