document.addEventListener("DOMContentLoaded", async () => {

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


  // 4. RECIPES FROM THE DATABASE
  // The recipes used to be written out here by hand. They now live in a MySQL
  // database and come from the server's API (see the server/ and database/
  // folders and DATABASE.md). Each recipe still has the same shape as before:
  // { id, name, tagline, image, ingredients: [{ name, oz, category }], instructions, ... }
  //
  // API_BASE is empty when the server that sends this page also runs the API.
  // If the HTML is hosted elsewhere (e.g. GitHub Pages), set it in the page:
  //   <meta name="pour-api" content="https://your-server.example.com">
  const apiMeta = document.querySelector('meta[name="pour-api"]');
  const API_BASE = (apiMeta ? apiMeta.content : "").trim().replace(/\/+$/, "");

  async function api(path, options = {}) {
    const controller = "AbortController" in window ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      const res = await fetch(API_BASE + path, {
        ...options,
        headers: {
          "Accept": "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(sessionToken ? { "Authorization": `Bearer ${sessionToken}` } : {})
        },
        ...(controller ? { signal: controller.signal } : {})
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      // The login expired or was ended elsewhere: forget it
      if (res.status === 401 && sessionToken && !/^\/api\/auth\/(login|signup)/.test(path)) clearSession();
      if (!res.ok) throw new Error((data && data.error) || `The server answered with an error (${res.status}).`);
      return data;
    } catch (err) {
      if (err.name === "AbortError" || err instanceof TypeError) {
        throw new Error("Couldn't reach the recipe server. Check your connection and try again.");
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ACCOUNTS
  // After logging in, the server gives this browser a session token. It is kept
  // in localStorage and sent with every API request (see api() above). Using a
  // header instead of a cookie keeps logins working when the pages (GitHub Pages)
  // and the server (Railway) are on different websites.
  const SESSION_KEY = "pour_session";
  let sessionToken = store.get(SESSION_KEY);
  let currentUser = null;

  function setSession(token, user) {
    sessionToken = token;
    currentUser = user;
    store.set(SESSION_KEY, token);
  }
  function clearSession() {
    sessionToken = null;
    currentUser = null;
    store.remove(SESSION_KEY);
  }
  // Can the logged-in user edit/delete this drink?
  function canManage(drink) {
    return !!(currentUser && drink && drink.section === "community" &&
      (drink.userId === currentUser.id || currentUser.isAdmin));
  }
  // Only allow redirects to pages of this site (e.g. "community.html#share")
  function safeNext(value) {
    return /^[a-z0-9-]+\.html(#[a-z0-9-]+)?$/i.test(value || "") ? value : null;
  }

  // Uploaded photos are stored on the API server, so when the pages are hosted
  // elsewhere (GitHub Pages) their address must point at that server.
  function imageUrl(src) {
    if (!src) return src;
    return (API_BASE && /^uploads\//.test(src)) ? `${API_BASE}/${src}` : src;
  }

  // Everything that goes into innerHTML passes through esc(), because
  // visitors can now add recipes and their text must never run as HTML.
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  let recipeDatabase = [];
  let lowAbvDatabase = [];
  let minimalistDatabase = [];
  const extraDrinks = new Map(); // drinks loaded later (community page, cabinet results), by id
  let recipesLoadError = null;

  // Who is logged in? (asked at the same time as the recipes are loaded)
  const mePromise = sessionToken
    ? api("/api/auth/me").then(d => d.user).catch(() => null)
    : Promise.resolve(null);

  // Only pages that show recipes need them (not About, Contact, ...)
  if (document.getElementById("recipe-modal")) {
    try {
      const { recipes } = await api("/api/recipes");
      recipeDatabase = recipes.filter(r => r.section === "classic");
      lowAbvDatabase = recipes.filter(r => r.section === "low_abv");
      minimalistDatabase = recipes.filter(r => r.section === "minimalist");
    } catch (err) {
      recipesLoadError = err;
      console.error("Loading recipes failed:", err);
    }
  }
  currentUser = await mePromise;

  // "Log in" / "👤 username" link at the end of the menu on every page
  function renderNavAccount() {
    const menu = document.getElementById("nav-menu");
    if (!menu) return;
    let item = document.getElementById("nav-account");
    if (!item) {
      item = document.createElement("li");
      item.id = "nav-account";
      menu.appendChild(item);
    }
    const onAccountPage = /account\.html$/.test(window.location.pathname);
    item.innerHTML = `<a href="account.html" class="nav-account-link${onAccountPage ? " active" : ""}">${
      currentUser ? `👤 ${esc(currentUser.username)}` : "Log in"}</a>`;
  }
  renderNavAccount();

  function loadErrorHTML(err) {
    return `
      <div class="no-results-card card load-error" role="alert">
        <p>😕 The recipes couldn't be loaded. ${esc(err && err.message)}</p>
        <p class="inline-suggestion"><a href="${esc(window.location.pathname)}">Try again</a></p>
      </div>`;
  }

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
           minimalistDatabase.find(d => String(d.id) === key) ||
           extraDrinks.get(key);
  }

  // A drink that isn't loaded on this page yet (e.g. a link to a community recipe)
  async function fetchDrinkById(id) {
    const found = findDrinkById(id);
    if (found) return found;
    try {
      const { recipe } = await api(`/api/recipes/${encodeURIComponent(id)}`);
      extraDrinks.set(String(recipe.id), recipe);
      return recipe;
    } catch (e) {
      return null;
    }
  }

  // WHICH PAGE EACH DRINK LIVES ON (used for "Also try" links)
  const PAGE_FOR_SECTION = {
    classic: "index.html",
    low_abv: "low-abv.html",
    minimalist: "minimalist.html",
    community: "community.html"
  };
  function pageForDrink(drink) {
    return PAGE_FOR_SECTION[drink.section] || "index.html";
  }

  // "Also try" suggestions (drink.related) and the official IBA recipe link
  // (drink.iba) now come from the database too: tables related_recipes and
  // the iba_url / iba_label columns.

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
    document.getElementById("modal-tagline").textContent =
      drink.author ? `${drink.tagline} · shared by ${drink.author}` : drink.tagline;
    document.getElementById("modal-glass").textContent = drink.glass || "Standard Glass";
    document.getElementById("modal-method").textContent = drink.method || "Mixed";
    document.getElementById("modal-garnish").textContent = drink.garnish || "Optional";
    document.getElementById("modal-ice").textContent = drink.ice || "Cubed ice";

    const ingList = document.getElementById("modal-ingredients");
    ingList.innerHTML = drink.ingredients.map(ing => {
      const val = ing.oz * CONVERSIONS[currentUnit] * servings;
      return `<li><strong>${formatAmount(val)} ${currentUnit}</strong> — ${esc(ing.name)}</li>`;
    }).join("");

    const instList = document.getElementById("modal-instructions");
    if (drink.instructions && drink.instructions.length) {
      instList.innerHTML = drink.instructions.map(step => `<li>${esc(step)}</li>`).join("");
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

    const related = (drink.related || []).map(findDrinkById).filter(Boolean);
    const relatedHTML = related.length ? `
      <h3>Also try</h3>
      <ul class="also-try-list">
        ${related.map(r => `
          <li><a href="${pageForDrink(r)}#drink-${r.id}" class="also-try-link">
            <span class="also-try-name">${esc(r.name)}</span>
            <span class="also-try-tagline">${esc(r.tagline)}</span>
          </a></li>`).join("")}
      </ul>` : "";

    const iba = drink.iba;
    const ibaHTML = iba && /^https:\/\//.test(iba.url) ? `
      <p class="source-link">
        <a href="${esc(iba.url)}" target="_blank" rel="noopener">${esc(iba.label || `Official ${drink.name} recipe (IBA)`)} ↗</a>
        <span>from the International Bartenders Association</span>
      </p>` : "";

    const manageHTML = canManage(drink) ? `
      <div class="owner-actions">
        <a class="btn-edit" href="community.html?edit=${drink.id}#share">✏️ Edit recipe</a>
        <button type="button" class="btn-delete" data-delete-id="${drink.id}">🗑 Delete</button>
      </div>` : "";

    extras.innerHTML = manageHTML + relatedHTML + ibaHTML;
  }

  // Open a drink from a link like "low-abv.html#drink-103" (used by "Also try")
  function openDrinkFromHash() {
    const match = window.location.hash.match(/^#drink-(\d+)$/);
    if (!match) return;
    fetchDrinkById(match[1]).then(drink => { if (drink) openModal(drink); });
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


  // Called after a recipe is deleted, so lists on the page can refresh
  const afterRecipeChange = [];

  async function deleteRecipeById(id, button) {
    const drink = findDrinkById(id);
    const name = drink ? `"${drink.name}"` : "this recipe";
    if (!window.confirm(`Delete ${name}? This can't be undone.`)) return;
    if (button) button.disabled = true;
    try {
      await api(`/api/recipes/${encodeURIComponent(id)}`, { method: "DELETE" });
      extraDrinks.delete(String(id));
      if (modal && modal.classList.contains("active")) closeModal();
      afterRecipeChange.forEach(fn => fn());
    } catch (err) {
      alert(err.message);
      if (button) button.disabled = false;
    }
  }

  document.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".btn-delete[data-delete-id]");
    if (deleteBtn) {
      deleteRecipeById(deleteBtn.getAttribute("data-delete-id"), deleteBtn);
      return;
    }
    if (e.target.closest(".btn-edit")) return; // a normal link to the edit form

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


  // Real width of the full-size photo (used in srcset so the browser picks the right file).
  // Stored in the database (recipes.image_width). Curated photos also have a
  // 400px version named like "margarita-400.webp"; uploaded photos don't.
  function imageWidthFor(cocktail) {
    return cocktail.imageWidth || null;
  }

  // Builds the <img> for a card.
  // - srcset offers a 400px and a full-size version; the browser picks the one the screen needs.
  // - The first cards on a page load right away (they are what visitors see first, LCP);
  //   cards further down load lazily when they scroll into view.
  function cardImageHTML(cocktail, index) {
    const alt = esc((cocktail.altText || cocktail.name).replace(/^Image of /i, ""));

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
          <img src="${esc(imageUrl(cocktail.image))}" ${srcset} alt="${alt}" class="card-img" width="400" height="200" ${loading} decoding="async" />
        </div>`;
  }

  function renderCardHTML(cocktail, badgeHTML = "", extraButtonHTML = "", index = null) {
    const servings = getServings();
    const isFav = favorites.includes(cocktail.name);

    return `
      <article class="cocktail-card card clickable-card reveal" data-drink-id="${cocktail.id}" tabindex="0">
        <div class="card-header-actions">
          ${badgeHTML}
          <button class="fav-btn" data-name="${esc(cocktail.name)}" title="Toggle Favorite"
                  aria-label="${isFav ? "Remove" : "Add"} ${esc(cocktail.name)} ${isFav ? "from" : "to"} favorites"
                  aria-pressed="${isFav}">
            ${isFav ? "❤" : "🤍"}
          </button>
        </div>
        ${cardImageHTML(cocktail, index)}
        <div class="card-content">
          <h3 class="card-title">${esc(cocktail.name)}</h3>
          <span class="card-subtitle">${esc(cocktail.tagline)}</span>
          ${cocktail.author ? `<span class="card-author">by ${esc(cocktail.author)}</span>` : ""}
          <ul class="card-ingredients">
            ${cocktail.ingredients.map(ing => {
              const val = ing.oz * CONVERSIONS[currentUnit] * servings;
              return `<li><strong>${formatAmount(val)} ${currentUnit}</strong> — ${esc(ing.name)}</li>`;
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
      "description": `${drink.name}: ${String(drink.tagline || "").toLowerCase()}.` +
        (drink.glass ? ` Served in a ${drink.glass.toLowerCase()}${drink.method ? `, ${drink.method.toLowerCase()}` : ""}.` : ""),
      ...(drink.image ? { "image": new URL(imageUrl(drink.image), document.baseURI).href } : {}),
      "author": drink.author ? { "@type": "Person", "name": drink.author } : { "@type": "Organization", "name": "pour." },
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
    if (document.getElementById("community-grid")) renderCommunityGrid();
    if (document.getElementById("my-recipes-grid")) renderMyRecipes();
  }


  // 5. LANDING PAGE GRID RENDERER ("index.html")
  const homeGridContainer = document.getElementById("cocktail-grid");
  function renderHomeGrid() {
    if (!homeGridContainer) return;
    if (recipesLoadError) return setGrid(homeGridContainer, loadErrorHTML(recipesLoadError));
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

    // The ingredient list and the matching are now done by the database:
    //   GET  /api/ingredients  -> names + categories for the sidebar
    //   POST /api/cabinet      -> drinks you can make, and drinks missing one ingredient
    const CATEGORY_ORDER = ["Spirits", "Juices & Mixers", "Syrups & Sweeteners", "Bitters & Extras"];
    let lastResult = { key: "", exact: [], partial: [] };
    let searchSeq = 0;

    async function renderCabinetSidebar() {
      if (recipesLoadError) {
        cabinetCategories.innerHTML = "";
        return;
      }
      let ingredients = [];
      try {
        ({ ingredients } = await api("/api/ingredients"));
      } catch (err) {
        cabinetCategories.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
        return;
      }
      const categoriesMap = {};
      ingredients.forEach(ing => {
        (categoriesMap[ing.category] = categoriesMap[ing.category] || []).push(ing.name);
      });
      const categories = Object.keys(categoriesMap).sort((a, b) =>
        (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));

      cabinetCategories.innerHTML = categories.map(category => `
        <div class="category-group">
          <h4 class="category-title">${esc(category)}</h4>
          ${categoriesMap[category].sort().map(ingName => `
            <label class="checkbox-label" data-name="${esc(ingName)}">
              <input type="checkbox" value="${esc(ingName)}" class="cabinet-checkbox">
              <span>${esc(ingName)}</span>
            </label>
          `).join("")}
        </div>
      `).join("");

      document.querySelectorAll(".cabinet-checkbox").forEach(box => {
        box.addEventListener("change", filterCabinetRecipes);
      });
    }

    function renderCabinetResults() {
      const { exact: exactMatches, partial: partialMatches } = lastResult;
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
          `<span class="match-badge partial">Missing: ${esc(cocktail.missing)}</span>`,
          `<button class="btn-shopping" data-missing="${esc(cocktail.missing)}">📋 Add ${esc(cocktail.missing)} to Shopping List</button>`
        );
      });

      setGrid(cabinetResultsGrid, htmlOutput);
    }

    async function filterCabinetRecipes() {
      if (recipesLoadError) {
        resultsCountTitle.textContent = "Recipes unavailable";
        setGrid(cabinetResultsGrid, loadErrorHTML(recipesLoadError));
        return;
      }

      const checkedIngredients = Array.from(
        document.querySelectorAll(".cabinet-checkbox:checked")
      ).map(cb => cb.value.toLowerCase());

      if (checkedIngredients.length === 0) {
        searchSeq++; // ignore any answer still on its way
        lastResult = { key: "", exact: [], partial: [] };
        resultsCountTitle.textContent = "Select ingredients to start searching";
        setGrid(cabinetResultsGrid, `
          <div class="no-results-card card">
            <p>👈 Check off ingredients in the sidebar to see cocktails you can make!</p>
            <p class="inline-suggestion">Just browsing? See the <a href="index.html">most popular cocktails</a> or the <a href="low-abv.html">zero-proof and low-alcohol drinks</a>.</p>
          </div>
        `);
        return;
      }

      // Same ingredients as last time (e.g. only the unit or servings changed): no new request
      const key = checkedIngredients.slice().sort().join("|");
      if (key === lastResult.key) { renderCabinetResults(); return; }

      const seq = ++searchSeq;
      resultsCountTitle.textContent = "Searching…";
      try {
        const result = await api("/api/cabinet", {
          method: "POST",
          body: JSON.stringify({ ingredients: checkedIngredients })
        });
        if (seq !== searchSeq) return; // a newer search has started
        [...result.exact, ...result.partial].forEach(d => extraDrinks.set(String(d.id), d));
        lastResult = { key, exact: result.exact, partial: result.partial };
        renderCabinetResults();
      } catch (err) {
        if (seq !== searchSeq) return;
        resultsCountTitle.textContent = "Search failed";
        setGrid(cabinetResultsGrid, `<div class="no-results-card card" role="alert"><p>${esc(err.message)}</p></div>`);
      }
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
      if (recipesLoadError) return setGrid(lowAbvGrid, loadErrorHTML(recipesLoadError));
      const filtered = lowAbvDatabase.filter(item => {
        if (activeFilter === "all") return true;
        return item.type === activeFilter;
      });

      setGrid(lowAbvGrid, filtered.map((cocktail, i) =>
        renderCardHTML(cocktail, `<span class="abv-badge ${esc(cocktail.type)}">${esc(cocktail.abvText)}</span>`, "", i)
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
      if (recipesLoadError) return setGrid(minimalistGrid, loadErrorHTML(recipesLoadError));
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
      if (recipesLoadError) return setGrid(quizRecsGrid, loadErrorHTML(recipesLoadError));
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


  // 9b. COMMUNITY RECIPES + "SHARE YOUR RECIPE" FORM ("community.html")
  const communityGrid = document.getElementById("community-grid");
  const loadMoreBtn = document.getElementById("community-load-more");
  let reloadCommunity = null;

  if (communityGrid) {
    let communityDrinks = [];
    let nextBefore = null;
    let loadingPage = false;

    const badgeFor = (c) => c.type
      ? `<span class="abv-badge ${esc(c.type)}">${esc(c.abvText)}</span>`
      : `<span class="community-badge">Community</span>`;

    function renderCommunityGrid() {
      if (!communityDrinks.length) {
        setGrid(communityGrid, `
          <div class="no-results-card card">
            <p>No community recipes yet. Be the first to share one! 🍸</p>
            <p class="inline-suggestion"><a href="#share">Share your recipe</a></p>
          </div>`);
        return;
      }
      setGrid(communityGrid, communityDrinks.map((c, i) => renderCardHTML(c, badgeFor(c), "", i)).join(""));
    }

    // Loads 12 recipes at a time. "Load more" asks for recipes older than the
    // last one shown (keyset pagination), so every page is equally fast.
    async function loadCommunityPage(reset = false) {
      if (loadingPage) return;
      loadingPage = true;
      if (loadMoreBtn) { loadMoreBtn.disabled = true; loadMoreBtn.textContent = "Loading…"; }
      try {
        const params = new URLSearchParams({ section: "community", limit: "12" });
        if (!reset && nextBefore) params.set("before", String(nextBefore));
        const data = await api(`/api/recipes?${params}`);
        if (reset) { communityDrinks = []; resetReveals(communityGrid); }
        communityDrinks = communityDrinks.concat(data.recipes);
        data.recipes.forEach(d => extraDrinks.set(String(d.id), d));
        nextBefore = data.nextBefore;
        renderCommunityGrid();
        injectRecipeSchema(communityDrinks);
      } catch (err) {
        if (!communityDrinks.length) setGrid(communityGrid, loadErrorHTML(err));
        else alert(err.message);
      } finally {
        loadingPage = false;
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = "Load more recipes";
          loadMoreBtn.classList.toggle("hidden", !nextBefore);
        }
      }
    }
    reloadCommunity = () => loadCommunityPage(true);
    afterRecipeChange.push(reloadCommunity);

    if (loadMoreBtn) loadMoreBtn.addEventListener("click", () => loadCommunityPage());
    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); renderCommunityGrid(); });
    if (servingsInput) servingsInput.addEventListener("input", renderCommunityGrid);

    loadCommunityPage(true);
  }

  const recipeForm = document.getElementById("recipe-form");
  const shareLoginPrompt = document.getElementById("share-login-prompt");
  if (recipeForm && !currentUser) {
    // Sharing needs an account: show the "Log in / Sign up" card instead of the form
    recipeForm.classList.add("hidden");
    if (shareLoginPrompt) shareLoginPrompt.classList.remove("hidden");
    const intro = document.querySelector(".share-intro");
    if (intro) intro.classList.add("hidden");
  } else if (recipeForm) {
    const shareTitle = document.getElementById("share-title");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const currentPhoto = document.getElementById("current-photo");
    const removePhotoBox = document.getElementById("remove-photo");
    const signedInAs = document.getElementById("signed-in-as");
    if (signedInAs) signedInAs.textContent = currentUser.username;
    let editId = null;
    const ingredientRows = document.getElementById("ingredient-rows");
    const addIngredientBtn = document.getElementById("add-ingredient-btn");
    const formStatus = document.getElementById("form-status");
    const submitBtn = recipeForm.querySelector('button[type="submit"]');
    const unitSelect = recipeForm.elements.unit;
    const photoInput = recipeForm.elements.photo;
    const photoPreview = document.getElementById("photo-preview");
    const suggestions = document.getElementById("ingredient-suggestions");
    const MAX_ROWS = 12;

    function showStatus(message, kind) {
      formStatus.textContent = message;
      formStatus.className = `form-status ${kind || ""}`;
      formStatus.classList.remove("hidden");
    }

    function renumberRows() {
      ingredientRows.querySelectorAll(".ingredient-row").forEach((row, i) => {
        row.querySelector(".ing-name").setAttribute("aria-label", `Ingredient ${i + 1}`);
        row.querySelector(".ing-amount").setAttribute("aria-label", `Amount of ingredient ${i + 1} in ${unitSelect.value}`);
        row.querySelector(".remove-ing").setAttribute("aria-label", `Remove ingredient ${i + 1}`);
      });
      addIngredientBtn.disabled = ingredientRows.children.length >= MAX_ROWS;
    }

    function addIngredientRow(focus = false) {
      if (ingredientRows.children.length >= MAX_ROWS) return;
      const row = document.createElement("div");
      row.className = "ingredient-row";
      row.innerHTML = `
        <input type="text" class="search-input ing-name" list="ingredient-suggestions" maxlength="60" placeholder="e.g. gin" autocomplete="off">
        <input type="number" class="search-input ing-amount" min="0" max="900" step="any" inputmode="decimal" placeholder="e.g. 50">
        <span class="ing-unit">${esc(unitSelect.value)}</span>
        <button type="button" class="remove-ing" title="Remove">✕</button>`;
      ingredientRows.appendChild(row);
      renumberRows();
      if (focus) row.querySelector(".ing-name").focus();
    }

    ingredientRows.addEventListener("click", (e) => {
      const btn = e.target.closest(".remove-ing");
      if (!btn) return;
      if (ingredientRows.children.length > 2) btn.closest(".ingredient-row").remove();
      else btn.closest(".ingredient-row").querySelectorAll("input").forEach(i => { i.value = ""; });
      renumberRows();
    });
    addIngredientBtn.addEventListener("click", () => addIngredientRow(true));
    unitSelect.addEventListener("change", () => {
      ingredientRows.querySelectorAll(".ing-unit").forEach(s => { s.textContent = unitSelect.value; });
      renumberRows();
    });
    for (let i = 0; i < 3; i++) addIngredientRow();

    // Suggest ingredient names that are already in the database (same spelling = better cabinet search)
    api("/api/ingredients").then(({ ingredients }) => {
      suggestions.innerHTML = ingredients.map(i => `<option value="${esc(i.name)}"></option>`).join("");
    }).catch(() => { /* suggestions are optional */ });

    // Photos are shrunk in the browser to max 1200px WebP/JPEG before upload
    function readPhoto(file) {
      return new Promise((resolve, reject) => {
        if (!file) return resolve(null);
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("The photo must be a JPG, PNG or WebP file."));
        if (file.size > 15 * 1024 * 1024) return reject(new Error("That photo is very large. Please pick one under 15 MB."));
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          let data = canvas.toDataURL("image/webp", 0.82);
          if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/jpeg", 0.85);
          if (data.length > 2.6 * 1024 * 1024) return reject(new Error("The photo is still too large after shrinking. Try another one."));
          resolve(data);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo couldn't be opened.")); };
        img.src = url;
      });
    }

    let photoData = null;
    photoInput.addEventListener("change", async () => {
      photoData = null;
      photoPreview.innerHTML = "";
      try {
        photoData = await readPhoto(photoInput.files[0]);
        if (photoData) {
          const img = document.createElement("img");
          img.src = photoData;
          img.alt = "Preview of your photo";
          photoPreview.appendChild(img);
        }
      } catch (err) {
        photoInput.value = "";
        showStatus(err.message, "error");
      }
    });

    recipeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = recipeForm.elements;

      const ingredients = Array.from(ingredientRows.querySelectorAll(".ingredient-row"))
        .map(row => ({ name: row.querySelector(".ing-name").value.trim(), amount: row.querySelector(".ing-amount").value }))
        .filter(i => i.name || i.amount);
      const missingAmount = ingredients.find(i => i.name && !(Number(i.amount) > 0));
      if (ingredients.filter(i => i.name).length < 2) return showStatus("Add at least two ingredients.", "error");
      if (missingAmount) return showStatus(`Give an amount for "${missingAmount.name}".`, "error");
      if (ingredients.some(i => !i.name)) return showStatus("One of the amounts has no ingredient name.", "error");

      const payload = {
        name: f.name.value,
        tagline: f.tagline.value,
        flavorProfile: f.flavorProfile.value || null,
        abvType: f.abvType.value || null,
        glass: f.glass.value,
        method: f.method.value,
        garnish: f.garnish.value,
        ice: f.ice.value,
        unit: unitSelect.value,
        ingredients,
        instructions: f.instructions.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        image: photoData,
        removeImage: !!(editId && removePhotoBox && removePhotoBox.checked && !photoData),
        website: f.website.value // hidden field, real visitors leave it empty
      };

      const wasEditing = editId;
      submitBtn.disabled = true;
      submitBtn.textContent = wasEditing ? "Saving…" : "Sending…";
      try {
        const result = wasEditing
          ? await api(`/api/recipes/${editId}`, { method: "PUT", body: JSON.stringify(payload) })
          : await api("/api/recipes", { method: "POST", body: JSON.stringify(payload) });
        resetForm();
        showStatus(result.message, "success");
        const id = wasEditing || result.id;
        extraDrinks.delete(String(id));
        if (reloadCommunity) await reloadCommunity();
        if (wasEditing || result.published) {
          const drink = await fetchDrinkById(id);
          if (drink) openModal(drink);
        }
      } catch (err) {
        showStatus(err.message, "error");
        if (!sessionToken) showStatus("Your login has expired. Please log in again (menu → Log in), then try once more.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = editId ? "Save changes" : "Share recipe";
      }
    });

    // ---- Edit mode: community.html?edit=1001#share ----
    function resetForm() {
      editId = null;
      recipeForm.reset();
      photoData = null;
      photoPreview.innerHTML = "";
      ingredientRows.innerHTML = "";
      for (let i = 0; i < 3; i++) addIngredientRow();
      unitSelect.dispatchEvent(new Event("change"));
      if (shareTitle) shareTitle.textContent = "Share your recipe";
      submitBtn.textContent = "Share recipe";
      if (cancelEditBtn) cancelEditBtn.classList.add("hidden");
      if (currentPhoto) { currentPhoto.classList.add("hidden"); currentPhoto.querySelector(".current-photo-img").innerHTML = ""; }
      if (/[?&]edit=/.test(window.location.search) && window.history && history.replaceState) {
        history.replaceState(null, "", window.location.pathname + "#share");
      }
    }

    async function startEditing(id) {
      try {
        const { recipe } = await api(`/api/recipes/${encodeURIComponent(id)}/edit`);
        editId = recipe.id;
        const f = recipeForm.elements;
        f.name.value = recipe.name;
        f.tagline.value = recipe.tagline === "Shared by the pour. community" ? "" : recipe.tagline;
        f.flavorProfile.value = recipe.flavorProfile || "";
        f.abvType.value = recipe.type || "";
        f.glass.value = recipe.glass || "";
        f.method.value = recipe.method || "";
        f.garnish.value = recipe.garnish || "";
        f.ice.value = recipe.ice || "";
        f.instructions.value = (recipe.instructions || []).join("\n");
        unitSelect.value = "ml";
        ingredientRows.innerHTML = "";
        const count = Math.max(2, recipe.ingredients.length);
        for (let i = 0; i < count; i++) addIngredientRow();
        recipe.ingredients.forEach((ing, i) => {
          const row = ingredientRows.children[i];
          row.querySelector(".ing-name").value = ing.name;
          row.querySelector(".ing-amount").value = formatAmount(ing.oz * CONVERSIONS.ml);
        });
        unitSelect.dispatchEvent(new Event("change"));
        if (recipe.image && currentPhoto) {
          const img = document.createElement("img");
          img.src = imageUrl(recipe.image);
          img.alt = "Current photo";
          const holder = currentPhoto.querySelector(".current-photo-img");
          holder.innerHTML = "";
          holder.appendChild(img);
          if (removePhotoBox) removePhotoBox.checked = false;
          currentPhoto.classList.remove("hidden");
        }
        if (shareTitle) shareTitle.textContent = `Edit "${recipe.name}"`;
        submitBtn.textContent = "Save changes";
        if (cancelEditBtn) cancelEditBtn.classList.remove("hidden");
        formStatus.classList.add("hidden");
        document.getElementById("share").scrollIntoView({ block: "start" });
      } catch (err) {
        showStatus(err.message, "error");
      }
    }

    if (cancelEditBtn) cancelEditBtn.addEventListener("click", () => { resetForm(); formStatus.classList.add("hidden"); });
    const editParam = new URLSearchParams(window.location.search).get("edit");
    if (editParam && /^\d+$/.test(editParam)) startEditing(editParam);
  }


  // 9c. ACCOUNT PAGE: LOG IN, SIGN UP, LOG OUT, MY RECIPES ("account.html")
  const accountAuth = document.getElementById("account-auth");
  const accountPanel = document.getElementById("account-panel");
  if (accountAuth && accountPanel) {
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    const myGrid = document.getElementById("my-recipes-grid");
    let myDrinks = [];

    const STATUS_BADGE = {
      0: `<span class="status-badge pending">Waiting for review</span>`,
      1: `<span class="community-badge">Live</span>`,
      2: `<span class="status-badge hidden-status">Hidden by admin</span>`
    };

    function renderMyRecipes() {
      if (!myDrinks.length) {
        setGrid(myGrid, `
          <div class="no-results-card card">
            <p>You haven't shared any recipes yet.</p>
            <p class="inline-suggestion"><a href="community.html#share">Share your first recipe</a></p>
          </div>`);
        return;
      }
      setGrid(myGrid, myDrinks.map((d, i) => renderCardHTML(d, STATUS_BADGE[d.status] || "", `
        <div class="card-owner-actions">
          <a class="btn-edit" href="community.html?edit=${d.id}#share">✏️ Edit</a>
          <button type="button" class="btn-delete" data-delete-id="${d.id}">🗑 Delete</button>
        </div>`, i)).join(""));
    }

    async function loadMyRecipes() {
      try {
        const { recipes } = await api("/api/my/recipes");
        myDrinks = recipes;
        recipes.forEach(d => extraDrinks.set(String(d.id), d));
        resetReveals(myGrid);
        renderMyRecipes();
      } catch (err) {
        if (!sessionToken) return showAccount(); // login expired
        setGrid(myGrid, loadErrorHTML(err));
      }
    }
    afterRecipeChange.push(loadMyRecipes);

    function showAccount() {
      renderNavAccount();
      if (!currentUser) {
        accountPanel.classList.add("hidden");
        accountAuth.classList.remove("hidden");
        document.title = "Log in or sign up | pour.";
        return;
      }
      accountAuth.classList.add("hidden");
      accountPanel.classList.remove("hidden");
      document.title = "My account | pour.";
      document.getElementById("account-username").textContent = currentUser.username;
      document.getElementById("admin-note").classList.toggle("hidden", !currentUser.isAdmin);
      loadMyRecipes();
    }

    function wireAuthForm(form, path) {
      const status = form.querySelector(".form-status");
      const button = form.querySelector('button[type="submit"]');
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = form.elements.username.value.trim();
        const password = form.elements.password.value;
        const show = (msg) => { status.textContent = msg; status.className = "form-status error"; };
        if (form.elements.password2 && password !== form.elements.password2.value) return show("The two passwords don't match.");
        button.disabled = true;
        try {
          const result = await api(path, { method: "POST", body: JSON.stringify({ username, password }) });
          setSession(result.token, result.user);
          form.reset();
          status.className = "form-status hidden";
          if (next) { window.location.href = next; return; }
          showAccount();
        } catch (err) {
          show(err.message);
        } finally {
          button.disabled = false;
        }
      });
    }
    wireAuthForm(document.getElementById("login-form"), "/api/auth/login");
    wireAuthForm(document.getElementById("signup-form"), "/api/auth/signup");

    document.getElementById("logout-btn").addEventListener("click", async () => {
      try { await api("/api/auth/logout", { method: "POST" }); } catch (e) { /* log out locally anyway */ }
      clearSession();
      myDrinks = [];
      showAccount();
    });

    if (unitBtn) unitBtn.addEventListener("click", () => { toggleUnit(); renderMyRecipes(); });
    if (servingsInput) servingsInput.addEventListener("input", renderMyRecipes);

    showAccount();
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
