document.addEventListener("DOMContentLoaded", () => {

  // 1. GLOBAL STATE, FAVORITES & CONVERSIONS
  let currentUnit = "ml"; // 'oz', 'ml', 'cl'
  const CONVERSIONS = { oz: 1, ml: 30, cl: 3 };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  const oldFavs = store.get("sipLogicFavorites");
  if (oldFavs) {
    store.set("pour_favorites", oldFavs);
    store.remove("sipLogicFavorites");
  }

  let favorites = [];
  try {
    const parsed = JSON.parse(store.get("pour_favorites") || "[]");
    if (Array.isArray(parsed)) favorites = parsed;
  } catch (e) {
    favorites = []; 
  }

  function toggleFavorite(drinkName) {
    if (favorites.includes(drinkName)) {
      favorites = favorites.filter(name => name !== drinkName);
    } else {
      favorites.push(drinkName);
    }
    store.set("pour_favorites", JSON.stringify(favorites));
    renderActivePage();
  }

  async function copyShoppingList(ingredientName) {
    const text = `Shopping List Item: ${ingredientName}`;
    let copied = false;

   
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (e) { copied = false; }

  
    if (!copied) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e) { copied = false; }
    }

    alert(copied
      ? `Copied "${ingredientName}" to clipboard!`
      : `Couldn't copy automatically. Shopping list item: ${ingredientName}`);
  }

  const unitBtn = document.getElementById("unit-toggle");
  const servingsInput = document.getElementById("servings-input");


  function getServings() {
    const n = parseFloat(servingsInput ? servingsInput.value : 1);
    if (!Number.isFinite(n)) return 1;
    return Math.min(12, Math.max(1, n));
  }
  if (servingsInput) {
    servingsInput.addEventListener("change", () => { servingsInput.value = getServings(); });
  }


  function formatAmount(value) {
    return String(parseFloat(value.toFixed(2)));
  }


  // 2. THEME TOGGLE
  // The small script in each page's <head> already set the theme before the page was
  // drawn (so there is no dark flash). This repeats the same choice: the saved theme,
  // or on a first visit the device's own light/dark setting.
  const themeToggleBtn = document.getElementById("theme-toggle");
  const storedTheme = store.get("theme");
  const systemPrefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  const savedTheme = (storedTheme === "light" || storedTheme === "dark")
    ? storedTheme
    : (systemPrefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.textContent = savedTheme === "dark" ? "☀️ Light" : "🌙 Dark";
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      store.set("theme", newTheme);
      themeToggleBtn.textContent = newTheme === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  }


  // 3. RESPONSIVE HAMBURGER NAVIGATION
  const hamburger = document.getElementById("hamburger-btn");
  const navMenu = document.getElementById("nav-menu");
  if (hamburger && navMenu) {
    const setMenu = (open) => {
      navMenu.classList.toggle("active", open);
      hamburger.setAttribute("aria-expanded", open ? "true" : "false");
    };
    setMenu(false);

    hamburger.addEventListener("click", () => setMenu(!navMenu.classList.contains("active")));
    navMenu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

    document.addEventListener("click", (e) => {
      if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) setMenu(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", () => { if (window.innerWidth > 960) setMenu(false); });
  }


  // 4. RECIPE DATABASES
  const recipeDatabase = [
    {
      id: 1,
      name: "Margarita",
      tagline: "Crisp & Citrusy",
      image: "images/margarita.webp",
      flavorProfile: "sour",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Salt rim & lime wheel",
      ice: "Cubed ice",
      altText: "Margarita in a salt-rimmed coupe glass with a lime wedge, on a wooden table",
      ingredients: [
        { name: "tequila", oz: 2, category: "Spirits" },
        { name: "lime juice", oz: 1, category: "Juices & Mixers" },
        { name: "triple sec", oz: 0.75, category: "Spirits" }
      ],
      instructions: [
        "Rub a lime wedge around the rim of the glass and dip in coarse salt.",
        "Combine tequila, lime juice, and triple sec in a shaker filled with ice.",
        "Shake vigorously for 15 seconds.",
        "Strain into the rimmed glass filled with fresh ice and garnish with lime."
      ]
    },
    {
      id: 2,
      name: "Old Fashioned",
      tagline: "Bold & Timeless",
      image: "images/old-fashioned.webp",
      flavorProfile: "strong",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange peel",
      ice: "Large single cube",
      altText: "Old Fashioned on ice in a rocks glass with an orange peel twist",
      ingredients: [
        { name: "bourbon", oz: 2, category: "Spirits" },
        { name: "simple syrup", oz: 0.25, category: "Syrups & Sweeteners" },
        { name: "angostura bitters", oz: 0.05, category: "Bitters & Extras" }
      ],
      instructions: [
        "Add simple syrup and bitters into a glass.",
        "Add bourbon and fill glass with ice.",
        "Stir gently for 30 seconds until chilled.",
        "Express essential oils from orange peel over drink and place on top."
      ]
    },
    {
      id: 3,
      name: "Espresso Martini",
      tagline: "Rich & Energizing",
      image: "images/espresso-martini.webp",
      flavorProfile: "sweet",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "3 Espresso beans",
      ice: "None (Chilled)",
      altText: "Espresso Martini with a creamy foam top and coffee beans, in a coupe glass",
      ingredients: [
        { name: "vodka", oz: 2, category: "Spirits" },
        { name: "coffee liqueur", oz: 1, category: "Spirits" },
        { name: "fresh espresso", oz: 1, category: "Juices & Mixers" }
      ],
      instructions: [
        "Brew fresh espresso and allow it to cool slightly.",
        "Add vodka, coffee liqueur, and espresso to a shaker filled with ice.",
        "Shake hard to create a rich, silky foam.",
        "Fine strain into a chilled coupe glass and top with 3 coffee beans."
      ]
    },
    {
      id: 4,
      name: "Mojito",
      tagline: "Refreshing & Minty",
      image: "images/mojito.webp",
      flavorProfile: "refreshing",
      glass: "Highball Glass",
      method: "Muddled & Built",
      garnish: "Fresh mint sprig",
      ice: "Crushed ice",
      altText: "Mojito in a tall glass with crushed ice, fresh mint, lime wheels and straws",
      ingredients: [
        { name: "white rum", oz: 2, category: "Spirits" },
        { name: "lime juice", oz: 1, category: "Juices & Mixers" },
        { name: "simple syrup", oz: 0.75, category: "Syrups & Sweeteners" },
        { name: "fresh mint", oz: 0.1, category: "Bitters & Extras" },
        { name: "soda water", oz: 2, category: "Juices & Mixers" }
      ],
      instructions: [
        "Lightly muddle mint leaves with simple syrup and lime juice in the glass.",
        "Add white rum and fill half the glass with crushed ice.",
        "Stir thoroughly, top with soda water and more crushed ice.",
        "Garnish with a slapped mint sprig."
      ]
    },
    {
      id: 5,
      name: "Whiskey Sour",
      tagline: "Smooth & Tart",
      image: "images/whiskey-sour.webp",
      flavorProfile: "sour",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Lemon wheel & Angostura drops",
      ice: "Cubed ice",
      altText: "Frothy Whiskey Sour on ice, garnished with an orange slice and a cherry",
      ingredients: [
        { name: "bourbon", oz: 2, category: "Spirits" },
        { name: "lemon juice", oz: 0.75, category: "Juices & Mixers" },
        { name: "simple syrup", oz: 0.75, category: "Syrups & Sweeteners" }
      ],
      instructions: [
        "Combine bourbon, lemon juice, and simple syrup in a cocktail shaker.",
        "Fill with ice and shake hard for 15 seconds.",
        "Strain into a rocks glass over ice.",
        "Garnish with a lemon wheel."
      ]
    },
    {
      id: 6,
      name: "Negroni",
      tagline: "Bittersweet & Herbal",
      image: "images/negroni.webp",
      flavorProfile: "bitter",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange slice",
      ice: "Large single cube",
      altText: "Deep red Negroni over a large ice cube with an orange peel garnish",
      ingredients: [
        { name: "gin", oz: 1, category: "Spirits" },
        { name: "campari", oz: 1, category: "Spirits" },
        { name: "sweet vermouth", oz: 1, category: "Spirits" }
      ],
      instructions: [
        "Add gin, Campari, and sweet vermouth into a mixing glass with ice.",
        "Stir until well-chilled.",
        "Strain into a rocks glass over fresh ice.",
        "Garnish with an orange slice."
      ]
    },
    {
      id: 7,
      name: "Daiquiri",
      tagline: "Simple & Elegant",
      image: "images/daiquiri.webp",
      flavorProfile: "sour",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "None (Chilled)",
      altText: "Pale Daiquiri in a coupe glass with a lime wheel, fresh limes beside it",
      ingredients: [
        { name: "white rum", oz: 2, category: "Spirits" },
        { name: "lime juice", oz: 1, category: "Juices & Mixers" },
        { name: "simple syrup", oz: 0.75, category: "Syrups & Sweeteners" }
      ],
      instructions: [
        "Add white rum, lime juice, and simple syrup into a shaker with ice.",
        "Shake hard until chilled.",
        "Fine strain into a coupe glass and garnish with a lime wheel."
      ]
    },
    {
      id: 8,
      name: "Aperol Spritz",
      tagline: "Light & Effervescent",
      image: "images/aperol-spritz.webp",
      flavorProfile: "refreshing",
      glass: "Wine Glass",
      method: "Built in glass",
      garnish: "Orange slice",
      ice: "Cubed ice",
      altText: "Bright orange Aperol Spritz with ice and an orange slice in a wine glass",
      ingredients: [
        { name: "prosecco", oz: 3, category: "Spirits" },
        { name: "aperol", oz: 2, category: "Spirits" },
        { name: "soda water", oz: 1, category: "Juices & Mixers" }
      ],
      instructions: [
        "Fill a large wine glass with ice.",
        "Pour Prosecco followed by Aperol.",
        "Add a splash of soda water and stir gently.",
        "Garnish with an orange slice."
      ]
    },
    {
      id: 9,
      name: "Dry Martini",
      tagline: "Clean & Sophisticated",
      image: "images/dry-martini.webp",
      flavorProfile: "strong",
      glass: "Martini Glass",
      method: "Stirred",
      garnish: "Green olive or lemon twist",
      ice: "None (Chilled)",
      altText: "Dry Martini in a classic cocktail glass with green olives on a pick",
      ingredients: [
        { name: "gin", oz: 2.5, category: "Spirits" },
        { name: "dry vermouth", oz: 0.5, category: "Spirits" }
      ],
      instructions: [
        "Combine gin and dry vermouth in a mixing glass with ice.",
        "Stir for 30 seconds until ice cold.",
        "Strain into a chilled martini glass.",
        "Garnish with an olive or lemon twist."
      ]
    }
  ];

  // Low & Zero-ABV Database
  const lowAbvDatabase = [
    {
      id: 101,
      name: "Zero-Proof Paloma",
      tagline: "Tart & Fizzy",
      image: "images/paloma-zero-proof.webp",
      type: "zero",
      abvText: "0% ABV",
      glass: "Highball Glass",
      method: "Built in glass",
      garnish: "Grapefruit wedge & salt rim",
      ice: "Cubed ice",
      altText: "Pink grapefruit Paloma with a salt rim, crushed ice and a grapefruit wedge",
      ingredients: [
        { name: "fresh grapefruit juice", oz: 2 },
        { name: "fresh lime juice", oz: 0.5 },
        { name: "agave syrup", oz: 0.5 },
        { name: "sparkling water", oz: 3 }
      ],
      instructions: [
        "Salt the rim of a tall highball glass.",
        "Stir grapefruit juice, lime juice, and agave syrup with ice.",
        "Top with sparkling water and garnish with grapefruit."
      ]
    },
    {
      id: 102,
      name: "Americano",
      tagline: "Classic Italian Aperitivo",
      image: "images/americano.webp",
      type: "low",
      abvText: "~8% ABV",
      glass: "Highball Glass",
      method: "Built in glass",
      garnish: "Orange wedge",
      ice: "Cubed ice",
      altText: "Red Americano on ice with orange slices, next to a bottle of Campari",
      ingredients: [
        { name: "campari", oz: 1.5 },
        { name: "sweet vermouth", oz: 1.5 },
        { name: "soda water", oz: 3 }
      ],
      instructions: [
        "Fill a highball glass with ice.",
        "Pour Campari and sweet vermouth over ice.",
        "Top with soda water and garnish with an orange wedge."
      ]
    },
    {
      id: 103,
      name: "Virgin Mojito",
      tagline: "Crisp & Herbaceous",
      image: "images/virgin-mojito.webp",
      type: "zero",
      abvText: "0% ABV",
      glass: "Highball Glass",
      method: "Muddled",
      garnish: "Mint sprig & lime wheel",
      ice: "Crushed ice",
      altText: "Virgin Mojito with ice, a mint sprig and a lime slice, fresh limes around it",
      ingredients: [
        { name: "fresh lime juice", oz: 1 },
        { name: "simple syrup", oz: 0.75 },
        { name: "fresh mint leaves", oz: 0.1 },
        { name: "soda water", oz: 4 }
      ],
      instructions: [
        "Lightly muddle mint leaves with simple syrup and lime juice in a highball glass.",
        "Fill glass with crushed ice.",
        "Top with soda water and stir well.",
        "Garnish with a mint sprig."
      ]
    },
    {
      id: 104,
      name: "Lillet Highball",
      tagline: "Light, Floral & Refreshing",
      image: "images/lillet-highball.webp",
      type: "low",
      abvText: "~5% ABV",
      glass: "Highball Glass",
      method: "Built in glass",
      garnish: "Cucumber ribbon & mint",
      ice: "Cubed ice",
      altText: "Pale green Lillet Highball in a tall glass with cucumber slices and mint",
      ingredients: [
        { name: "lillet blanc", oz: 2 },
        { name: "tonic water", oz: 4 },
        { name: "cucumber wheel", oz: 0.1 }
      ],
      instructions: [
        "Fill a highball glass with ice cubes.",
        "Pour Lillet Blanc and top with tonic water.",
        "Stir gently and garnish with cucumber and mint."
      ]
    },
    {
      id: 105,
      name: "Cucumber Ginger Fizz",
      tagline: "Zesty & Botanical",
      image: "images/cucumber-ginger-fizz.webp",
      type: "zero",
      abvText: "0% ABV",
      glass: "Highball Glass",
      method: "Muddled & Built",
      garnish: "Cucumber slice",
      ice: "Cubed ice",
      altText: "Cucumber Ginger Fizz in a tall cut-crystal glass with cucumber and lime, on a bar",
      ingredients: [
        { name: "muddled cucumber", oz: 1 },
        { name: "fresh lime juice", oz: 0.75 },
        { name: "ginger beer", oz: 4 }
      ],
      instructions: [
        "Muddle cucumber slices with lime juice in shaker.",
        "Strain into a highball glass over ice.",
        "Top with ginger beer and garnish with cucumber."
      ]
    },
    {
      id: 106,
      name: "Sherry Cobbler",
      tagline: "Fruity & Nutty Classic",
      image: "images/sherry-cobbler.webp",
      type: "low",
      abvText: "~9% ABV",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Fresh berries & mint",
      ice: "Crushed ice",
      altText: "Sherry Cobbler over crushed ice, topped with berries, orange and mint",
      ingredients: [
        { name: "fino sherry", oz: 3 },
        { name: "simple syrup", oz: 0.5 },
        { name: "orange slices", oz: 0.5 }
      ],
      instructions: [
        "Muddle orange slices and simple syrup in shaker.",
        "Add Fino Sherry and ice; shake well.",
        "Strain into a glass packed with crushed ice.",
        "Garnish lavishly with fresh berries."
      ]
    }
  ];

  // Minimalist (3-Ingredient) Database
  const minimalistDatabase = [
    {
      id: 201,
      name: "Negroni",
      baseSpirit: "gin",
      tagline: "Bittersweet Perfection",
      image: "images/negroni.webp",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange peel",
      ice: "Large ice cube",
      altText: "Deep red Negroni over a large ice cube with an orange peel garnish",
      ingredients: [
        { name: "gin", oz: 1 },
        { name: "campari", oz: 1 },
        { name: "sweet vermouth", oz: 1 }
      ],
      instructions: [
        "Combine gin, Campari, and sweet vermouth in a glass.",
        "Add ice and stir gently until ice cold.",
        "Garnish with orange."
      ]
    },
    {
      id: 202,
      name: "Old Fashioned",
      baseSpirit: "bourbon",
      tagline: "Whiskey Classic",
      image: "images/old-fashioned.webp",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange peel",
      ice: "Large single cube",
      altText: "Old Fashioned on ice in a rocks glass with an orange peel twist",
      ingredients: [
        { name: "bourbon", oz: 2 },
        { name: "simple syrup", oz: 0.25 },
        { name: "angostura bitters", oz: 0.05 }
      ],
      instructions: [
        "Combine simple syrup, bitters, and bourbon in a glass over ice.",
        "Stir well until chilled.",
        "Garnish with orange peel."
      ]
    },
    {
      id: 203,
      name: "Daiquiri",
      baseSpirit: "rum",
      tagline: "Rum, Lime & Sweetness",
      image: "images/daiquiri.webp",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "None (Chilled)",
      altText: "Pale Daiquiri in a coupe glass with a lime wheel, fresh limes beside it",
      ingredients: [
        { name: "white rum", oz: 2 },
        { name: "lime juice", oz: 1 },
        { name: "simple syrup", oz: 0.75 }
      ],
      instructions: [
        "Shake rum, lime juice, and simple syrup with ice.",
        "Strain into a coupe glass.",
        "Garnish with lime."
      ]
    },
    {
      id: 204,
      name: "Tommy's Margarita",
      baseSpirit: "tequila",
      tagline: "Pure Agave & Lime",
      image: "images/tommys-margarita.webp",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "Cubed ice",
      altText: "Tommy's Margarita on the rocks in a salt-rimmed glass with a lime wheel",
      ingredients: [
        { name: "reposado tequila", oz: 2 },
        { name: "fresh lime juice", oz: 1 },
        { name: "agave nectar", oz: 0.5 }
      ],
      instructions: [
        "Shake tequila, lime juice, and agave nectar with ice.",
        "Strain into a rocks glass over fresh ice.",
        "Garnish with lime."
      ]
    },
    {
      id: 205,
      name: "Moscow Mule",
      baseSpirit: "vodka",
      tagline: "Spicy & Crisp",
      image: "images/moscow-mule.webp",
      glass: "Copper Mug",
      method: "Built in mug",
      garnish: "Lime wedge",
      ice: "Cubed ice",
      altText: "Moscow Mule in a copper mug with ice and lime wedges",
      ingredients: [
        { name: "vodka", oz: 2 },
        { name: "lime juice", oz: 0.5 },
        { name: "ginger beer", oz: 4 }
      ],
      instructions: [
        "Fill copper mug with ice.",
        "Add vodka and lime juice, then top with ginger beer.",
        "Stir gently and garnish with lime wedge."
      ]
    },
    {
      id: 206,
      name: "Gimlet",
      baseSpirit: "gin",
      tagline: "Sharp & Citrus-Forward",
      image: "images/gimlet.webp",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "None (Chilled)",
      altText: "Gin Gimlet in a coupe glass with a lime wheel on the rim",
      ingredients: [
        { name: "gin", oz: 2 },
        { name: "lime juice", oz: 0.75 },
        { name: "simple syrup", oz: 0.75 }
      ],
      instructions: [
        "Combine gin, lime juice, and simple syrup in shaker with ice.",
        "Shake well and strain into a chilled glass.",
        "Garnish with lime wheel."
      ]
    }
  ];

  function toggleUnit() {
    if (currentUnit === "oz") currentUnit = "ml";
    else if (currentUnit === "ml") currentUnit = "cl";
    else currentUnit = "oz";

    if (unitBtn) unitBtn.textContent = currentUnit.toUpperCase();
  }

  function findDrinkById(id) {
    const key = String(id);
    return recipeDatabase.find(d => String(d.id) === key) ||
           lowAbvDatabase.find(d => String(d.id) === key) ||
           minimalistDatabase.find(d => String(d.id) === key);
  }

  // WHICH PAGE EACH DRINK LIVES ON (used for "Also try" links)
  function pageForDrink(drink) {
    if (recipeDatabase.includes(drink)) return "index.html";
    if (lowAbvDatabase.includes(drink)) return "low-abv.html";
    return "minimalist.html";
  }

  // "ALSO TRY" SUGGESTIONS: drink id -> ids of related drinks (they can be on other pages)
  const RELATED_DRINKS = {
    1: [204, 7],      // Margarita -> Tommy's Margarita, Daiquiri
    2: [5, 6],        // Old Fashioned -> Whiskey Sour, Negroni
    3: [9, 2],        // Espresso Martini -> Dry Martini, Old Fashioned
    4: [103, 7],      // Mojito -> Virgin Mojito, Daiquiri
    5: [2, 1],        // Whiskey Sour -> Old Fashioned, Margarita
    6: [102, 8],      // Negroni -> Americano, Aperol Spritz
    7: [4, 206],      // Daiquiri -> Mojito, Gimlet
    8: [102, 104],    // Aperol Spritz -> Americano, Lillet Highball
    9: [206, 3],      // Dry Martini -> Gimlet, Espresso Martini
    101: [1, 103],    // Zero-Proof Paloma -> Margarita, Virgin Mojito
    102: [6, 8],      // Americano -> Negroni, Aperol Spritz
    103: [4, 105],    // Virgin Mojito -> Mojito, Cucumber Ginger Fizz
    104: [8, 105],    // Lillet Highball -> Aperol Spritz, Cucumber Ginger Fizz
    105: [205, 103],  // Cucumber Ginger Fizz -> Moscow Mule, Virgin Mojito
    106: [102, 8],    // Sherry Cobbler -> Americano, Aperol Spritz
    201: [102, 8],    // Negroni (3-ingredient) -> Americano, Aperol Spritz
    202: [5, 6],      // Old Fashioned (3-ingredient) -> Whiskey Sour, Negroni
    203: [4, 206],    // Daiquiri (3-ingredient) -> Mojito, Gimlet
    204: [1, 101],    // Tommy's Margarita -> Margarita, Zero-Proof Paloma
    205: [105, 4],    // Moscow Mule -> Cucumber Ginger Fizz, Mojito
    206: [7, 9]       // Gimlet -> Daiquiri, Dry Martini
  };

  // OFFICIAL RECIPES from the International Bartenders Association (external, credible source)
  const IBA = "https://iba-world.com/iba-cocktail/";
  const IBA_LINKS = {
    "Margarita": { url: IBA + "margarita/" },
    "Old Fashioned": { url: IBA + "old-fashioned/" },
    "Espresso Martini": { url: IBA + "espresso-martini/" },
    "Mojito": { url: IBA + "mojito/" },
    "Whiskey Sour": { url: IBA + "whiskey-sour/" },
    "Negroni": { url: IBA + "negroni/" },
    "Daiquiri": { url: IBA + "daiquiri/" },
    "Aperol Spritz": { url: IBA + "spritz/" },
    "Dry Martini": { url: IBA + "dry-martini/" },
    "Americano": { url: IBA + "americano/" },
    "Sherry Cobbler": { url: IBA + "sherry-cobbler/" },
    "Tommy's Margarita": { url: IBA + "tommys-margarita/" },
    "Moscow Mule": { url: IBA + "moscow-mule/" },
    // Alcohol-free versions link to the classic they are based on
    "Zero-Proof Paloma": { url: IBA + "paloma/", label: "Classic Paloma recipe (IBA)" },
    "Virgin Mojito": { url: IBA + "mojito/", label: "Classic Mojito recipe (IBA)" }
  };

  // FLOAT-IN REVEAL
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const revealObserver = (!prefersReducedMotion && "IntersectionObserver" in window)
    ? new IntersectionObserver((entries) => {
        entries.filter(entry => entry.isIntersecting).forEach((entry, i) => {
          const card = entry.target;
          card.style.setProperty("--reveal-delay", `${Math.min(i, 5) * 90}ms`);
          card.classList.add("is-visible");
          const grid = card.parentElement;
          if (grid && grid._seen) grid._seen.add(card.getAttribute("data-drink-id"));
          revealObserver.unobserve(card);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" })
    : null;


  function setGrid(container, html) {
    if (!container) return;
    const seen = container._seen || (container._seen = new Set());

    if (revealObserver) {
      container.querySelectorAll(".cocktail-card").forEach(c => revealObserver.unobserve(c));
    }
    container.innerHTML = html;

    // The grid now has its cards, so it no longer needs the reserved space (see style.css)
    const firstRender = !container.classList.contains("is-rendered");
    container.classList.add("is-rendered");

    const cards = container.querySelectorAll(".cocktail-card");
    if (!cards.length) { seen.clear(); return; } 

    cards.forEach(card => {
      const id = card.getAttribute("data-drink-id");
      if (!revealObserver || seen.has(id)) {
        card.classList.remove("reveal"); 
      } else if (firstRender && card.getBoundingClientRect().top < window.innerHeight) {
        // Cards already on screen when the page opens get a quick float-in, so the main
        // photo shows sooner (faster LCP). Cards further down keep the slower effect.
        card.classList.add("reveal-quick", "is-visible");
        seen.add(id);
      } else {
        revealObserver.observe(card);
      }
    });
  }

  function resetReveals(container) {
    if (container && container._seen) container._seen.clear();
  }

  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img && img.classList && img.classList.contains("card-img")) {
      const wrap = img.closest(".card-image-wrapper");
      if (wrap) {
        wrap.classList.add("img-missing");
        wrap.setAttribute("role", "img");
        wrap.setAttribute("aria-label", img.alt || "");
      }
      img.remove();
    }
  }, true);


  // MODAL POPUP LOGIC
  const modal = document.getElementById("recipe-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  let lastFocusedEl = null;

  if (modal) {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
  }

  function openModal(drink) {
    if (!modal || !drink) return;

    const servings = getServings();

    document.getElementById("modal-title").textContent = drink.name;
    document.getElementById("modal-tagline").textContent = drink.tagline;
    document.getElementById("modal-glass").textContent = drink.glass || "Standard Glass";
    document.getElementById("modal-method").textContent = drink.method || "Mixed";
    document.getElementById("modal-garnish").textContent = drink.garnish || "Optional";
    document.getElementById("modal-ice").textContent = drink.ice || "Cubed ice";

    const ingList = document.getElementById("modal-ingredients");
    ingList.innerHTML = drink.ingredients.map(ing => {
      const val = ing.oz * CONVERSIONS[currentUnit] * servings;
      return `<li><strong>${formatAmount(val)} ${currentUnit}</strong> — ${ing.name}</li>`;
    }).join("");

    const instList = document.getElementById("modal-instructions");
    if (drink.instructions) {
      instList.innerHTML = drink.instructions.map(step => `<li>${step}</li>`).join("");
    } else {
      instList.innerHTML = "<li>Combine ingredients with ice, mix well, strain or serve cold.</li>";
    }

    renderModalExtras(drink);

    // Only remember where focus was the first time (an "Also try" link reuses the open popup)
    if (!modal.classList.contains("active")) lastFocusedEl = document.activeElement;
    const content = modal.querySelector(".modal-content");
    if (content) content.scrollTop = 0;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden"; 
    if (modalCloseBtn) modalCloseBtn.focus();
  }

  // "Also try" links + official IBA recipe link at the bottom of the popup
  function renderModalExtras(drink) {
    const content = modal.querySelector(".modal-content");
    if (!content) return;
    let extras = document.getElementById("modal-extras");
    if (!extras) {
      extras = document.createElement("div");
      extras.id = "modal-extras";
      extras.className = "modal-extras";
      content.appendChild(extras);
    }

    const related = (RELATED_DRINKS[drink.id] || []).map(findDrinkById).filter(Boolean);
    const relatedHTML = related.length ? `
      <h3>Also try</h3>
      <ul class="also-try-list">
        ${related.map(r => `
          <li><a href="${pageForDrink(r)}#drink-${r.id}" class="also-try-link">
            <span class="also-try-name">${r.name}</span>
            <span class="also-try-tagline">${r.tagline}</span>
          </a></li>`).join("")}
      </ul>` : "";

    const iba = IBA_LINKS[drink.name];
    const ibaHTML = iba ? `
      <p class="source-link">
        <a href="${iba.url}" target="_blank" rel="noopener">${iba.label || `Official ${drink.name} recipe (IBA)`} ↗</a>
        <span>from the International Bartenders Association</span>
      </p>` : "";

    extras.innerHTML = relatedHTML + ibaHTML;
  }

  // Open a drink from a link like "low-abv.html#drink-103" (used by "Also try")
  function openDrinkFromHash() {
    const match = window.location.hash.match(/^#drink-(\d+)$/);
    if (!match) return;
    const drink = findDrinkById(match[1]);
    if (drink) openModal(drink);
  }
  window.addEventListener("hashchange", openDrinkFromHash);

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    // Remove "#drink-…" from the address so the popup doesn't reopen on refresh
    if (/^#drink-\d+$/.test(window.location.hash) && window.history && history.replaceState) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (lastFocusedEl && document.contains(lastFocusedEl)) lastFocusedEl.focus();
    lastFocusedEl = null;
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }


  document.addEventListener("click", (e) => {
    const favBtn = e.target.closest(".fav-btn");
    if (favBtn) {
      toggleFavorite(favBtn.getAttribute("data-name"));
      return;
    }

    const shopBtn = e.target.closest(".btn-shopping");
    if (shopBtn) {
      copyShoppingList(shopBtn.getAttribute("data-missing"));
      return;
    }

    const card = e.target.closest(".cocktail-card");
    if (card) {
      const drinkObj = findDrinkById(card.getAttribute("data-drink-id"));
      if (drinkObj) openModal(drinkObj);
    }
  });


  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closeModal();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") &&
        e.target.classList && e.target.classList.contains("cocktail-card")) {
      e.preventDefault();
      const drinkObj = findDrinkById(e.target.getAttribute("data-drink-id"));
      if (drinkObj) openModal(drinkObj);
    }
  });


  // Real widths of the full-size photos (used in srcset so the browser picks the right file).
  // Every photo also has a 400px version named like "margarita-400.webp".
  const IMAGE_WIDTHS = {
    "americano": 780,
    "aperol-spritz": 800,
    "cucumber-ginger-fizz": 800,
    "daiquiri": 467,
    "dry-martini": 800,
    "espresso-martini": 800,
    "gimlet": 800,
    "lillet-highball": 800,
    "margarita": 800,
    "mojito": 800,
    "moscow-mule": 683,
    "negroni": 800,
    "old-fashioned": 704,
    "paloma-zero-proof": 800,
    "sherry-cobbler": 800,
    "tommys-margarita": 720,
    "virgin-mojito": 800,
    "whiskey-sour": 800
  };
  function imageWidthFor(cocktail) {
    const file = (cocktail.image || "").split("/").pop().replace(/\.webp$/, "");
    return IMAGE_WIDTHS[file] || null;
  }

  // Builds the <img> for a card.
  // - srcset offers a 400px and a full-size version; the browser picks the one the screen needs.
  // - The first cards on a page load right away (they are what visitors see first, LCP);
  //   cards further down load lazily when they scroll into view.
  function cardImageHTML(cocktail, index) {
    const alt = (cocktail.altText || cocktail.name).replace(/^Image of /i, "");

    // No photo for this drink: show the placeholder instead of requesting a missing file (404)
    if (!cocktail.image) {
      return `<div class="card-image-wrapper img-missing" role="img" aria-label="${alt}"></div>`;
    }

    const small = cocktail.image.replace(/\.webp$/, "-400.webp");
    const fullWidth = imageWidthFor(cocktail);
    const srcset = fullWidth
      ? `srcset="${small} 400w, ${cocktail.image} ${fullWidth}w" sizes="(max-width: 700px) calc(100vw - 4rem), 340px"`
      : "";
    const isFirstRow = Number.isInteger(index) && index < 3;
    const loading = isFirstRow ? `loading="eager"${index === 0 ? ' fetchpriority="high"' : ""}` : `loading="lazy"`;

    return `
        <div class="card-image-wrapper">
          <img src="${cocktail.image}" ${srcset} alt="${alt}" class="card-img" width="400" height="200" ${loading} decoding="async" />
        </div>`;
  }

  function renderCardHTML(cocktail, badgeHTML = "", extraButtonHTML = "", index = null) {
    const servings = getServings();
    const isFav = favorites.includes(cocktail.name);

    return `
      <article class="cocktail-card card clickable-card reveal" data-drink-id="${cocktail.id}" tabindex="0">
        <div class="card-header-actions">
          ${badgeHTML}
          <button class="fav-btn" data-name="${cocktail.name}" title="Toggle Favorite"
                  aria-label="${isFav ? "Remove" : "Add"} ${cocktail.name} ${isFav ? "from" : "to"} favorites"
                  aria-pressed="${isFav}">
            ${isFav ? "❤" : "🤍"}
          </button>
        </div>
        ${cardImageHTML(cocktail, index)}
        <div class="card-content">
          <h3 class="card-title">${cocktail.name}</h3>
          <span class="card-subtitle">${cocktail.tagline}</span>
          <ul class="card-ingredients">
            ${cocktail.ingredients.map(ing => {
              const val = ing.oz * CONVERSIONS[currentUnit] * servings;
              return `<li><strong>${formatAmount(val)} ${currentUnit}</strong> — ${ing.name}</li>`;
            }).join("")}
          </ul>
          ${extraButtonHTML}
        </div>
      </article>
    `;
  }


  // SEO: RECIPE STRUCTURED DATA (JSON-LD)
  function buildRecipeSchema(drink) {
    const keywords = [
      `${drink.name.toLowerCase()} recipe`,
      `${drink.name.toLowerCase()} cocktail`,
      "easy cocktail recipe"
    ];
    if (drink.type === "zero") keywords.push("mocktail", "zero proof cocktail", "non-alcoholic cocktail");
    if (drink.type === "low") keywords.push("low alcohol cocktail", "low abv cocktail");
    if (drink.baseSpirit) keywords.push("3 ingredient cocktail", `${drink.baseSpirit} cocktail`);
    if (drink.flavorProfile) keywords.push(`${drink.flavorProfile} cocktail`);

    return {
      "@type": "Recipe",
      "name": drink.name,
      "description": `${drink.name}: ${drink.tagline.toLowerCase()}. Served in a ${drink.glass.toLowerCase()}, ${drink.method.toLowerCase()}.`,
      ...(drink.image ? { "image": new URL(drink.image, document.baseURI).href } : {}),
      "author": { "@type": "Organization", "name": "pour." },
      "recipeCategory": "Cocktail",
      "recipeYield": "1 serving",
      "keywords": keywords.join(", "),
      "recipeIngredient": drink.ingredients.map(ing =>
        `${formatAmount(ing.oz * CONVERSIONS.ml)} ml (${formatAmount(ing.oz)} oz) ${ing.name}`),
      "recipeInstructions": (drink.instructions || []).map(text => ({ "@type": "HowToStep", "text": text }))
    };
  }

  function injectRecipeSchema(drinks) {
    if (!drinks || !drinks.length) return;
    let tag = document.getElementById("recipe-schema");
    if (!tag) {
      tag = document.createElement("script");
      tag.type = "application/ld+json";
      tag.id = "recipe-schema";
      document.head.appendChild(tag);
    }
    tag.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": drinks.map(buildRecipeSchema) });
  }

  function renderActivePage() {
    if (document.getElementById("cocktail-grid")) renderHomeGrid();
    if (document.getElementById("cabinet-results-grid")) filterCabinetRecipes();
    if (document.getElementById("low-abv-grid")) renderLowAbvGrid();
    if (document.getElementById("minimalist-grid")) renderMinimalistGrid();
    if (document.getElementById("quiz-recommendations-grid")) renderQuizRecommendations();
  }


  // 5. LANDING PAGE GRID RENDERER ("index.html")
  const homeGridContainer = document.getElementById("cocktail-grid");
  function renderHomeGrid() {
    if (!homeGridContainer) return;
    setGrid(homeGridContainer, recipeDatabase.map((c, i) => renderCardHTML(c, "", "", i)).join(""));
  }

  if (homeGridContainer) {
    renderHomeGrid();
    injectRecipeSchema(recipeDatabase);
    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); renderHomeGrid(); });
    if (servingsInput) servingsInput.addEventListener("input", renderHomeGrid);
  }


  // 6. CABINET REVERSE SEARCH ENGINE ("cabinet.html")
  const cabinetCategories = document.getElementById("cabinet-categories");
  const cabinetResultsGrid = document.getElementById("cabinet-results-grid");
  const resultsCountTitle = document.getElementById("results-count-title");
  const ingredientSearch = document.getElementById("ingredient-search");
  const clearBtn = document.getElementById("clear-cabinet-btn");

  if (cabinetCategories && cabinetResultsGrid) {

    const cabinetSearchPool = [...recipeDatabase, ...lowAbvDatabase];

    const categoriesMap = {};
    cabinetSearchPool.forEach(recipe => {
      recipe.ingredients.forEach(ing => {
    
        let cat = ing.category;
        if (!cat) {
          const lowerName = ing.name.toLowerCase();
          if (["campari", "sweet vermouth", "fino sherry", "lillet blanc", "aperol"].some(s => lowerName.includes(s))) {
            cat = "Spirits";
          } else if (["syrup", "agave", "nectar"].some(s => lowerName.includes(s))) {
            cat = "Syrups & Sweeteners";
          } else if (["juice", "soda", "water", "ginger beer", "tonic"].some(s => lowerName.includes(s))) {
            cat = "Juices & Mixers";
          } else {
            cat = "Bitters & Extras";
          }
        }

        if (!categoriesMap[cat]) categoriesMap[cat] = new Set();
        categoriesMap[cat].add(ing.name);
      });
    });

    function renderCabinetSidebar() {
      cabinetCategories.innerHTML = Object.keys(categoriesMap).map(category => `
        <div class="category-group">
          <h4 class="category-title">${category}</h4>
          ${Array.from(categoriesMap[category]).sort().map(ingName => `
            <label class="checkbox-label" data-name="${ingName}">
              <input type="checkbox" value="${ingName}" class="cabinet-checkbox">
              <span>${ingName}</span>
            </label>
          `).join("")}
        </div>
      `).join("");

      document.querySelectorAll(".cabinet-checkbox").forEach(box => {
        box.addEventListener("change", filterCabinetRecipes);
      });
    }

    function filterCabinetRecipes() {
      const checkedIngredients = Array.from(
        document.querySelectorAll(".cabinet-checkbox:checked")
      ).map(cb => cb.value.toLowerCase());

      if (checkedIngredients.length === 0) {
        resultsCountTitle.textContent = "Select ingredients to start searching";
        setGrid(cabinetResultsGrid, `
          <div class="no-results-card card">
            <p>👈 Check off ingredients in the sidebar to see cocktails you can make!</p>
            <p class="inline-suggestion">Just browsing? See the <a href="index.html">most popular cocktails</a> or the <a href="low-abv.html">zero-proof and low-alcohol drinks</a>.</p>
          </div>
        `);
        return;
      }

      const exactMatches = [];
      const partialMatches = [];

      cabinetSearchPool.forEach(recipe => {
        const missingIngs = recipe.ingredients.filter(
          ing => !checkedIngredients.includes(ing.name.toLowerCase())
        );

        if (missingIngs.length === 0) {
          exactMatches.push(recipe);
        } else if (missingIngs.length === 1) {
          partialMatches.push({ ...recipe, missing: missingIngs[0].name });
        }
      });

      const totalFound = exactMatches.length + partialMatches.length;
      resultsCountTitle.textContent = `Found ${exactMatches.length} Ready to Mix • ${partialMatches.length} Almost There`;

      if (totalFound === 0) {
        setGrid(cabinetResultsGrid, `
          <div class="no-results-card card">
            <p>No matching or near-matching cocktails found. Try checking a main spirit like Tequila, Bourbon, or Rum!</p>
            <p class="inline-suggestion">Short on bottles? Our <a href="minimalist.html">3-ingredient cocktails</a> need almost nothing, or <a href="quiz.html">take the Flavor Quiz</a> for a pick.</p>
          </div>
        `);
        return;
      }

      let htmlOutput = "";

      exactMatches.forEach(cocktail => {
        htmlOutput += renderCardHTML(cocktail, `<span class="match-badge full">100% Match</span>`);
      });

      partialMatches.forEach(cocktail => {
        htmlOutput += renderCardHTML(
          cocktail, 
          `<span class="match-badge partial">Missing: ${cocktail.missing}</span>`,
          `<button class="btn-shopping" data-missing="${cocktail.missing}">📋 Add ${cocktail.missing} to Shopping List</button>`
        );
      });

      setGrid(cabinetResultsGrid, htmlOutput);
    }

    if (ingredientSearch) {
      ingredientSearch.addEventListener("input", (e) => {
        const query = e.target.value.trim().toLowerCase();
        document.querySelectorAll(".checkbox-label").forEach(label => {
          const ingName = label.getAttribute("data-name").toLowerCase();
          label.style.display = ingName.includes(query) ? "flex" : "none";
        });
        
        document.querySelectorAll(".category-group").forEach(group => {
          const anyVisible = Array.from(group.querySelectorAll(".checkbox-label"))
            .some(label => label.style.display !== "none");
          group.style.display = anyVisible ? "" : "none";
        });
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        document.querySelectorAll(".cabinet-checkbox").forEach(box => box.checked = false);
        filterCabinetRecipes();
      });
    }

    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); filterCabinetRecipes(); });
    if (servingsInput) servingsInput.addEventListener("input", filterCabinetRecipes);

    renderCabinetSidebar();
    filterCabinetRecipes(); // shows the starting message (with suggestion links)
  }

  // 7. LOW-ABV & ZERO-PROOF PAGE LOGIC ("low-abv.html")
  const lowAbvGrid = document.getElementById("low-abv-grid");
  if (lowAbvGrid) {
    let activeFilter = "all";

    function renderLowAbvGrid() {
      const filtered = lowAbvDatabase.filter(item => {
        if (activeFilter === "all") return true;
        return item.type === activeFilter;
      });

      setGrid(lowAbvGrid, filtered.map((cocktail, i) =>
        renderCardHTML(cocktail, `<span class="abv-badge ${cocktail.type}">${cocktail.abvText}</span>`, "", i)
      ).join(""));
    }

    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        activeFilter = e.currentTarget.getAttribute("data-filter");
        resetReveals(lowAbvGrid);
        renderLowAbvGrid();
      });
    });

    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); renderLowAbvGrid(); });
    if (servingsInput) servingsInput.addEventListener("input", renderLowAbvGrid);

    renderLowAbvGrid();
    injectRecipeSchema(lowAbvDatabase);
  }

  // 8. MINIMALIST 3-INGREDIENT PAGE LOGIC ("minimalist.html")
  const minimalistGrid = document.getElementById("minimalist-grid");
  if (minimalistGrid) {
    let selectedSpirit = "all";

    function renderMinimalistGrid() {
      const filtered = minimalistDatabase.filter(item => {
        if (selectedSpirit === "all") return true;
        return item.baseSpirit === selectedSpirit;
      });

      setGrid(minimalistGrid, filtered.map((cocktail, i) =>
        renderCardHTML(cocktail, `<span class="minimalist-badge">3 Ingredients</span>`, "", i)
      ).join(""));
    }

    document.querySelectorAll(".minimalist-tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".minimalist-tab-btn").forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        selectedSpirit = e.currentTarget.getAttribute("data-spirit");
        resetReveals(minimalistGrid);
        renderMinimalistGrid();
      });
    });

    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); renderMinimalistGrid(); });
    if (servingsInput) servingsInput.addEventListener("input", renderMinimalistGrid);

    renderMinimalistGrid();
    injectRecipeSchema(minimalistDatabase);
  }

  // 9. FLAVOR PROFILE QUIZ LOGIC ("quiz.html")
  const quizCard = document.getElementById("quiz-card");
  const quizResults = document.getElementById("quiz-results");
  const quizQuestionTitle = document.getElementById("quiz-question-title");
  const quizOptionsGrid = document.getElementById("quiz-options-grid");
  const quizStepIndicator = document.getElementById("quiz-step-indicator");
  const quizProgressFill = document.getElementById("quiz-progress-fill");
  const quizRecsGrid = document.getElementById("quiz-recommendations-grid");
  const restartQuizBtn = document.getElementById("restart-quiz-btn");

  if (quizCard && quizResults) {
    let currentStep = 0;
    let selectedFlavor = "sour";

    const questions = [
      {
        question: "What primary flavor profile are you craving today?",
        options: [
          { label: "Sour & Citrusy 🍋", sub: "Tart, vibrant, refreshing", flavor: "sour" },
          { label: "Spirit-Forward 🥃", sub: "Bold, strong, boozy", flavor: "strong" },
          { label: "Sweet & Decadent ☕", sub: "Rich, smooth, dessert-like", flavor: "sweet" },
          { label: "Bitter & Complex 🌿", sub: "Herbal, aperitivo style", flavor: "bitter" }
        ]
      },
      {
        question: "What kind of occasion is this drink for?",
        options: [
          { label: "Unwinding after work 🌇", sub: "Slow sipping", flavor: null },
          { label: "Party / Weekend Vibes 🎉", sub: "Crowd pleaser", flavor: null },
          { label: "Dinner pairing 🍽️", sub: "Balanced taste", flavor: null },
          { label: "Late night nightcap 🌙", sub: "Deep and warming", flavor: null }
        ]
      },
      {
        question: "How do you like your drink served?",
        options: [
          { label: "On the Rocks 🧊", sub: "Over ice", flavor: null },
          { label: "Chilled & Up 🍸", sub: "Coupe or martini glass", flavor: null },
          { label: "Tall with Soda 🥤", sub: "Highball style", flavor: null },
          { label: "Neat / Room Temp 🥃", sub: "No ice", flavor: null }
        ]
      }
    ];

    function renderQuestion() {
      const q = questions[currentStep];
      quizStepIndicator.textContent = `Question ${currentStep + 1} of ${questions.length}`;
      quizProgressFill.style.width = `${((currentStep + 1) / questions.length) * 100}%`;
      quizQuestionTitle.textContent = q.question;

      quizOptionsGrid.innerHTML = q.options.map(opt => `
        <button class="quiz-option-btn" data-flavor="${opt.flavor || ''}">
          ${opt.label}
          <span>${opt.sub}</span>
        </button>
      `).join("");

      document.querySelectorAll(".quiz-option-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const flavor = e.currentTarget.getAttribute("data-flavor");
          if (flavor) selectedFlavor = flavor;

         
          quizOptionsGrid.querySelectorAll(".quiz-option-btn").forEach(b => { b.disabled = true; });

          currentStep++;
          if (currentStep < questions.length) {
            renderQuestion();
          } else {
            showResults();
          }
        });
      });
    }

    function showResults() {
      quizCard.classList.add("hidden");
      quizResults.classList.remove("hidden");
      renderQuizRecommendations();
    }

    function renderQuizRecommendations() {
      const matched = recipeDatabase.filter(item => item.flavorProfile === selectedFlavor);
      const displayList = matched.length > 0 ? matched : recipeDatabase.slice(0, 3);

      setGrid(quizRecsGrid, displayList.map(cocktail => 
        renderCardHTML(cocktail, `<span class="match-badge full">Top Recommendation</span>`)
      ).join(""));
    }

    if (restartQuizBtn) {
      restartQuizBtn.addEventListener("click", () => {
        currentStep = 0;
        resetReveals(quizRecsGrid);
        quizResults.classList.add("hidden");
        quizCard.classList.remove("hidden");
        renderQuestion();
      });
    }

    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); renderQuizRecommendations(); });
    if (servingsInput) servingsInput.addEventListener("input", renderQuizRecommendations);

    renderQuestion();
  }


  // Open a drink popup if the address ends with "#drink-123" (from an "Also try" link)
  openDrinkFromHash();


  // 10. FOOTER & COOKIE BANNER LOGIC
  // Dynamic Copyright Year
  const yearSpan = document.getElementById("copyright-year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  // Cookie Banner Logic
  const cookieBanner = document.getElementById("cookie-banner");
  const acceptCookiesBtn = document.getElementById("accept-cookies-btn");

  if (cookieBanner && acceptCookiesBtn) {
    if (!store.get("pour_cookies_accepted")) {
      cookieBanner.classList.remove("hidden");
    }

    acceptCookiesBtn.addEventListener("click", () => {
      store.set("pour_cookies_accepted", "true");
      cookieBanner.classList.add("hidden");
    });
  }


  // 11. CONTACT EMAIL (spam protection)
  // The address is never written whole in the HTML. It is put together here from two parts,
  // so simple spam bots that scan page source for "name@domain" don't find it.
  document.querySelectorAll(".js-email").forEach(link => {
    const user = link.getAttribute("data-user");
    const domain = link.getAttribute("data-domain");
    if (!user || !domain) return;
    const address = `${user}@${domain}`;
    link.href = `mailto:${address}`;
    link.textContent = address;
  });

});
