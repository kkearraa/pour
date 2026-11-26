// Guesses a cabinet category for an ingredient name.
// Used for the seed data (some old recipes had no category) and for
// brand-new ingredients that visitors type into the "Add your recipe" form.
const SPIRITS = ["gin", "vodka", "rum", "tequila", "mezcal", "bourbon", "whiskey", "whisky", "rye",
  "scotch", "brandy", "cognac", "pisco", "cachaça", "cachaca", "liqueur", "vermouth", "campari",
  "aperol", "sherry", "port", "lillet", "prosecco", "champagne", "wine", "absinthe", "amaro",
  "triple sec", "cointreau", "chartreuse", "sake", "soju"];
const SYRUPS = ["syrup", "agave", "nectar", "honey", "grenadine", "sugar", "orgeat", "cordial"];
const MIXERS = ["juice", "soda", "water", "ginger beer", "ginger ale", "tonic", "cola", "espresso",
  "coffee", "cream", "milk", "tea", "lemonade", "kombucha", "coconut"];

function hasWord(name, word) {
  return new RegExp(`(^|[^a-zà-ÿ])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ÿ]|$)`).test(name);
}

function categorize(name) {
  const n = String(name).toLowerCase();
  // Spirits first, so "coffee liqueur" or "coconut rum" are not filed as mixers
  if (SPIRITS.some(w => hasWord(n, w))) return "Spirits";
  if (SYRUPS.some(w => hasWord(n, w))) return "Syrups & Sweeteners";
  if (MIXERS.some(w => hasWord(n, w))) return "Juices & Mixers";
  return "Bitters & Extras";
}

module.exports = { categorize };
