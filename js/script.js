document.addEventListener("DOMContentLoaded", () => {

  // =========================================================================
  // 1. GLOBAL STATE, FAVORITES & CONVERSIONS
  // =========================================================================
  let currentUnit = "ml"; // 'oz', 'ml', 'cl'
  const CONVERSIONS = { oz: 1, ml: 30, cl: 3 };

  // Safe localStorage wrappers. Storage can be blocked (private mode, strict browser
  // settings) and a single thrown error here used to stop the whole script.
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  // Migrates old storage key if present, otherwise uses 'pour_favorites'
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
    favorites = []; // corrupted value: start fresh instead of crashing
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

    // navigator.clipboard only exists on https:// (or localhost) pages
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (e) { copied = false; }

    // Fallback for http:// pages and older browsers
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

  // Servings is always a number between 1 and 12 (typing -3 used to give negative amounts)
  function getServings() {
    const n = parseFloat(servingsInput ? servingsInput.value : 1);
    if (!Number.isFinite(n)) return 1;
    return Math.min(12, Math.max(1, n));
  }
  if (servingsInput) {
    servingsInput.addEventListener("change", () => { servingsInput.value = getServings(); });
  }

  // 0.25 oz used to display as "0.3"; round to 2 decimals and drop trailing zeros instead
  function formatAmount(value) {
    return String(parseFloat(value.toFixed(2)));
  }

  // =========================================================================
  // 2. THEME TOGGLE
  // =========================================================================
  const themeToggleBtn = document.getElementById("theme-toggle");
  const savedTheme = store.get("theme") === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.textContent = savedTheme === "dark" ? "Light" : "Dark";
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      store.set("theme", newTheme);
      themeToggleBtn.textContent = newTheme === "dark" ? "Light" : "Dark";
    });
  }

  // =========================================================================
  // 3. RESPONSIVE HAMBURGER NAVIGATION
  // =========================================================================
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
    // Close when tapping outside the menu, pressing Escape, or rotating to a wide screen
    document.addEventListener("click", (e) => {
      if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) setMenu(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", () => { if (window.innerWidth > 960) setMenu(false); });
  }

  // =========================================================================
  // 4. RECIPE DATABASES
  // =========================================================================
  
  // Standard Cocktails (Home, Cabinet & Quiz)
  const recipeDatabase = [
    {
      id: 1,
      name: "Margarita",
      tagline: "Crisp & Citrusy",
      image: "images/Classic Margarita with salt rim.jpg",
      flavorProfile: "sour",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Salt rim & lime wheel",
      ice: "Cubed ice",
      altText: "Image of Classic Margarita with salt rim",
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
      image: "images/Old Fashioned with orange peel.webp",
      flavorProfile: "strong",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange peel",
      ice: "Large single cube",
      altText: "Image of Old Fashioned with orange peel",
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
      image: "images/Espresso Martini with coffee beans.webp",
      flavorProfile: "sweet",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "3 Espresso beans",
      ice: "None (Chilled)",
      altText: "Image of Espresso Martini with coffee beans",
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
      image: "images/Image of Mojito with crushed ice and mint leaves.jpg",
      flavorProfile: "refreshing",
      glass: "Highball Glass",
      method: "Muddled & Built",
      garnish: "Fresh mint sprig",
      ice: "Crushed ice",
      altText: "Image of Mojito with crushed ice and mint leaves",
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
      image: "images/Image of Whiskey Sour with lemon wheel.jpg",
      flavorProfile: "sour",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Lemon wheel & Angostura drops",
      ice: "Cubed ice",
      altText: "Image of Whiskey Sour with lemon wheel",
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
      image: "images/Image of Negroni over large ice cube.png",
      flavorProfile: "bitter",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange slice",
      ice: "Large single cube",
      altText: "Image of Negroni over large ice cube",
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
      image: "images/Image of Classic Rum Daiquiri in coupe glass.jpg",
      flavorProfile: "sour",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "None (Chilled)",
      altText: "Image of Classic Rum Daiquiri in coupe glass",
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
      image: "images/Image of Aperol Spritz with orange slice.jpg",
      flavorProfile: "refreshing",
      glass: "Wine Glass",
      method: "Built in glass",
      garnish: "Orange slice",
      ice: "Cubed ice",
      altText: "Image of Aperol Spritz with orange slice",
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
      image: "images/Image of Dry Martini with olive garnish.jpg",
      flavorProfile: "strong",
      glass: "Martini Glass",
      method: "Stirred",
      garnish: "Green olive or lemon twist",
      ice: "None (Chilled)",
      altText: "Image of Dry Martini with olive garnish",
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
      image: "images/Image of Pink Grapefruit Paloma with salt rim.jpeg",
      type: "zero",
      abvText: "0% ABV",
      glass: "Highball Glass",
      method: "Built in glass",
      garnish: "Grapefruit wedge & salt rim",
      ice: "Cubed ice",
      altText: "Image of Pink Grapefruit Paloma with salt rim",
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
      image: "images/Image of Americano cocktail with orange wedge.jpg",
      type: "low",
      abvText: "~8% ABV",
      glass: "Highball Glass",
      method: "Built in glass",
      garnish: "Orange wedge",
      ice: "Cubed ice",
      altText: "Image of Americano cocktail with orange wedge",
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
      image: "images/Image of Virgin Mojito with fresh mint and lime slices.jpg",
      type: "zero",
      abvText: "0% ABV",
      glass: "Highball Glass",
      method: "Muddled",
      garnish: "Mint sprig & lime wheel",
      ice: "Crushed ice",
      altText: "Image of Virgin Mojito with fresh mint and lime slices",
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
      image: "images/Image of Lillet Highball with cucumber and mint garnish.webp",
      type: "low",
      abvText: "~5% ABV",
      glass: "Highball Glass",
      method: "Built in glass",
      garnish: "Cucumber ribbon & mint",
      ice: "Cubed ice",
      altText: "Image of Lillet Highball with cucumber and mint garnish",
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
      image: "images/Image of Cucumber Ginger Fizz in tall glass.png",
      type: "zero",
      abvText: "0% ABV",
      glass: "Highball Glass",
      method: "Muddled & Built",
      garnish: "Cucumber slice",
      ice: "Cubed ice",
      altText: "Image of Cucumber Ginger Fizz in tall glass",
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
      image: "images/Image of Sherry Cobbler heaped with crushed ice and berries.jpg",
      type: "low",
      abvText: "~9% ABV",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Fresh berries & mint",
      ice: "Crushed ice",
      altText: "Image of Sherry Cobbler heaped with crushed ice and berries",
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
      image: "images/Image of Negroni over large ice cube.png",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange peel",
      ice: "Large ice cube",
      altText: "Image of Negroni over large ice cube",
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
      image: "images/Old Fashioned with orange peel.webp",
      glass: "Rocks Glass",
      method: "Stirred",
      garnish: "Orange peel",
      ice: "Large single cube",
      altText: "Image of Old Fashioned with orange peel",
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
      image: "images/Image of Classic Rum Daiquiri in coupe glass.jpg",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "None (Chilled)",
      altText: "Image of Classic Rum Daiquiri in coupe glass",
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
      image: "images/Image of Tommy's Margarita on the rocks.jpg",
      glass: "Rocks Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "Cubed ice",
      altText: "Image of Tommy's Margarita on the rocks",
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
      image: "images/Image of Moscow Mule in copper mug with lime wedge.jpg",
      glass: "Copper Mug",
      method: "Built in mug",
      garnish: "Lime wedge",
      ice: "Cubed ice",
      altText: "Image of Moscow Mule in copper mug with lime wedge",
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
      image: "images/Image of Gin Gimlet served cold in a cocktail glass.jpg",
      glass: "Coupe Glass",
      method: "Shaken",
      garnish: "Lime wheel",
      ice: "None (Chilled)",
      altText: "Image of Gin Gimlet served cold in a cocktail glass",
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

  // Find a drink by its unique id across all databases.
  // (Old Fashioned, Negroni and Daiquiri exist in both the standard and 3-ingredient lists,
  // so looking drinks up by name opened the wrong recipe from the 3-Ingredient page.)
  function findDrinkById(id) {
    const key = String(id);
    return recipeDatabase.find(d => String(d.id) === key) ||
           lowAbvDatabase.find(d => String(d.id) === key) ||
           minimalistDatabase.find(d => String(d.id) === key);
  }

  // =========================================================================
  // FLOAT-IN REVEAL: cards fade and float up as they scroll into view
  // =========================================================================
  // Each grid remembers which drinks it has already revealed (grid._seen), so re-rendering
  // for a favorite / unit / servings change never replays the animation. Cards that enter
  // the screen together are staggered. Skipped entirely for reduced-motion users.
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

  // Put cards into a grid and hook up the reveal animation
  function setGrid(container, html) {
    if (!container) return;
    const seen = container._seen || (container._seen = new Set());

    if (revealObserver) {
      container.querySelectorAll(".cocktail-card").forEach(c => revealObserver.unobserve(c));
    }
    container.innerHTML = html;

    const cards = container.querySelectorAll(".cocktail-card");
    if (!cards.length) { seen.clear(); return; } // empty state: next results animate again

    cards.forEach(card => {
      const id = card.getAttribute("data-drink-id");
      if (!revealObserver || seen.has(id)) {
        card.classList.remove("reveal"); // already shown (or motion off): no replay
      } else {
        revealObserver.observe(card);
      }
    });
  }

  // Make the next render animate every card again (used when switching tabs / retaking the quiz)
  function resetReveals(container) {
    if (container && container._seen) container._seen.clear();
  }

  // If a photo is missing, show a tidy placeholder instead of a broken-image icon
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

  // =========================================================================
  // MODAL POPUP LOGIC
  // =========================================================================
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
      return `<li><strong>${formatAmount(val)} ${currentUnit}</strong>” ${ing.name}</li>`;
    }).join("");

    const instList = document.getElementById("modal-instructions");
    if (drink.instructions) {
      instList.innerHTML = drink.instructions.map(step => `<li>${step}</li>`).join("");
    } else {
      instList.innerHTML = "<li>Combine ingredients with ice, mix well, strain or serve cold.</li>";
    }

    lastFocusedEl = document.activeElement;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden"; // stop the page scrolling behind the popup
    if (modalCloseBtn) modalCloseBtn.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocusedEl && document.contains(lastFocusedEl)) lastFocusedEl.focus();
    lastFocusedEl = null;
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Global Event Listener for Favorites, Shopping List & Recipe Card Clicks
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

    // Recipe Card Click (Triggers Detail Modal)
    const card = e.target.closest(".cocktail-card");
    if (card) {
      const drinkObj = findDrinkById(card.getAttribute("data-drink-id"));
      if (drinkObj) openModal(drinkObj);
    }
  });

  // Keyboard: Escape closes the popup; Enter / Space opens a focused card
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

  // Card HTML Renderer Helper Function
  function renderCardHTML(cocktail, badgeHTML = "", extraButtonHTML = "") {
    const servings = getServings();
    const isFav = favorites.includes(cocktail.name);

    // Fallback image if a drink doesn't have one assigned yet
    const imgSrc = cocktail.image || "images/default-cocktail.jpg";

    return `
      <article class="cocktail-card card clickable-card reveal" data-drink-id="${cocktail.id}" tabindex="0">
        <div class="card-header-actions">
          ${badgeHTML}
          <button class="fav-btn" data-name="${cocktail.name}" title="Toggle Favorite"
                  aria-label="${isFav ? "Remove" : "Add"} ${cocktail.name} ${isFav ? "from" : "to"} favorites"
                  aria-pressed="${isFav}">
            ${isFav ? "❤️" : "🤍"}
          </button>
        </div>
        <div class="card-image-wrapper">
          <img src="${imgSrc}" alt="${cocktail.altText || cocktail.name}" class="card-img" loading="lazy" />
        </div>
        <div class="card-content">
          <h3 class="card-title">${cocktail.name}</h3>
          <span class="card-subtitle">${cocktail.tagline}</span>
          <ul class="card-ingredients">
            ${cocktail.ingredients.map(ing => {
              const val = ing.oz * CONVERSIONS[currentUnit] * servings;
              return `<li><strong>${formatAmount(val)} ${currentUnit}</strong>” ${ing.name}</li>`;
            }).join("")}
          </ul>
          ${extraButtonHTML}
        </div>
      </article>
    `;
  }

  function renderActivePage() {
    if (document.getElementById("cocktail-grid")) renderHomeGrid();
    if (document.getElementById("cabinet-results-grid")) filterCabinetRecipes();
    if (document.getElementById("low-abv-grid")) renderLowAbvGrid();
    if (document.getElementById("minimalist-grid")) renderMinimalistGrid();
    if (document.getElementById("quiz-recommendations-grid")) renderQuizRecommendations();
  }

  // =========================================================================
  // 5. LANDING PAGE GRID RENDERER (`index.html`)
  // =========================================================================
  const homeGridContainer = document.getElementById("cocktail-grid");
  function renderHomeGrid() {
    if (!homeGridContainer) return;
    setGrid(homeGridContainer, recipeDatabase.map(c => renderCardHTML(c)).join(""));
  }

  if (homeGridContainer) {
    renderHomeGrid();
    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); renderHomeGrid(); });
    if (servingsInput) servingsInput.addEventListener("input", renderHomeGrid);
  }

  // =========================================================================
  // 6. CABINET REVERSE SEARCH ENGINE (`cabinet.html`)
  // =========================================================================
  const cabinetCategories = document.getElementById("cabinet-categories");
  const cabinetResultsGrid = document.getElementById("cabinet-results-grid");
  const resultsCountTitle = document.getElementById("results-count-title");
  const ingredientSearch = document.getElementById("ingredient-search");
  const clearBtn = document.getElementById("clear-cabinet-btn");

  if (cabinetCategories && cabinetResultsGrid) {

    // Combine standard recipes and low-ABV recipes into one master search pool
    const cabinetSearchPool = [...recipeDatabase, ...lowAbvDatabase];

    const categoriesMap = {};
    cabinetSearchPool.forEach(recipe => {
      recipe.ingredients.forEach(ing => {
        // Fallback categorization if category isn't explicitly set on low-ABV ingredients
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
            <p>Check off ingredients in the sidebar to see cocktails you can make!</p>
          </div>
        `);
        return;
      }

      const exactMatches = [];
      const partialMatches = [];

      // Search standard AND low-ABV drinks (the sidebar lists ingredients from both;
      // previously only the standard list was searched, so e.g. Lillet Blanc matched nothing)
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
      resultsCountTitle.textContent = `Found ${exactMatches.length} Ready to Mix ${partialMatches.length} Almost There`;

      if (totalFound === 0) {
        setGrid(cabinetResultsGrid, `
          <div class="no-results-card card">
            <p>No matching or near-matching cocktails found. Try checking a main spirit like Tequila, Bourbon, or Rum!</p>
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
          `<button class="btn-shopping" data-missing="${cocktail.missing}"> Add ${cocktail.missing} to Shopping List</button>`
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
        // Hide category headings that have no visible ingredients left
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
  }

  // =========================================================================
  // 7. LOW-ABV & ZERO-PROOF PAGE LOGIC (`low-abv.html`)
  // =========================================================================
  const lowAbvGrid = document.getElementById("low-abv-grid");
  if (lowAbvGrid) {
    let activeFilter = "all";

    function renderLowAbvGrid() {
      const filtered = lowAbvDatabase.filter(item => {
        if (activeFilter === "all") return true;
        return item.type === activeFilter;
      });

      setGrid(lowAbvGrid, filtered.map(cocktail => 
        renderCardHTML(cocktail, `<span class="abv-badge ${cocktail.type}">${cocktail.abvText}</span>`)
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
  }

  // =========================================================================
  // 8. MINIMALIST 3-INGREDIENT PAGE LOGIC (`minimalist.html`)
  // =========================================================================
  const minimalistGrid = document.getElementById("minimalist-grid");
  if (minimalistGrid) {
    let selectedSpirit = "all";

    function renderMinimalistGrid() {
      const filtered = minimalistDatabase.filter(item => {
        if (selectedSpirit === "all") return true;
        return item.baseSpirit === selectedSpirit;
      });

      setGrid(minimalistGrid, filtered.map(cocktail => 
        renderCardHTML(cocktail, `<span class="minimalist-badge">3 Ingredients</span>`)
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
  }

  // =========================================================================
  // 9. FLAVOR PROFILE QUIZ LOGIC (`quiz.html`)
  // =========================================================================
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
          { label: "Sour & Citrusy", sub: "Tart, vibrant, refreshing", flavor: "sour" },
          { label: "Spirit-Forward", sub: "Bold, strong, boozy", flavor: "strong" },
          { label: "Sweet & Decadent", sub: "Rich, smooth, dessert-like", flavor: "sweet" },
          { label: "Bitter & Complex", sub: "Herbal, aperitivo style", flavor: "bitter" }
        ]
      },
      {
        question: "What kind of occasion is this drink for?",
        options: [
          { label: "Unwinding after work", sub: "Slow sipping", flavor: null },
          { label: "Party / Weekend Vibes", sub: "Crowd pleaser", flavor: null },
          { label: "Dinner pairing", sub: "Balanced taste", flavor: null },
          { label: "Late night nightcap", sub: "Deep and warming", flavor: null }
        ]
      },
      {
        question: "How do you like your drink served?",
        options: [
          { label: "On the Rocks", sub: "Over ice", flavor: null },
          { label: "Chilled & Up", sub: "Coupe or martini glass", flavor: null },
          { label: "Tall with Soda", sub: "Highball style", flavor: null },
          { label: "Neat / Room Temp", sub: "No ice", flavor: null }
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

          // Lock the buttons so a fast double-tap can't skip a question
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

  // =========================================================================
  // 10. FOOTER & COOKIE BANNER LOGIC
  // =========================================================================
  // (This used to sit outside DOMContentLoaded, so it ran before the footer and banner
  // existed on the page: the copyright year stayed empty and the cookie banner never showed.)

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

});
