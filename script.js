(() => {
  "use strict";

  const products = window.PRODUCTS || [];
  const categories = window.PRODUCT_CATEGORIES || [];
  const root = document.querySelector("#app-content");
  const storageKeys = {
    cart: "mercado-local-cart-v2",
    favorites: "mercado-local-favorites-v2",
    preferences: "mercado-local-preferences-v2",
    recentlyViewed: "mercado-local-recently-viewed-v2",
  };

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      showToast("El navegador no pudo guardar los cambios en este dispositivo.");
    }
  }

  const savedPreferences = readStorage(storageKeys.preferences, {});
  const state = {
    route: "home",
    productId: null,
    category: savedPreferences.category || "Todos",
    query: "",
    filters: {
      minPrice: savedPreferences.minPrice || "",
      maxPrice: savedPreferences.maxPrice || "",
      discountOnly: Boolean(savedPreferences.discountOnly),
      minimumRating: savedPreferences.minimumRating || 0,
      availability: savedPreferences.availability || "all",
      condition: savedPreferences.condition || "all",
    },
    sort: savedPreferences.sort || "relevance",
    cart: normalizeCart(readStorage(storageKeys.cart, [])),
    favorites: new Set(readStorage(storageKeys.favorites, [])),
    recentlyViewed: readStorage(storageKeys.recentlyViewed, []),
    lastOrder: null,
    checkoutMessage: "",
  };

  const currency = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
  const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (character) => escapeMap[character]);
  const formatPrice = (value) => currency.format(Number(value) || 0).replace(/\u00a0/g, " ");
  const byId = (id) => products.find((product) => product.id === id);

  function normalizeCart(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item.id === "string" && Number.isFinite(Number(item.quantity)))
      .map((item) => ({
        key: String(item.key || `${item.id}||`),
        id: item.id,
        quantity: Math.max(1, Math.floor(Number(item.quantity))),
        variants: item.variants && typeof item.variants === "object" ? item.variants : {},
      }));
  }

  function persistPreferences() {
    writeStorage(storageKeys.preferences, {
      category: state.category,
      minPrice: state.filters.minPrice,
      maxPrice: state.filters.maxPrice,
      discountOnly: state.filters.discountOnly,
      minimumRating: state.filters.minimumRating,
      availability: state.filters.availability,
      condition: state.filters.condition,
      sort: state.sort,
    });
  }

  function routeHash(route = state.route) {
    if (route === "product") return `#producto/${encodeURIComponent(state.productId || "")}`;
    if (route === "category") return `#categoria/${encodeURIComponent(state.category)}`;
    const routeAliases = {
      home: "inicio",
      favorites: "favoritos",
      cart: "carrito",
      checkout: "checkout",
      offers: "ofertas",
      categories: "categorias",
      search: "buscar",
      success: "pedido",
    };
    return `#${routeAliases[route] || route}`;
  }

  function routeFromHash() {
    let hash = window.location.hash.replace(/^#/, "");
    try {
      hash = decodeURIComponent(hash);
    } catch {
      hash = "";
    }
    if (!hash || hash === "inicio") return { route: "home" };
    if (hash.startsWith("producto/")) return { route: "product", productId: hash.slice("producto/".length) };
    if (hash.startsWith("categoria/")) return { route: "category", category: hash.slice("categoria/".length) };
    if (["home", "favoritos", "carrito", "checkout", "ofertas", "categorias", "buscar", "pedido"].includes(hash)) {
      return {
        route: ({
          inicio: "home",
          favoritos: "favorites",
          carrito: "cart",
          checkout: "checkout",
          ofertas: "offers",
          categorias: "categories",
          buscar: "search",
          pedido: "success",
        })[hash] || hash,
      };
    }
    return { route: "home" };
  }

  function navigate(route, options = {}) {
    state.route = route;
    if (options.productId) state.productId = options.productId;
    if (options.category) state.category = options.category;
    const nextHash = routeHash(route);
    if (window.location.hash !== nextHash) {
      const method = options.replace ? "replaceState" : "pushState";
      window.history[method]({ route }, "", nextHash);
    }
    render();
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ratingStars(rating, sizeClass = "") {
    const numeric = Number(rating) || 0;
    if (!numeric) return `<span class="rating-unrated ${sizeClass}">Aún sin calificaciones</span>`;
    const full = Math.round(numeric);
    return `<span class="rating-line ${sizeClass}" aria-label="${numeric.toFixed(1)} de 5 estrellas"><span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span><b>${numeric.toFixed(1)}</b></span>`;
  }

  function stockLabel(product) {
    if (product.stock <= 0) return '<span class="stock-state out-of-stock"><i></i> Agotado</span>';
    if (product.stock <= 5) return `<span class="stock-state low-stock"><i></i> Solo quedan ${product.stock}</span>`;
    return '<span class="stock-state in-stock"><i></i> Disponible</span>';
  }

  function imageMarkup(src, alt, className = "") {
    const source = escapeHTML(src || "assets/products/product-placeholder.svg");
    return `<img class="${className}" src="${source}" alt="${escapeHTML(alt)}" loading="lazy" onerror="this.onerror=null;this.src='assets/products/product-placeholder.svg';" />`;
  }

  function productCard(product, mode = "standard") {
    const saved = state.favorites.has(product.id);
    const out = product.stock <= 0;
    return `
      <article class="product-card ${mode === "compact" ? "product-card--compact" : ""}" data-product-card="${escapeHTML(product.id)}">
        <div class="product-card-visual">
          <button class="product-image-link" type="button" data-open-product="${escapeHTML(product.id)}" aria-label="Ver ${escapeHTML(product.name)}">
            ${imageMarkup(product.image, product.name, "product-card-image")}
          </button>
          ${product.discount ? `<span class="discount-badge">-${product.discount}%</span>` : ""}
          ${product.isNew ? '<span class="new-badge">NUEVO</span>' : ""}
          <button class="favorite-toggle ${saved ? "is-favorite" : ""}" type="button" data-favorite="${escapeHTML(product.id)}" aria-label="${saved ? "Quitar de favoritos" : "Agregar a favoritos"}">${saved ? "♥" : "♡"}</button>
        </div>
        <div class="product-card-body">
          <div class="product-card-meta"><span class="product-category">${escapeHTML(product.category)}</span><span class="product-condition">${escapeHTML(product.condition || "Nuevo")}</span></div>
          <button class="product-title-button" type="button" data-open-product="${escapeHTML(product.id)}">${escapeHTML(product.name)}</button>
          <div class="product-rating">${ratingStars(product.rating, "rating-line--small")}<span>(${product.reviewCount})</span></div>
          <div class="product-card-price">
            <strong>${formatPrice(product.price)}</strong>
            ${product.previousPrice ? `<del>${formatPrice(product.previousPrice)}</del>` : ""}
          </div>
          <div class="product-card-foot">
            ${stockLabel(product)}
            <button class="quick-add ${out ? "is-disabled" : ""}" type="button" data-quick-add="${escapeHTML(product.id)}" ${out ? "disabled" : ""} aria-label="Agregar ${escapeHTML(product.name)} al carrito">${out ? "Agotado" : "＋ Carrito"}</button>
          </div>
        </div>
      </article>
    `;
  }

  function productGrid(items, className = "") {
    const isListingGrid = className.includes("listing-grid");
    return `<div class="product-grid ${className}" ${isListingGrid ? 'id="current-listing-grid"' : ""} ${isListingGrid && !items.length ? "hidden" : ""}>${items.map((product) => productCard(product, className.includes("rail") ? "compact" : "standard")).join("")}</div>`;
  }

  function categoryButton(category, active = false) {
    const icons = {
      "Tecnología": "⌘",
      "Celulares": "▯",
      "Computadores": "▱",
      "Videojuegos": "⌁",
      "Ropa": "♧",
      "Calzado": "⌑",
      "Accesorios": "◇",
      "Hogar": "⌂",
      "Deportes": "◉",
      "Belleza": "✦",
      "Libros": "▤",
      "Productos para mascotas": "♡",
    };
    return `<button class="category-tile ${active ? "is-active" : ""}" type="button" data-category="${escapeHTML(category)}"><span class="category-tile-icon">${icons[category] || "✦"}</span><span>${escapeHTML(category)}</span><b>→</b></button>`;
  }

  function categoriesMarkup() {
    return categories.map((category) => categoryButton(category, state.category === category)).join("");
  }

  function getFilteredProducts() {
    let items = [...products];
    if (state.route === "favorites") {
      items = items.filter((product) => state.favorites.has(product.id));
    }
    if (state.route === "category" && state.category !== "Todos") {
      items = items.filter((product) => product.category === state.category);
    }
    if (state.route === "offers") {
      items = items.filter((product) => product.discount > 0);
    }
    if (state.query) {
      const tokens = state.query.toLocaleLowerCase("es").split(/\s+/).filter(Boolean);
      items = items.filter((product) => {
        const searchable = [
          product.name,
          product.category,
          product.description,
          product.keywords,
          ...(product.features || []),
        ].join(" ").toLocaleLowerCase("es");
        return tokens.every((token) => searchable.includes(token));
      });
    }
    if (state.category !== "Todos" && state.route !== "category" && state.route !== "favorites") {
      items = items.filter((product) => product.category === state.category);
    }
    const min = Number(state.filters.minPrice) || 0;
    const max = Number(state.filters.maxPrice) || Number.POSITIVE_INFINITY;
    items = items.filter((product) => {
      if (product.price < min || product.price > max) return false;
      if (state.filters.discountOnly && product.discount <= 0) return false;
      if (Number(product.rating) < Number(state.filters.minimumRating || 0)) return false;
      if (state.filters.availability === "available" && product.stock <= 0) return false;
      if (state.filters.availability === "out-of-stock" && product.stock > 0) return false;
      if (state.filters.condition !== "all" && product.condition !== state.filters.condition) return false;
      return true;
    });

    if (state.sort === "price-low") items.sort((a, b) => a.price - b.price);
    else if (state.sort === "price-high") items.sort((a, b) => b.price - a.price);
    else if (state.sort === "rating") items.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    else if (state.sort === "sold") items.sort((a, b) => b.sold - a.sold);
    else if (state.sort === "recent") items.sort((a, b) => a.age - b.age);
    else if (state.query) {
      const query = state.query.toLocaleLowerCase("es");
      items.sort((a, b) => relevance(b, query) - relevance(a, query) || b.rating - a.rating);
    } else {
      items.sort((a, b) => Number(b.featured) - Number(a.featured) || b.sold - a.sold);
    }
    return items;
  }

  function relevance(product, query) {
    const name = product.name.toLocaleLowerCase("es");
    const category = product.category.toLocaleLowerCase("es");
    if (name === query) return 5;
    if (name.startsWith(query)) return 4;
    if (name.includes(query)) return 3;
    if (category.includes(query)) return 2;
    return 1;
  }

  function renderShelf(title, subtitle, items, action = "") {
    if (!items.length) return "";
    return `
      <section class="content-section product-shelf">
        <div class="section-heading">
          <div><span class="section-eyebrow">${escapeHTML(subtitle)}</span><h2>${escapeHTML(title)}</h2></div>
          ${action ? `<button class="text-link" type="button" data-route="${action}">Ver todos <span>→</span></button>` : ""}
        </div>
        ${productGrid(items, "product-grid--rail")}
      </section>
    `;
  }

  function renderHome() {
    const featured = products.filter((product) => product.featured).slice(0, 4);
    const offers = [...products].filter((product) => product.discount > 0).sort((a, b) => b.discount - a.discount).slice(0, 4);
    const bestSellers = [...products].sort((a, b) => b.sold - a.sold).slice(0, 4);
    const newest = [...products].filter((product) => product.isNew).sort((a, b) => a.age - b.age).slice(0, 4);
    const recentlyViewed = state.recentlyViewed.map(byId).filter(Boolean);
    const recommended = recentlyViewed.length
      ? [...products].filter((product) => product.category === recentlyViewed[0].category && product.id !== recentlyViewed[0].id).slice(0, 4)
      : [...products].filter((product) => product.bestSeller).slice(0, 4);
    const filtered = getFilteredProducts();
    return `
      <section class="home-hero">
        <div class="hero-inner">
          <div class="hero-copy">
            <div class="location-pill"><span>⌖</span> Bogotá, Colombia <span class="pill-dot"></span> Compra local</div>
            <p class="hero-kicker">UN MARKETPLACE MÁS CERCA DE TI</p>
            <h1>Encuentra eso que<br /><em>estabas buscando.</em></h1>
            <p class="hero-description">Grandes hallazgos, buenos precios y miles de opciones para darle vida a tus ideas.</p>
            <form id="hero-search-form" class="hero-search">
              <span class="search-icon" aria-hidden="true">⌕</span>
              <input id="hero-search-input" type="search" placeholder="¿Qué quieres encontrar hoy?" autocomplete="off" />
              <button class="primary-button" type="submit">Buscar <span>↗</span></button>
            </form>
            <div class="hero-trust"><span>✓ Compra protegida demo</span><span>✓ Vendedores locales</span><span>✓ Nuevas ofertas cada día</span></div>
          </div>
          <div class="hero-art">
            ${imageMarkup("assets/products/tech-laptop.jpg", "Productos destacados de tecnología", "hero-product-image")}
            <div class="hero-float-card"><span class="float-icon">✦</span><span><b>Ofertas de temporada</b><small>Hasta 30% de descuento</small></span></div>
            <div class="hero-roundel"><span>BUENOS<br />HALLAZGOS</span><b>↗</b></div>
          </div>
        </div>
      </section>

      <div class="page-container">
        <section class="content-section category-section" id="categories-section">
          <div class="section-heading">
            <div><span class="section-eyebrow">EXPLORA EL MARKETPLACE</span><h2>Compra por categoría</h2></div>
            <button class="text-link" type="button" data-route="categories">Todas las categorías <span>→</span></button>
          </div>
          <div class="category-grid">${categoriesMarkup()}</div>
        </section>

        <section class="deal-banner" id="offers-section">
          <div class="deal-copy"><span class="deal-kicker">POR TIEMPO LIMITADO</span><h2>Buenos precios,<br />mejores hallazgos.</h2><p>Descubre productos seleccionados con descuentos especiales.</p><button class="deal-button" type="button" data-route="offers">Explorar ofertas <span>→</span></button></div>
          <div class="deal-graphic" aria-hidden="true"><span class="deal-circle"></span><span class="deal-percent">%</span><span class="deal-tag">OFERTAS</span><span class="deal-spark">✦</span></div>
        </section>

        ${renderShelf("Productos destacados", "ELEGIDOS PARA TI", featured, "categories")}
        ${renderShelf("Ofertas especiales", "PRECIO ESPECIAL", offers, "offers")}
        ${renderShelf("Los más vendidos", "FAVORITOS DE LA COMUNIDAD", bestSellers, "categories")}
        ${renderShelf("Nuevos productos", "RECIÉN LLEGADOS", newest, "categories")}
        ${renderShelf("Recomendados para ti", recentlyViewed.length ? "BASADOS EN LO QUE VISTE" : "TENDENCIAS DE LA SEMANA", recommended, "categories")}

        <section class="content-section catalog-section" id="catalog-section">
          <div class="section-heading catalog-title-row">
            <div><span class="section-eyebrow">DESCUBRE ALGO NUEVO</span><h2>Todo el marketplace</h2><p>Artículos elegidos para ti, listos para encontrar un nuevo hogar.</p></div>
            <span class="catalog-live"><i></i> Catálogo actualizado</span>
          </div>
          <div class="listing-layout">
            ${renderFilters()}
            <div class="listing-main">
              ${renderListingToolbar(filtered.length)}
              ${productGrid(filtered, "listing-grid")}
              ${emptyResults(filtered.length)}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderFilters() {
    const selectedCategory = state.category === "Todos" ? "" : state.category;
    return `
      <aside class="filters-panel">
        <div class="filter-heading"><div><span class="section-eyebrow">AFINA TU BÚSQUEDA</span><h3>Filtros</h3></div><button class="clear-filters" type="button" data-action="clear-filters">Limpiar</button></div>
        <label class="filter-field">Categoría
          <select id="filter-category"><option value="">Todas las categorías</option>${categories.map((category) => `<option value="${escapeHTML(category)}" ${category === selectedCategory ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}</select>
        </label>
        <fieldset class="filter-field price-filter"><legend>Rango de precio</legend><div class="price-inputs"><label><span>Mínimo</span><input id="min-price-input" type="number" min="0" placeholder="$ 0" value="${escapeHTML(state.filters.minPrice)}" /></label><i>—</i><label><span>Máximo</span><input id="max-price-input" type="number" min="0" placeholder="Sin límite" value="${escapeHTML(state.filters.maxPrice)}" /></label></div></fieldset>
        <label class="check-filter"><input id="discount-filter" type="checkbox" ${state.filters.discountOnly ? "checked" : ""} /><span class="custom-check"></span><span>Solo productos con descuento</span></label>
        <label class="filter-field">Calificación mínima
          <select id="rating-filter"><option value="0" ${Number(state.filters.minimumRating) === 0 ? "selected" : ""}>Cualquier calificación</option><option value="4" ${Number(state.filters.minimumRating) === 4 ? "selected" : ""}>★ 4.0 y más</option><option value="4.5" ${Number(state.filters.minimumRating) === 4.5 ? "selected" : ""}>★ 4.5 y más</option><option value="4.8" ${Number(state.filters.minimumRating) === 4.8 ? "selected" : ""}>★ 4.8 y más</option></select>
        </label>
        <label class="filter-field">Disponibilidad
          <select id="availability-filter"><option value="all" ${state.filters.availability === "all" ? "selected" : ""}>Todos los productos</option><option value="available" ${state.filters.availability === "available" ? "selected" : ""}>Disponibles</option><option value="out-of-stock" ${state.filters.availability === "out-of-stock" ? "selected" : ""}>Agotados</option></select>
        </label>
        <label class="filter-field">Condición
          <select id="filter-condition"><option value="all" ${state.filters.condition === "all" ? "selected" : ""}>Cualquier condición</option>${["Nuevo", "Como nuevo", "Usado"].map((condition) => `<option value="${escapeHTML(condition)}" ${state.filters.condition === condition ? "selected" : ""}>${escapeHTML(condition)}</option>`).join("")}</select>
        </label>
        <div class="filter-safe"><span>✓</span><p><b>Compra con confianza</b><br />Revisa cada descripción y el stock disponible antes de agregar al carrito.</p></div>
      </aside>
    `;
  }

  function renderListingToolbar(count, heading = "Productos") {
    return `
      <div class="results-toolbar">
        <div><h3>${escapeHTML(heading)}</h3><p id="current-result-count">${count} producto${count === 1 ? "" : "s"} encontrados</p></div>
        <label class="sort-control">Ordenar por
          <select id="sort-select">
            <option value="relevance" ${state.sort === "relevance" ? "selected" : ""}>Relevancia</option>
            <option value="price-low" ${state.sort === "price-low" ? "selected" : ""}>Precio: menor a mayor</option>
            <option value="price-high" ${state.sort === "price-high" ? "selected" : ""}>Precio: mayor a menor</option>
            <option value="rating" ${state.sort === "rating" ? "selected" : ""}>Mejor calificación</option>
            <option value="sold" ${state.sort === "sold" ? "selected" : ""}>Más vendidos</option>
            <option value="recent" ${state.sort === "recent" ? "selected" : ""}>Más recientes</option>
          </select>
        </label>
      </div>
    `;
  }

  function emptyResults(count) {
    return `<div class="empty-state" id="current-empty-state" ${count ? "hidden" : ""}><span class="empty-icon">⌕</span><h3>No encontramos productos</h3><p>Prueba con otra búsqueda o modifica los filtros.</p><button class="secondary-button" type="button" data-action="clear-filters">Limpiar búsqueda y filtros</button></div>`;
  }

  function renderListingPage({ eyebrow, title, description, heading, products: items, showFilters = true, emptyTitle = "Todavía no hay publicaciones" }) {
    const listingFilters = showFilters ? renderFilters() : "";
    const productsMarkup = productGrid(items, "listing-grid");
    const empty = items.length
      ? ""
      : `<div class="empty-state" id="current-empty-state"><span class="empty-icon">⌕</span><h3>${escapeHTML(emptyTitle)}</h3><p>${state.query ? "Intenta con otra palabra o ajusta los filtros." : "Explora el catálogo para descubrir productos."}</p><button class="secondary-button" type="button" data-action="clear-filters">Ver todos los productos</button></div>`;
    return `
      <div class="page-container page-content">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>${escapeHTML(title)}</strong></div>
        <section class="listing-page-heading"><div><span class="section-eyebrow">${escapeHTML(eyebrow)}</span><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></div><span class="catalog-live"><i></i> Catálogo actualizado</span></section>
        <div class="listing-layout ${showFilters ? "" : "listing-layout--wide"}">
          ${listingFilters}
          <div class="listing-main">
            ${renderListingToolbar(items.length, heading)}
            ${productsMarkup}
            ${empty}
          </div>
        </div>
      </div>
    `;
  }

  function renderCategoryDirectory() {
    return `
      <div class="page-container page-content">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>Categorías</strong></div>
        <section class="listing-page-heading"><div><span class="section-eyebrow">ENCUENTRA LO QUE BUSCAS</span><h1>Explora por categoría</h1><p>Elige un departamento y encuentra productos que se ajustan a tus ideas.</p></div></section>
        <div class="category-directory">${categories.map((category) => `<div class="directory-category">${categoryButton(category)}<p>${products.filter((product) => product.category === category).length} productos para descubrir</p></div>`).join("")}</div>
        <section class="content-section"><div class="section-heading"><div><span class="section-eyebrow">TENDENCIAS</span><h2>Los favoritos de la comunidad</h2></div></div>${productGrid([...products].sort((a, b) => b.sold - a.sold).slice(0, 4), "product-grid--rail")}</section>
      </div>
    `;
  }

  function renderProductDetail() {
    const product = byId(state.productId);
    if (!product) return renderListingPage({
      eyebrow: "PRODUCTO NO DISPONIBLE",
      title: "No encontramos este producto",
      description: "Puede que la publicación ya no esté disponible.",
      heading: "Productos para ti",
      products: products.slice(0, 8),
    });
    const variants = Object.entries(product.variants || {})
      .filter(([, values]) => Array.isArray(values) && values.length)
      .map(([name, values]) => {
        const label = name === "size" ? "Talla o tamaño" : name === "color" ? "Color" : "Presentación";
        return `<label class="variant-control">${label}<select data-variant="${escapeHTML(name)}">${values.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("")}</select></label>`;
      }).join("");
    const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);
    const recommendations = related.length ? related : products.filter((item) => item.id !== product.id && item.bestSeller).slice(0, 4);
    const reviews = product.reviews || [];
    const average = product.rating ? product.rating.toFixed(1) : "—";
    return `
      <div class="page-container page-content product-page">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><button type="button" data-category="${escapeHTML(product.category)}">${escapeHTML(product.category)}</button><span>›</span><strong>${escapeHTML(product.name)}</strong></div>
        <section class="product-detail">
          <div class="product-gallery">
            <div class="product-main-photo">${imageMarkup(product.gallery[0], product.name, "detail-main-image")}<button type="button" class="favorite-toggle detail-favorite ${state.favorites.has(product.id) ? "is-favorite" : ""}" data-favorite="${escapeHTML(product.id)}" aria-label="Agregar a favoritos">${state.favorites.has(product.id) ? "♥" : "♡"}</button>${product.discount ? `<span class="discount-badge">-${product.discount}%</span>` : ""}</div>
            <div class="gallery-thumbnails">${product.gallery.map((image, index) => `<button type="button" class="gallery-thumb ${index === 0 ? "selected" : ""}" data-gallery-image="${escapeHTML(image)}">${imageMarkup(image, `${product.name} vista ${index + 1}`)}</button>`).join("")}</div>
          </div>
          <div class="product-detail-info">
            <div class="detail-category-row"><span class="detail-category">${escapeHTML(product.category)}</span><span class="detail-condition">${escapeHTML(product.condition || "Nuevo")}</span><span class="detail-sku">REF. ${escapeHTML(product.id.toUpperCase())}</span></div>
            <h1>${escapeHTML(product.name)}</h1>
            <a class="detail-rating-link" href="#product-reviews">${ratingStars(product.rating)}<span>${product.reviewCount} reseñas</span></a>
            <div class="detail-price-row"><strong>${formatPrice(product.price)}</strong>${product.previousPrice ? `<del>${formatPrice(product.previousPrice)}</del><span class="discount-text">Ahorras ${formatPrice(product.previousPrice - product.price)} (${product.discount}%)</span>` : ""}</div>
            ${stockLabel(product)}
            <p class="detail-description">${escapeHTML(product.description)}</p>
        ${variants ? `<div class="variant-list" id="product-detail-variants">${variants}</div>` : ""}
            <div class="purchase-controls">
              <div class="quantity-control" aria-label="Cantidad">
                <button type="button" data-quantity-step="-1" aria-label="Disminuir cantidad">−</button>
                <input id="product-quantity" type="number" min="1" max="${product.stock}" value="1" aria-label="Cantidad" />
                <button type="button" data-quantity-step="1" aria-label="Aumentar cantidad">＋</button>
              </div>
              <span class="stock-caption">${product.stock > 0 ? `${product.stock} disponibles` : "Producto agotado"}</span>
            </div>
            <div class="detail-actions">
              <button type="button" class="primary-button add-cart-button" data-add-to-cart="${escapeHTML(product.id)}" ${product.stock <= 0 ? "disabled" : ""}>${product.stock <= 0 ? "Producto agotado" : "Agregar al carrito"} <span>▱</span></button>
              <button type="button" class="detail-favorite-button ${state.favorites.has(product.id) ? "is-favorite" : ""}" data-favorite="${escapeHTML(product.id)}">${state.favorites.has(product.id) ? "♥ Guardado" : "♡ Favorito"}</button>
            </div>
            <div class="detail-contact-actions"><button type="button" data-action="message">✉ Enviar mensaje al vendedor</button><button type="button" data-action="interest">Me interesa</button></div>
            <div class="shipping-note"><span>✓</span><p><b>Compra de demostración</b><br />Sin pagos reales. El envío se calcula en el checkout.</p></div>
          </div>
        </section>

        <section class="product-information-grid">
          <div class="info-panel"><span class="section-eyebrow">DETALLES DEL PRODUCTO</span><h2>Descripción y características</h2><p>${escapeHTML(product.description)}</p><ul>${product.features.map((feature) => `<li>${escapeHTML(feature)}</li>`).join("")}</ul></div>
          <div class="info-panel stock-panel"><span class="section-eyebrow">DISPONIBILIDAD</span><h2>${product.stock > 0 ? "Listo para ti" : "Agotado por ahora"}</h2><p>${product.stock > 0 ? `${product.stock} unidades disponibles. Agrega al carrito para continuar con tu compra demo.` : "Este producto se muestra como referencia, pero no se puede agregar al carrito por el momento."}</p>${ratingStars(product.rating)}</div>
        </section>

        <section class="reviews-section" id="product-reviews">
          <div class="section-heading"><div><span class="section-eyebrow">OPINIONES DE COMPRADORES</span><h2>Reseñas del producto</h2></div><span class="reviews-total">${product.reviewCount} reseñas</span></div>
          <div class="reviews-overview">
            <div class="rating-score"><strong>${average}</strong>${ratingStars(product.rating)}<small>Promedio de calificaciones</small></div>
            <div class="rating-distribution">${product.ratingDistribution.map((row) => `<div class="distribution-row"><span>${row.stars} estrellas</span><div><i style="width:${row.percent}%"></i></div><b>${row.percent}%</b></div>`).join("")}</div>
          </div>
          <div class="review-list">${reviews.map((review) => `<article class="review-card"><div class="review-top"><span class="review-avatar">${escapeHTML(initials(review.name))}</span><div><strong>${escapeHTML(review.name)}</strong><small>${escapeHTML(review.date)}</small></div><span class="review-stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span></div><p>${escapeHTML(review.comment)}</p></article>`).join("")}</div>
        </section>
        ${renderShelf("También te puede interesar", "PRODUCTOS RELACIONADOS", recommendations, "categories")}
      </div>
    `;
  }

  function initials(name = "") {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ML";
  }

  function renderCart() {
    const items = state.cart.map((item) => ({ item, product: byId(item.id) })).filter((entry) => entry.product);
    const totals = cartTotals(items);
    if (!items.length) {
      return `
        <div class="page-container page-content">
          <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>Carrito</strong></div>
          <section class="empty-cart"><div class="empty-cart-illustration">▱</div><span class="section-eyebrow">TU COMPRA EMPIEZA AQUÍ</span><h1>Tu carrito está vacío</h1><p>Explora el catálogo y agrega los productos que te gusten.</p><button class="primary-button" type="button" data-route="home">Volver al marketplace <span>→</span></button></section>
          ${renderShelf("Lo más vendido", "PREFERIDOS DE LA COMUNIDAD", [...products].sort((a, b) => b.sold - a.sold).slice(0, 4))}
        </div>`;
    }
    return `
      <div class="page-container page-content">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>Carrito de compras</strong></div>
        <div class="cart-heading"><div><span class="section-eyebrow">TU SELECCIÓN</span><h1>Carrito de compras</h1><p>${items.reduce((sum, entry) => sum + entry.item.quantity, 0)} artículo(s) en tu carrito</p></div><button class="text-link" type="button" data-route="home">← Seguir comprando</button></div>
        <div class="cart-layout">
          <section class="cart-items">${items.map(({ item, product }) => renderCartItem(item, product)).join("")}</section>
          <aside class="order-summary">
            <span class="section-eyebrow">RESUMEN DE COMPRA</span><h2>Tu pedido</h2>
            <div class="summary-line"><span>Subtotal</span><b>${formatPrice(totals.subtotal)}</b></div>
            <div class="summary-line discount-line"><span>Descuentos</span><b>− ${formatPrice(totals.discount)}</b></div>
            <div class="summary-line"><span>Envío estimado</span><b>${totals.shipping ? formatPrice(totals.shipping) : "Gratis"}</b></div>
            <div class="summary-divider"></div>
            <div class="summary-line total-line"><span>Total</span><b>${formatPrice(totals.total)}</b></div>
            <small class="summary-caption">Checkout de demostración. No se realizará ningún cobro.</small>
            <button type="button" class="primary-button checkout-button" data-route="checkout">Continuar al checkout <span>→</span></button>
            <button type="button" class="text-button remove-all-button" data-action="empty-cart">Vaciar carrito</button>
            <div class="secure-note"><span>✓</span> Experiencia demo segura</div>
          </aside>
        </div>
      </div>
    `;
  }

  function renderCartItem(item, product) {
    const variantText = Object.values(item.variants || {}).filter(Boolean).join(" · ");
    const lineDiscount = product.previousPrice ? (product.previousPrice - product.price) * item.quantity : 0;
    return `
      <article class="cart-item">
        <button class="cart-item-image" type="button" data-open-product="${escapeHTML(product.id)}">${imageMarkup(product.image, product.name)}</button>
        <div class="cart-item-info">
          <span class="product-category">${escapeHTML(product.category)}</span>
          <button type="button" class="cart-item-title" data-open-product="${escapeHTML(product.id)}">${escapeHTML(product.name)}</button>
          ${variantText ? `<small class="cart-variant">${escapeHTML(variantText)}</small>` : ""}
          ${product.previousPrice ? `<small class="cart-saving">Ahorras ${formatPrice(lineDiscount)}</small>` : ""}
          <button type="button" class="remove-item" data-remove-cart="${escapeHTML(item.key)}">Eliminar</button>
        </div>
        <div class="cart-item-side"><strong>${formatPrice(product.price * item.quantity)}</strong><div class="quantity-control quantity-control--small"><button type="button" data-cart-step="-1" data-cart-key="${escapeHTML(item.key)}" aria-label="Disminuir cantidad">−</button><span>${item.quantity}</span><button type="button" data-cart-step="1" data-cart-key="${escapeHTML(item.key)}" aria-label="Aumentar cantidad">＋</button></div><small>${formatPrice(product.price)} c/u</small></div>
      </article>
    `;
  }

  function cartTotals(items = state.cart.map((item) => ({ item, product: byId(item.id) })).filter((entry) => entry.product)) {
    const subtotal = items.reduce((sum, { item, product }) => sum + Number(product.previousPrice || product.price) * item.quantity, 0);
    const savings = items.reduce((sum, { item, product }) => sum + Math.max(0, Number(product.previousPrice || product.price) - product.price) * item.quantity, 0);
    const afterDiscount = subtotal - savings;
    const shipping = afterDiscount >= 200000 || afterDiscount === 0 ? 0 : 7900;
    return { subtotal, discount: savings, shipping, total: afterDiscount + shipping };
  }

  function renderCheckout() {
    const items = state.cart.map((item) => ({ item, product: byId(item.id) })).filter((entry) => entry.product);
    if (!items.length) {
      state.route = "cart";
      return renderCart();
    }
    const totals = cartTotals(items);
    return `
      <div class="page-container page-content checkout-page">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><button type="button" data-route="cart">Carrito</button><span>›</span><strong>Checkout demo</strong></div>
        <div class="checkout-heading"><span class="section-eyebrow">ÚLTIMO PASO</span><h1>Finaliza tu pedido</h1><p>Esta experiencia es de demostración y no realiza cobros reales.</p></div>
        <div class="checkout-layout">
          <form id="checkout-form" class="checkout-form">
            <section class="checkout-section"><div class="checkout-section-heading"><span>01</span><div><h2>Datos de contacto</h2><p>¿A dónde enviamos la confirmación demo?</p></div></div><div class="form-grid"><label>Nombre completo<input name="name" required autocomplete="name" placeholder="Nombre y apellido" /></label><label>Correo electrónico<input name="email" type="email" required autocomplete="email" placeholder="nombre@correo.com" /></label><label class="form-field-wide">Dirección<input name="address" required autocomplete="street-address" placeholder="Calle, carrera y número" /></label><label>Ciudad<input name="city" required value="Bogotá" /></label><label>Teléfono<input name="phone" type="tel" required placeholder="300 000 0000" /></label></div></section>
            <section class="checkout-section"><div class="checkout-section-heading"><span>02</span><div><h2>Método de pago demo</h2><p>Selecciona una opción ficticia; no pediremos datos bancarios.</p></div></div><label class="payment-choice"><input type="radio" name="payment" value="Contraentrega demo" checked /><span class="payment-icon">▣</span><span><b>Pago contraentrega demo</b><small>Simula el pago al recibir el pedido.</small></span><i></i></label><label class="payment-choice"><input type="radio" name="payment" value="Pago electrónico demo" /><span class="payment-icon">⌁</span><span><b>Pago electrónico demo</b><small>Solo muestra la confirmación; no procesa una transacción.</small></span><i></i></label></section>
            <p class="checkout-error" id="checkout-error" role="alert"></p>
            <button class="primary-button place-order-button" type="submit">Confirmar pedido demo <span>↗</span></button>
            <button class="text-button back-to-cart" type="button" data-route="cart">← Volver al carrito</button>
          </form>
          <aside class="order-summary checkout-summary"><span class="section-eyebrow">TU PEDIDO</span><h2>${items.length} producto${items.length === 1 ? "" : "s"}</h2><div class="checkout-items-preview">${items.map(({ item, product }) => `<div class="checkout-preview-row">${imageMarkup(product.image, product.name)}<span><b>${escapeHTML(product.name)}</b><small>Cant. ${item.quantity}</small></span><strong>${formatPrice(product.price * item.quantity)}</strong></div>`).join("")}</div><div class="summary-divider"></div><div class="summary-line"><span>Subtotal</span><b>${formatPrice(totals.subtotal)}</b></div><div class="summary-line discount-line"><span>Descuentos</span><b>− ${formatPrice(totals.discount)}</b></div><div class="summary-line"><span>Envío</span><b>${totals.shipping ? formatPrice(totals.shipping) : "Gratis"}</b></div><div class="summary-divider"></div><div class="summary-line total-line"><span>Total demo</span><b>${formatPrice(totals.total)}</b></div></aside>
        </div>
      </div>
    `;
  }

  function renderSuccess() {
    if (!state.lastOrder) {
      state.route = "home";
      window.history.replaceState({ route: "home" }, "", "#inicio");
      return renderHome();
    }
    return `
      <div class="page-container page-content">
        <section class="order-success"><span class="success-check">✓</span><span class="section-eyebrow">PEDIDO DE DEMOSTRACIÓN</span><h1>¡Gracias, ${escapeHTML(state.lastOrder.name)}!</h1><p>Tu pedido de muestra quedó registrado. No se realizó ningún pago.</p><div class="success-reference"><span>Número de confirmación</span><strong>${escapeHTML(state.lastOrder.reference)}</strong></div><div class="success-summary"><span>Total simulado</span><b>${formatPrice(state.lastOrder.total)}</b></div><button class="primary-button" type="button" data-route="home">Volver al marketplace <span>→</span></button></section>
      </div>
    `;
  }

  function renderRoute() {
    const filtered = getFilteredProducts();
    if (state.route === "home") return renderHome();
    if (state.route === "categories") return renderCategoryDirectory();
    if (state.route === "category") {
      return renderListingPage({
        eyebrow: "COMPRA POR CATEGORÍA",
        title: state.category,
        description: `Explora ${state.category.toLocaleLowerCase("es")} disponibles en Mercado Local.`,
        heading: `Productos de ${state.category}`,
        products: filtered,
      });
    }
    if (state.route === "search") {
      return renderListingPage({
        eyebrow: "RESULTADOS DE BÚSQUEDA",
        title: state.query ? `Resultados para “${state.query}”` : "Buscar productos",
        description: "Explora productos de todas las categorías y ajusta los filtros para encontrar lo que necesitas.",
        heading: "Productos encontrados",
        products: filtered,
      });
    }
    if (state.route === "offers") {
      return renderListingPage({
        eyebrow: "PRECIO ESPECIAL",
        title: "Ofertas especiales",
        description: "Aprovecha descuentos en productos seleccionados. El porcentaje aparece en cada artículo.",
        heading: "Productos con descuento",
        products: filtered,
      });
    }
    if (state.route === "favorites") {
      return renderListingPage({
        eyebrow: "TU LISTA PERSONAL",
        title: "Productos favoritos",
        description: "Aquí encuentras los artículos que guardaste para verlos después.",
        heading: "Tus productos guardados",
        products: filtered,
        showFilters: false,
        emptyTitle: "Aún no tienes favoritos",
      });
    }
    if (state.route === "cart") return renderCart();
    if (state.route === "checkout") return renderCheckout();
    if (state.route === "success") return renderSuccess();
    if (state.route === "product") return renderProductDetail();
    return renderHome();
  }

  function render() {
    try {
      if (state.route === "checkout" && !state.cart.length) {
        state.route = "cart";
        window.history.replaceState({ route: "cart" }, "", "#carrito");
      }
      root.innerHTML = renderRoute();
      updateHeader();
      renderSuggestions();
      if (state.route === "checkout" && !state.cart.length) {
        window.history.replaceState({ route: "cart" }, "", "#carrito");
      }
    } catch (error) {
      console.error("No se pudo mostrar esta pantalla:", error);
      root.innerHTML = `<div class="page-container error-state"><span>!</span><h1>No pudimos cargar esta sección</h1><p>Intenta volver al inicio. Tus productos guardados permanecen en este dispositivo.</p><button class="primary-button" data-route="home">Ir al inicio <span>→</span></button></div>`;
    }
  }

  function updateHeader() {
    const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelector("#cart-count").textContent = cartCount;
    document.querySelector("#mobile-cart-count").textContent = cartCount;
    document.querySelector("#favorite-count").textContent = state.favorites.size;
    document.querySelectorAll("[data-route]").forEach((element) => {
      const route = element.dataset.route;
      const isActive = (route === "home" && state.route === "home")
        || (route === "categories" && ["categories", "category"].includes(state.route))
        || (route === "offers" && state.route === "offers")
        || (route === "favorites" && state.route === "favorites")
        || (route === "cart" && ["cart", "checkout"].includes(state.route));
      if (element.classList.contains("nav-link") || element.closest(".mobile-bottom-nav")) {
        element.classList.toggle("active", isActive);
      }
    });
  }

  function renderSuggestions() {
    const panel = document.querySelector("#search-suggestions");
    if (!state.query || !["global-search", "mobile-search-input"].includes(document.activeElement?.id)) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const normalized = state.query.toLocaleLowerCase("es");
    const matches = products.filter((product) => `${product.name} ${product.category} ${product.keywords}`.toLocaleLowerCase("es").includes(normalized)).slice(0, 5);
    panel.innerHTML = matches.length
      ? `<span class="suggestion-label">SUGERENCIAS</span>${matches.map((product) => `<button type="button" class="suggestion-item" data-open-product="${escapeHTML(product.id)}">${imageMarkup(product.image, "")}<span><b>${escapeHTML(product.name)}</b><small>${escapeHTML(product.category)} · ${formatPrice(product.price)}</small></span><span>↗</span></button>`).join("")}<button class="suggestion-all" type="button" data-action="submit-search">Ver todos los resultados para “${escapeHTML(state.query)}”</button>`
      : `<div class="suggestion-empty">No encontramos coincidencias.<button type="button" data-action="submit-search">Ver todos los resultados</button></div>`;
    panel.hidden = false;
  }

  function updateListingResults() {
    const grid = document.querySelector("#current-listing-grid");
    if (!grid) {
      render();
      return;
    }
    const items = getFilteredProducts();
    grid.innerHTML = items.map((product) => productCard(product)).join("");
    const count = document.querySelector("#current-result-count");
    if (count) count.textContent = `${items.length} producto${items.length === 1 ? "" : "s"} encontrados`;
    const empty = document.querySelector("#current-empty-state");
    if (empty) empty.hidden = items.length > 0;
    const gridElement = document.querySelector("#current-listing-grid");
    if (gridElement) gridElement.hidden = items.length === 0;
    updateHeader();
  }

  function renderListingToolbar(count, heading = "Productos") {
    return `
      <div class="results-toolbar">
        <div><h3>${escapeHTML(heading)}</h3><p id="current-result-count">${count} producto${count === 1 ? "" : "s"} encontrados</p></div>
        <label class="sort-control">Ordenar por
          <select id="sort-select">
            <option value="relevance" ${state.sort === "relevance" ? "selected" : ""}>Relevancia</option>
            <option value="price-low" ${state.sort === "price-low" ? "selected" : ""}>Precio: menor a mayor</option>
            <option value="price-high" ${state.sort === "price-high" ? "selected" : ""}>Precio: mayor a menor</option>
            <option value="rating" ${state.sort === "rating" ? "selected" : ""}>Mejor calificación</option>
            <option value="sold" ${state.sort === "sold" ? "selected" : ""}>Más vendidos</option>
            <option value="recent" ${state.sort === "recent" ? "selected" : ""}>Más recientes</option>
          </select>
        </label>
      </div>
    `;
  }

  function renderProductDetail() {
    const product = byId(state.productId);
    if (!product) return renderListingPage({
      eyebrow: "PRODUCTO NO DISPONIBLE",
      title: "No encontramos este producto",
      description: "Puede que la publicación ya no esté disponible.",
      heading: "Productos para ti",
      products: products.slice(0, 8),
    });
    const variants = Object.entries(product.variants || {})
      .filter(([, values]) => Array.isArray(values) && values.length)
      .map(([name, values]) => {
        const label = name === "size" ? "Talla o tamaño" : name === "color" ? "Color" : "Presentación";
        return `<label class="variant-control">${label}<select data-variant="${escapeHTML(name)}">${values.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("")}</select></label>`;
      }).join("");
    const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);
    const recommendations = related.length ? related : products.filter((item) => item.id !== product.id && item.bestSeller).slice(0, 4);
    const reviews = product.reviews || [];
    const average = product.rating ? product.rating.toFixed(1) : "—";
    return `
      <div class="page-container page-content product-page">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><button type="button" data-category="${escapeHTML(product.category)}">${escapeHTML(product.category)}</button><span>›</span><strong>${escapeHTML(product.name)}</strong></div>
        <section class="product-detail">
          <div class="product-gallery">
            <div class="product-main-photo">${imageMarkup(product.gallery[0], product.name, "detail-main-image")}<button type="button" class="favorite-toggle detail-favorite ${state.favorites.has(product.id) ? "is-favorite" : ""}" data-favorite="${escapeHTML(product.id)}" aria-label="Agregar a favoritos">${state.favorites.has(product.id) ? "♥" : "♡"}</button>${product.discount ? `<span class="discount-badge">-${product.discount}%</span>` : ""}</div>
            <div class="gallery-thumbnails">${product.gallery.map((image, index) => `<button type="button" class="gallery-thumb ${index === 0 ? "selected" : ""}" data-gallery-image="${escapeHTML(image)}">${imageMarkup(image, `${product.name} vista ${index + 1}`)}</button>`).join("")}</div>
          </div>
          <div class="product-detail-info">
            <div class="detail-category-row"><span class="detail-category">${escapeHTML(product.category)}</span><span class="detail-condition">${escapeHTML(product.condition || "Nuevo")}</span><span class="detail-sku">REF. ${escapeHTML(product.id.toUpperCase())}</span></div>
            <h1>${escapeHTML(product.name)}</h1>
            <a class="detail-rating-link" href="#product-reviews">${ratingStars(product.rating)}<span>${product.reviewCount} reseñas</span></a>
            <div class="detail-price-row"><strong>${formatPrice(product.price)}</strong>${product.previousPrice ? `<del>${formatPrice(product.previousPrice)}</del><span class="discount-text">Ahorras ${formatPrice(product.previousPrice - product.price)} (${product.discount}%)</span>` : ""}</div>
            ${stockLabel(product)}
            <p class="detail-description">${escapeHTML(product.description)}</p>
            ${variants ? `<div class="variant-list" id="product-detail-variants">${variants}</div>` : ""}
            <div class="purchase-controls">
              <div class="quantity-control" aria-label="Cantidad"><button type="button" data-quantity-step="-1" aria-label="Disminuir cantidad">−</button><input id="product-quantity" type="number" min="1" max="${product.stock}" value="1" aria-label="Cantidad" /><button type="button" data-quantity-step="1" aria-label="Aumentar cantidad">＋</button></div>
              <span class="stock-caption">${product.stock > 0 ? `${product.stock} disponibles` : "Producto agotado"}</span>
            </div>
            <div class="detail-actions"><button type="button" class="primary-button add-cart-button" data-add-to-cart="${escapeHTML(product.id)}" ${product.stock <= 0 ? "disabled" : ""}>${product.stock <= 0 ? "Producto agotado" : "Agregar al carrito"} <span>▱</span></button><button type="button" class="detail-favorite-button ${state.favorites.has(product.id) ? "is-favorite" : ""}" data-favorite="${escapeHTML(product.id)}">${state.favorites.has(product.id) ? "♥ Guardado" : "♡ Favorito"}</button></div>
            <div class="detail-contact-actions"><button type="button" data-action="message">✉ Enviar mensaje al vendedor</button><button type="button" data-action="interest">Me interesa</button></div>
            <div class="shipping-note"><span>✓</span><p><b>Compra de demostración</b><br />Sin pagos reales. El envío se calcula en el checkout.</p></div>
          </div>
        </section>
        <section class="product-information-grid">
          <div class="info-panel"><span class="section-eyebrow">DETALLES DEL PRODUCTO</span><h2>Descripción y características</h2><p>${escapeHTML(product.description)}</p><ul>${product.features.map((feature) => `<li>${escapeHTML(feature)}</li>`).join("")}</ul></div>
          <div class="info-panel stock-panel"><span class="section-eyebrow">DISPONIBILIDAD</span><h2>${product.stock > 0 ? "Listo para ti" : "Agotado por ahora"}</h2><p>${product.stock > 0 ? `${product.stock} unidades disponibles. Agrega al carrito para continuar con tu compra demo.` : "Este producto se muestra como referencia, pero no se puede agregar al carrito por el momento."}</p>${ratingStars(product.rating)}</div>
        </section>
        <section class="reviews-section" id="product-reviews">
          <div class="section-heading"><div><span class="section-eyebrow">OPINIONES DE COMPRADORES</span><h2>Reseñas del producto</h2></div><span class="reviews-total">${product.reviewCount} reseñas</span></div>
          <div class="reviews-overview"><div class="rating-score"><strong>${average}</strong>${ratingStars(product.rating)}<small>Promedio de calificaciones</small></div><div class="rating-distribution">${product.ratingDistribution.map((row) => `<div class="distribution-row"><span>${row.stars} estrellas</span><div><i style="width:${row.percent}%"></i></div><b>${row.percent}%</b></div>`).join("")}</div></div>
          <div class="review-list">${reviews.map((review) => `<article class="review-card"><div class="review-top"><span class="review-avatar">${escapeHTML(initials(review.name))}</span><div><strong>${escapeHTML(review.name)}</strong><small>${escapeHTML(review.date)}</small></div><span class="review-stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span></div><p>${escapeHTML(review.comment)}</p></article>`).join("")}</div>
        </section>
        ${renderShelf("También te puede interesar", "PRODUCTOS RELACIONADOS", recommendations, "categories")}
      </div>
    `;
  }

  function initials(name = "") {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ML";
  }

  function renderCart() {
    const items = state.cart.map((item) => ({ item, product: byId(item.id) })).filter((entry) => entry.product);
    const totals = cartTotals(items);
    if (!items.length) {
      return `<div class="page-container page-content"><div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>Carrito</strong></div><section class="empty-cart"><div class="empty-cart-illustration">▱</div><span class="section-eyebrow">TU COMPRA EMPIEZA AQUÍ</span><h1>Tu carrito está vacío</h1><p>Explora el catálogo y agrega los productos que te gusten.</p><button class="primary-button" type="button" data-route="home">Volver al marketplace <span>→</span></button></section>${renderShelf("Lo más vendido", "PREFERIDOS DE LA COMUNIDAD", [...products].sort((a, b) => b.sold - a.sold).slice(0, 4))}</div>`;
    }
    return `
      <div class="page-container page-content">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>Carrito de compras</strong></div>
        <div class="cart-heading"><div><span class="section-eyebrow">TU SELECCIÓN</span><h1>Carrito de compras</h1><p>${items.reduce((sum, entry) => sum + entry.item.quantity, 0)} artículo(s) en tu carrito</p></div><button class="text-link" type="button" data-route="home">← Seguir comprando</button></div>
        <div class="cart-layout">
          <section class="cart-items">${items.map(({ item, product }) => renderCartItem(item, product)).join("")}</section>
          <aside class="order-summary"><span class="section-eyebrow">RESUMEN DE COMPRA</span><h2>Tu pedido</h2><div class="summary-line"><span>Subtotal</span><b>${formatPrice(totals.subtotal)}</b></div><div class="summary-line discount-line"><span>Descuentos</span><b>− ${formatPrice(totals.discount)}</b></div><div class="summary-line"><span>Envío estimado</span><b>${totals.shipping ? formatPrice(totals.shipping) : "Gratis"}</b></div><div class="summary-divider"></div><div class="summary-line total-line"><span>Total</span><b>${formatPrice(totals.total)}</b></div><small class="summary-caption">Checkout de demostración. No se realizará ningún cobro.</small><button type="button" class="primary-button checkout-button" data-route="checkout">Continuar al checkout <span>→</span></button><button type="button" class="text-button remove-all-button" data-action="empty-cart">Vaciar carrito</button><div class="secure-note"><span>✓</span> Experiencia demo segura</div></aside>
        </div>
      </div>
    `;
  }

  function renderCartItem(item, product) {
    const variantText = Object.values(item.variants || {}).filter(Boolean).join(" · ");
    const lineDiscount = product.previousPrice ? (product.previousPrice - product.price) * item.quantity : 0;
    return `<article class="cart-item"><button class="cart-item-image" type="button" data-open-product="${escapeHTML(product.id)}">${imageMarkup(product.image, product.name)}</button><div class="cart-item-info"><span class="product-category">${escapeHTML(product.category)}</span><button type="button" class="cart-item-title" data-open-product="${escapeHTML(product.id)}">${escapeHTML(product.name)}</button>${variantText ? `<small class="cart-variant">${escapeHTML(variantText)}</small>` : ""}${product.previousPrice ? `<small class="cart-saving">Ahorras ${formatPrice(lineDiscount)}</small>` : ""}<button type="button" class="remove-item" data-remove-cart="${escapeHTML(item.key)}">Eliminar</button></div><div class="cart-item-side"><strong>${formatPrice(product.price * item.quantity)}</strong><div class="quantity-control quantity-control--small"><button type="button" data-cart-step="-1" data-cart-key="${escapeHTML(item.key)}" aria-label="Disminuir cantidad">−</button><span>${item.quantity}</span><button type="button" data-cart-step="1" data-cart-key="${escapeHTML(item.key)}" aria-label="Aumentar cantidad">＋</button></div><small>${formatPrice(product.price)} c/u</small></div></article>`;
  }

  function cartTotals(items = state.cart.map((item) => ({ item, product: byId(item.id) })).filter((entry) => entry.product)) {
    const subtotal = items.reduce((sum, { item, product }) => sum + Number(product.previousPrice || product.price) * item.quantity, 0);
    const savings = items.reduce((sum, { item, product }) => sum + Math.max(0, Number(product.previousPrice || product.price) - product.price) * item.quantity, 0);
    const afterDiscount = subtotal - savings;
    const shipping = afterDiscount >= 200000 || afterDiscount === 0 ? 0 : 7900;
    return { subtotal, discount: savings, shipping, total: afterDiscount + shipping };
  }

  function renderCheckout() {
    const items = state.cart.map((item) => ({ item, product: byId(item.id) })).filter((entry) => entry.product);
    if (!items.length) {
      state.route = "cart";
      return renderCart();
    }
    const totals = cartTotals(items);
    return `
      <div class="page-container page-content checkout-page">
        <div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><button type="button" data-route="cart">Carrito</button><span>›</span><strong>Checkout demo</strong></div>
        <div class="checkout-heading"><span class="section-eyebrow">ÚLTIMO PASO</span><h1>Finaliza tu pedido</h1><p>Esta experiencia es de demostración y no realiza cobros reales.</p></div>
        <div class="checkout-layout">
          <form id="checkout-form" class="checkout-form">
            <section class="checkout-section"><div class="checkout-section-heading"><span>01</span><div><h2>Datos de contacto</h2><p>¿A dónde enviamos la confirmación demo?</p></div></div><div class="form-grid"><label>Nombre completo<input name="name" required autocomplete="name" placeholder="Nombre y apellido" /></label><label>Correo electrónico<input name="email" type="email" required autocomplete="email" placeholder="nombre@correo.com" /></label><label class="form-field-wide">Dirección<input name="address" required autocomplete="street-address" placeholder="Calle, carrera y número" /></label><label>Ciudad<input name="city" required value="Bogotá" /></label><label>Teléfono<input name="phone" type="tel" required placeholder="300 000 0000" /></label></div></section>
            <section class="checkout-section"><div class="checkout-section-heading"><span>02</span><div><h2>Método de pago demo</h2><p>Selecciona una opción ficticia; no pediremos datos bancarios.</p></div></div><label class="payment-choice"><input type="radio" name="payment" value="Contraentrega demo" checked /><span class="payment-icon">▣</span><span><b>Pago contraentrega demo</b><small>Simula el pago al recibir el pedido.</small></span><i></i></label><label class="payment-choice"><input type="radio" name="payment" value="Pago electrónico demo" /><span class="payment-icon">⌁</span><span><b>Pago electrónico demo</b><small>Solo muestra la confirmación; no procesa una transacción.</small></span><i></i></label></section>
            <p class="checkout-error" id="checkout-error" role="alert"></p><button class="primary-button place-order-button" type="submit">Confirmar pedido demo <span>↗</span></button><button class="text-button back-to-cart" type="button" data-route="cart">← Volver al carrito</button>
          </form>
          <aside class="order-summary checkout-summary"><span class="section-eyebrow">TU PEDIDO</span><h2>${items.length} producto${items.length === 1 ? "" : "s"}</h2><div class="checkout-items-preview">${items.map(({ item, product }) => `<div class="checkout-preview-row">${imageMarkup(product.image, product.name)}<span><b>${escapeHTML(product.name)}</b><small>Cant. ${item.quantity}</small></span><strong>${formatPrice(product.price * item.quantity)}</strong></div>`).join("")}</div><div class="summary-divider"></div><div class="summary-line"><span>Subtotal</span><b>${formatPrice(totals.subtotal)}</b></div><div class="summary-line discount-line"><span>Descuentos</span><b>− ${formatPrice(totals.discount)}</b></div><div class="summary-line"><span>Envío</span><b>${totals.shipping ? formatPrice(totals.shipping) : "Gratis"}</b></div><div class="summary-divider"></div><div class="summary-line total-line"><span>Total demo</span><b>${formatPrice(totals.total)}</b></div></aside>
        </div>
      </div>
    `;
  }

  function renderSuccess() {
    if (!state.lastOrder) {
      state.route = "home";
      window.history.replaceState({ route: "home" }, "", "#inicio");
      return renderHome();
    }
    return `<div class="page-container page-content"><section class="order-success"><span class="success-check">✓</span><span class="section-eyebrow">PEDIDO DE DEMOSTRACIÓN</span><h1>¡Gracias, ${escapeHTML(state.lastOrder.name)}!</h1><p>Tu pedido de muestra quedó registrado. No se realizó ningún pago.</p><div class="success-reference"><span>Número de confirmación</span><strong>${escapeHTML(state.lastOrder.reference)}</strong></div><div class="success-summary"><span>Total simulado</span><b>${formatPrice(state.lastOrder.total)}</b></div><button class="primary-button" type="button" data-route="home">Volver al marketplace <span>→</span></button></section></div>`;
  }

  function render() {
    try {
      if (state.route === "checkout" && !state.cart.length) {
        state.route = "cart";
        window.history.replaceState({ route: "cart" }, "", "#carrito");
      }
      root.innerHTML = renderRoute();
      updateHeader();
      renderSuggestions();
    } catch (error) {
      console.error("No se pudo mostrar esta pantalla:", error);
      root.innerHTML = `<div class="page-container error-state"><span>!</span><h1>No pudimos cargar esta sección</h1><p>Intenta volver al inicio. Tus productos guardados permanecen en este dispositivo.</p><button class="primary-button" data-route="home">Ir al inicio <span>→</span></button></div>`;
    }
  }

  function renderRoute() {
    const filtered = getFilteredProducts();
    if (state.route === "home") return renderHome();
    if (state.route === "categories") return renderCategoryDirectory();
    if (state.route === "category") {
      return renderListingPage({
        eyebrow: "COMPRA POR CATEGORÍA",
        title: state.category,
        description: `Explora ${state.category.toLocaleLowerCase("es")} disponibles en Mercado Local.`,
        heading: `Productos de ${state.category}`,
        products: filtered,
      });
    }
    if (state.route === "search") {
      return renderListingPage({
        eyebrow: "RESULTADOS DE BÚSQUEDA",
        title: state.query ? `Resultados para “${state.query}”` : "Buscar productos",
        description: "Explora productos de todas las categorías y ajusta los filtros para encontrar lo que necesitas.",
        heading: "Productos encontrados",
        products: filtered,
      });
    }
    if (state.route === "offers") {
      return renderListingPage({
        eyebrow: "PRECIO ESPECIAL",
        title: "Ofertas especiales",
        description: "Aprovecha descuentos en productos seleccionados. El porcentaje aparece en cada artículo.",
        heading: "Productos con descuento",
        products: filtered,
      });
    }
    if (state.route === "favorites") {
      return renderListingPage({
        eyebrow: "TU LISTA PERSONAL",
        title: "Productos favoritos",
        description: "Aquí encuentras los artículos que guardaste para verlos después.",
        heading: "Tus productos guardados",
        products: filtered,
        showFilters: false,
        emptyTitle: "Aún no tienes favoritos",
      });
    }
    if (state.route === "cart") return renderCart();
    if (state.route === "checkout") return renderCheckout();
    if (state.route === "success") return renderSuccess();
    if (state.route === "product") return renderProductDetail();
    return renderHome();
  }

  function renderListingPage({ eyebrow, title, description, heading, products: items, showFilters = true, emptyTitle = "Todavía no hay publicaciones" }) {
    const listingFilters = showFilters ? renderFilters() : "";
    const productsMarkup = items.length ? `<div class="product-grid listing-grid" id="current-listing-grid">${items.map((product) => productCard(product)).join("")}</div>` : `<div class="product-grid listing-grid" id="current-listing-grid" hidden></div>`;
    const empty = items.length
      ? emptyResults(items.length)
      : `<div class="empty-state" id="current-empty-state"><span class="empty-icon">⌕</span><h3>${escapeHTML(emptyTitle)}</h3><p>${state.query ? "Intenta con otra palabra o ajusta los filtros." : "Explora el catálogo para descubrir productos."}</p><button class="secondary-button" type="button" data-action="clear-filters">Ver todos los productos</button></div>`;
    return `<div class="page-container page-content"><div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>${escapeHTML(title)}</strong></div><section class="listing-page-heading"><div><span class="section-eyebrow">${escapeHTML(eyebrow)}</span><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></div><span class="catalog-live"><i></i> Catálogo actualizado</span></section><div class="listing-layout ${showFilters ? "" : "listing-layout--wide"}">${listingFilters}<div class="listing-main">${renderListingToolbar(items.length, heading)}${productsMarkup}${empty}</div></div></div>`;
  }

  function renderListingToolbar(count, heading = "Productos") {
    return `<div class="results-toolbar"><div><h3>${escapeHTML(heading)}</h3><p id="current-result-count">${count} producto${count === 1 ? "" : "s"} encontrados</p></div><label class="sort-control">Ordenar por<select id="sort-select"><option value="relevance" ${state.sort === "relevance" ? "selected" : ""}>Relevancia</option><option value="price-low" ${state.sort === "price-low" ? "selected" : ""}>Precio: menor a mayor</option><option value="price-high" ${state.sort === "price-high" ? "selected" : ""}>Precio: mayor a menor</option><option value="rating" ${state.sort === "rating" ? "selected" : ""}>Mejor calificación</option><option value="sold" ${state.sort === "sold" ? "selected" : ""}>Más vendidos</option><option value="recent" ${state.sort === "recent" ? "selected" : ""}>Más recientes</option></select></label></div>`;
  }

  function renderFilters() {
    const selectedCategory = state.category === "Todos" ? "" : state.category;
    return `<aside class="filters-panel"><div class="filter-heading"><div><span class="section-eyebrow">AFINA TU BÚSQUEDA</span><h3>Filtros</h3></div><button class="clear-filters" type="button" data-action="clear-filters">Limpiar</button></div><label class="filter-field">Categoría<select id="filter-category"><option value="">Todas las categorías</option>${categories.map((category) => `<option value="${escapeHTML(category)}" ${category === selectedCategory ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}</select></label><fieldset class="filter-field price-filter"><legend>Rango de precio</legend><div class="price-inputs"><label><span>Mínimo</span><input id="min-price-input" type="number" min="0" placeholder="$ 0" value="${escapeHTML(state.filters.minPrice)}" /></label><i>—</i><label><span>Máximo</span><input id="max-price-input" type="number" min="0" placeholder="Sin límite" value="${escapeHTML(state.filters.maxPrice)}" /></label></div></fieldset><label class="check-filter"><input id="discount-filter" type="checkbox" ${state.filters.discountOnly ? "checked" : ""} /><span class="custom-check"></span><span>Solo productos con descuento</span></label><label class="filter-field">Calificación mínima<select id="rating-filter"><option value="0" ${Number(state.filters.minimumRating) === 0 ? "selected" : ""}>Cualquier calificación</option><option value="4" ${Number(state.filters.minimumRating) === 4 ? "selected" : ""}>★ 4.0 y más</option><option value="4.5" ${Number(state.filters.minimumRating) === 4.5 ? "selected" : ""}>★ 4.5 y más</option><option value="4.8" ${Number(state.filters.minimumRating) === 4.8 ? "selected" : ""}>★ 4.8 y más</option></select></label><label class="filter-field">Disponibilidad<select id="availability-filter"><option value="all" ${state.filters.availability === "all" ? "selected" : ""}>Todos los productos</option><option value="available" ${state.filters.availability === "available" ? "selected" : ""}>Disponibles</option><option value="out-of-stock" ${state.filters.availability === "out-of-stock" ? "selected" : ""}>Agotados</option></select></label><label class="filter-field">Condición<select id="filter-condition"><option value="all" ${state.filters.condition === "all" ? "selected" : ""}>Cualquier condición</option>${["Nuevo", "Como nuevo", "Usado"].map((condition) => `<option value="${escapeHTML(condition)}" ${state.filters.condition === condition ? "selected" : ""}>${escapeHTML(condition)}</option>`).join("")}</select></label><div class="filter-safe"><span>✓</span><p><b>Compra con confianza</b><br />Revisa cada descripción y el stock disponible antes de agregar al carrito.</p></div></aside>`;
  }

  function renderCategoryDirectory() {
    return `<div class="page-container page-content"><div class="page-breadcrumb"><button type="button" data-route="home">Inicio</button><span>›</span><strong>Categorías</strong></div><section class="listing-page-heading"><div><span class="section-eyebrow">ENCUENTRA LO QUE BUSCAS</span><h1>Explora por categoría</h1><p>Elige un departamento y encuentra productos que se ajustan a tus ideas.</p></div></section><div class="category-directory">${categories.map((category) => `<div class="directory-category">${categoryButton(category)}<p>${products.filter((product) => product.category === category).length} productos para descubrir</p></div>`).join("")}</div><section class="content-section"><div class="section-heading"><div><span class="section-eyebrow">TENDENCIAS</span><h2>Los favoritos de la comunidad</h2></div></div>${productGrid([...products].sort((a, b) => b.sold - a.sold).slice(0, 4), "product-grid--rail")}</section></div>`;
  }

  function renderSuggestions() {
    const panel = document.querySelector("#search-suggestions");
    if (!state.query || !["global-search", "mobile-search-input"].includes(document.activeElement?.id)) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const normalized = state.query.toLocaleLowerCase("es");
    const matches = products.filter((product) => `${product.name} ${product.category} ${product.keywords}`.toLocaleLowerCase("es").includes(normalized)).slice(0, 5);
    panel.innerHTML = matches.length
      ? `<span class="suggestion-label">SUGERENCIAS</span>${matches.map((product) => `<button type="button" class="suggestion-item" data-open-product="${escapeHTML(product.id)}">${imageMarkup(product.image, "")}<span><b>${escapeHTML(product.name)}</b><small>${escapeHTML(product.category)} · ${formatPrice(product.price)}</small></span><span>↗</span></button>`).join("")}<button class="suggestion-all" type="button" data-action="submit-search">Ver todos los resultados para “${escapeHTML(state.query)}”</button>`
      : `<div class="suggestion-empty">No encontramos coincidencias.<button type="button" data-action="submit-search">Ver todos los resultados</button></div>`;
    panel.hidden = false;
  }

  function updateListingResults() {
    const grid = document.querySelector("#current-listing-grid");
    if (!grid) {
      render();
      return;
    }
    const items = getFilteredProducts();
    grid.innerHTML = items.map((product) => productCard(product)).join("");
    grid.hidden = items.length === 0;
    const count = document.querySelector("#current-result-count");
    if (count) count.textContent = `${items.length} producto${items.length === 1 ? "" : "s"} encontrados`;
    const empty = document.querySelector("#current-empty-state");
    if (empty) empty.hidden = items.length > 0;
    updateHeader();
  }

  function setQuery(value, { submit = false } = {}) {
    if (value && state.route !== "search") {
      state.category = "Todos";
      persistPreferences();
    }
    state.query = String(value || "").trim();
    const desktop = document.querySelector("#global-search");
    const mobile = document.querySelector("#mobile-search-input");
    if (desktop !== document.activeElement) desktop.value = state.query;
    if (mobile !== document.activeElement) mobile.value = state.query;
    document.querySelectorAll('[data-action="clear-search"]').forEach((button) => { button.hidden = !state.query; });
    if (state.query) {
      state.route = "search";
      window.history.replaceState({ route: "search" }, "", "#buscar");
    } else if (state.route === "search") {
      state.route = "home";
      window.history.replaceState({ route: "home" }, "", "#inicio");
    }
    if (submit) {
      state.route = "search";
      window.history.pushState({ route: "search" }, "", "#buscar");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    render();
  }

  function clearSearch() {
    state.query = "";
    document.querySelector("#global-search").value = "";
    document.querySelector("#mobile-search-input").value = "";
    document.querySelectorAll('[data-action="clear-search"]').forEach((button) => { button.hidden = true; });
    if (state.route === "search") {
      state.route = "home";
      window.history.replaceState({ route: "home" }, "", "#inicio");
    }
    render();
    const focusTarget = window.matchMedia("(max-width: 680px)").matches
      ? document.querySelector("#mobile-search-input")
      : document.querySelector("#global-search");
    focusTarget.focus();
  }

  function readDetailVariants() {
    return Object.fromEntries([...document.querySelectorAll("#product-detail-variants select")].map((select) => [select.dataset.variant, select.value]));
  }

  function addToCart(productId, quantity = 1, variants = {}) {
    const product = byId(productId);
    if (!product) return showToast("Este producto ya no está disponible.");
    if (product.stock <= 0) return showToast("Este producto está agotado.");
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const sortedVariants = Object.fromEntries(Object.entries(variants).sort(([a], [b]) => a.localeCompare(b)));
    const variantKey = Object.values(sortedVariants).join("/");
    const key = `${product.id}|${variantKey}`;
    const existing = state.cart.find((item) => item.key === key);
    const currentQuantity = existing?.quantity || 0;
    if (currentQuantity + qty > product.stock) {
      return showToast(`Solo quedan ${product.stock} unidades disponibles.`);
    }
    if (existing) existing.quantity += qty;
    else state.cart.push({ key, id: product.id, quantity: qty, variants: sortedVariants });
    writeStorage(storageKeys.cart, state.cart);
    updateHeader();
    showToast(`${product.name} se agregó al carrito.`);
  }

  function updateCartQuantity(key, delta) {
    const item = state.cart.find((entry) => entry.key === key);
    if (!item) return;
    const product = byId(item.id);
    item.quantity = Math.min(product?.stock || 99, Math.max(1, item.quantity + delta));
    writeStorage(storageKeys.cart, state.cart);
    render();
  }

  function removeCartItem(key) {
    state.cart = state.cart.filter((item) => item.key !== key);
    writeStorage(storageKeys.cart, state.cart);
    render();
    showToast("Artículo eliminado del carrito.");
  }

  function toggleFavorite(productId) {
    if (state.favorites.has(productId)) {
      state.favorites.delete(productId);
      showToast("Producto eliminado de favoritos.");
    } else {
      state.favorites.add(productId);
      showToast("Producto guardado en favoritos.");
    }
    writeStorage(storageKeys.favorites, [...state.favorites]);
    render();
  }

  function toggleProductFavoriteFromCard(productId) {
    toggleFavorite(productId);
  }

  function openProduct(productId) {
    const product = byId(productId);
    if (!product) return;
    state.productId = productId;
    state.route = "product";
    state.recentlyViewed = [productId, ...state.recentlyViewed.filter((id) => id !== productId)].slice(0, 8);
    writeStorage(storageKeys.recentlyViewed, state.recentlyViewed);
    navigate("product", { productId });
  }

  function openSellDialog() {
    const dialog = document.querySelector("#sell-dialog");
    const select = dialog.querySelector('select[name="category"]');
    if (!select.options.length) {
      select.innerHTML = categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function createPublishedProduct(formData) {
    const title = String(formData.get("title") || "").trim();
    const price = Math.max(0, Number(formData.get("price")) || 0);
    const category = String(formData.get("category") || categories[0]);
    const condition = String(formData.get("condition") || "Nuevo");
    const previousPrice = Math.max(0, Number(formData.get("previousPrice")) || 0);
    const stock = Math.max(0, Math.floor(Number(formData.get("stock")) || 0));
    const description = String(formData.get("description") || "").trim() || "Artículo publicado en Mercado Local.";
    const related = products.find((product) => product.category === category);
    const id = `publicado-${Date.now()}`;
    const product = {
      id,
      name: title,
      price,
      previousPrice,
      discount: previousPrice > price ? Math.round((1 - price / previousPrice) * 100) : 0,
      category,
      condition,
      rating: 0,
      reviewCount: 0,
      stock,
      available: stock > 0,
      sold: 0,
      age: 0,
      description,
      keywords: `${title} ${category} ${description}`,
      image: related?.image || "assets/products/product-placeholder.svg",
      gallery: related?.gallery || ["assets/products/product-placeholder.svg"],
      features: ["Publicación de demostración", "Artículo en Mercado Local", "Contacta al vendedor para más información"],
      variants: {},
      reviews: [],
      ratingDistribution: [],
      featured: false,
      bestSeller: false,
      isNew: true,
    };
    products.unshift(product);
    return product;
  }

  function applyFiltersFromForm() {
    const min = document.querySelector("#min-price-input");
    const max = document.querySelector("#max-price-input");
    if (min) state.filters.minPrice = min.value;
    if (max) state.filters.maxPrice = max.value;
    const category = document.querySelector("#filter-category");
    if (category) {
      state.category = category.value || "Todos";
    }
    const discount = document.querySelector("#discount-filter");
    if (discount) state.filters.discountOnly = discount.checked;
    const rating = document.querySelector("#rating-filter");
    if (rating) state.filters.minimumRating = Number(rating.value);
    const availability = document.querySelector("#availability-filter");
    if (availability) state.filters.availability = availability.value;
    const condition = document.querySelector("#filter-condition");
    if (condition) state.filters.condition = condition.value;
    persistPreferences();
    updateListingResults();
  }

  function clearFilters() {
    state.category = "Todos";
    state.filters = { minPrice: "", maxPrice: "", discountOnly: false, minimumRating: 0, availability: "all", condition: "all" };
    state.sort = "relevance";
    state.query = "";
    document.querySelector("#global-search").value = "";
    document.querySelector("#mobile-search-input").value = "";
    document.querySelectorAll('[data-action="clear-search"]').forEach((button) => { button.hidden = true; });
    if (state.route === "search" || state.route === "category" || state.route === "offers") state.route = "home";
    persistPreferences();
    render();
  }

  function placeOrder(form) {
    if (!form.reportValidity()) return;
    const totals = cartTotals();
    const data = new FormData(form);
    state.lastOrder = {
      reference: `ML-${String(Date.now()).slice(-8)}`,
      name: String(data.get("name")).trim().split(/\s+/)[0],
      total: totals.total,
    };
    state.cart = [];
    writeStorage(storageKeys.cart, []);
    state.checkoutMessage = "";
    navigate("success");
    showToast("Pedido demo confirmado. No se procesó ningún pago.");
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function syncSearchInputs(source, value) {
    const ids = ["global-search", "mobile-search-input"];
    ids.filter((id) => id !== source.id).forEach((id) => { document.getElementById(id).value = value; });
  }

  function initializeEvents() {
    const desktopSearch = document.querySelector("#global-search");
    const mobileSearch = document.querySelector("#mobile-search-input");
    [desktopSearch, mobileSearch].forEach((input) => {
      input.addEventListener("input", () => {
        syncSearchInputs(input, input.value);
        setQuery(input.value);
      });
      input.addEventListener("focus", renderSuggestions);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          document.querySelector("#search-suggestions").hidden = true;
          input.blur();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          state.query = input.value.trim();
          state.route = "search";
          navigate("search", { scroll: true });
        }
      });
    });

    document.querySelector("#header-search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      state.query = desktopSearch.value.trim();
      navigate("search");
    });
    document.querySelector("#mobile-search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      state.query = mobileSearch.value.trim();
      navigate("search");
    });

    document.querySelector("#open-sell").addEventListener("click", openSellDialog);
    document.querySelector("#sell-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const product = createPublishedProduct(new FormData(event.currentTarget));
      event.currentTarget.reset();
      const dialog = document.querySelector("#sell-dialog");
      if (dialog.open) dialog.close();
      state.category = "Todos";
      navigate("product", { productId: product.id });
      showToast("Tu publicación ya está en el marketplace.");
    });

    document.addEventListener("click", (event) => {
      const routeButton = event.target.closest("[data-route]");
      if (routeButton) {
        event.preventDefault();
        const route = routeButton.dataset.route;
        if (route !== "search") {
          state.query = "";
          desktopSearch.value = "";
          mobileSearch.value = "";
          document.querySelectorAll('[data-action="clear-search"]').forEach((button) => { button.hidden = true; });
        }
        if (["home", "offers", "categories", "favorites"].includes(route)) state.category = "Todos";
        if (route === "offers") state.filters.discountOnly = false;
        if (route === "home" || route === "offers") persistPreferences();
        navigate(route);
        return;
      }

      const categoryButton = event.target.closest("[data-category]");
      if (categoryButton) {
        event.preventDefault();
        state.category = categoryButton.dataset.category;
        persistPreferences();
        navigate("category", { category: categoryButton.dataset.category });
        return;
      }

      const openButton = event.target.closest("[data-open-product]");
      if (openButton) {
        event.preventDefault();
        document.querySelector("#search-suggestions").hidden = true;
        openProduct(openButton.dataset.openProduct);
        return;
      }

      const favoriteButton = event.target.closest("[data-favorite]");
      if (favoriteButton) {
        event.preventDefault();
        toggleProductFavoriteFromCard(favoriteButton.dataset.favorite);
        return;
      }

      const quickAdd = event.target.closest("[data-quick-add]");
      if (quickAdd) {
        addToCart(quickAdd.dataset.quickAdd);
        return;
      }

      const addDetail = event.target.closest("[data-add-to-cart]");
      if (addDetail) {
        const quantity = Math.max(1, Number(document.querySelector("#product-quantity")?.value) || 1);
        addToCart(addDetail.dataset.addToCart, quantity, readDetailVariants());
        return;
      }

      const cartStep = event.target.closest("[data-cart-step]");
      if (cartStep) {
        updateCartQuantity(cartStep.dataset.cartKey, Number(cartStep.dataset.cartStep));
        return;
      }

      const removeCart = event.target.closest("[data-remove-cart]");
      if (removeCart) {
        removeCartItem(removeCart.dataset.removeCart);
        return;
      }

      const quantityStep = event.target.closest("[data-quantity-step]");
      if (quantityStep) {
        const input = document.querySelector("#product-quantity");
        if (!input) return;
        const product = byId(state.productId);
        input.value = Math.max(1, Math.min(product.stock || 1, (Number(input.value) || 1) + Number(quantityStep.dataset.quantityStep)));
        return;
      }

      const galleryButton = event.target.closest("[data-gallery-image]");
      if (galleryButton) {
        const main = document.querySelector(".detail-main-image");
        if (main) main.src = galleryButton.dataset.galleryImage;
        document.querySelectorAll(".gallery-thumb").forEach((thumb) => thumb.classList.toggle("selected", thumb === galleryButton));
        return;
      }

      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.action;
      if (action === "clear-search") clearSearch();
      if (action === "submit-search") {
        state.query = desktopSearch.value.trim() || mobileSearch.value.trim();
        navigate("search");
      }
      if (action === "clear-filters") clearFilters();
      if (action === "profile") showToast("Tu perfil de demostración está listo.");
      if (action === "location") showToast("La ubicación demo actual es Bogotá, Colombia.");
      if (action === "notifications") showToast("No tienes notificaciones nuevas.");
      if (action === "empty-cart") {
        state.cart = [];
        writeStorage(storageKeys.cart, []);
        render();
        showToast("El carrito quedó vacío.");
      }
      if (action === "close-sell") {
        const dialog = document.querySelector("#sell-dialog");
        if (dialog.open) dialog.close();
      }
      if (action === "interest") showToast("Producto marcado como de tu interés.");
      if (action === "message") showToast("La mensajería es una función de demostración.");
    });

    document.addEventListener("input", (event) => {
      if (event.target.id === "min-price-input" || event.target.id === "max-price-input") {
        const min = document.querySelector("#min-price-input");
        const max = document.querySelector("#max-price-input");
        if (min && max && min.value && max.value && Number(min.value) > Number(max.value)) {
          max.setCustomValidity("El precio máximo debe ser mayor que el mínimo.");
        } else if (max) {
          max.setCustomValidity("");
        }
        applyFiltersFromForm();
      }
    });

    document.addEventListener("change", (event) => {
      if (["filter-category", "discount-filter", "rating-filter", "availability-filter", "filter-condition"].includes(event.target.id)) {
        applyFiltersFromForm();
        if (event.target.id === "filter-category" && state.route === "category") {
          if (state.category === "Todos") navigate("search", { scroll: false });
          else navigate("category", { category: state.category, scroll: false });
        }
      }
      if (event.target.id === "sort-select") {
        state.sort = event.target.value;
        persistPreferences();
        updateListingResults();
      }
    });

    document.addEventListener("submit", (event) => {
      if (event.target.id === "hero-search-form") {
        event.preventDefault();
        const query = document.querySelector("#hero-search-input").value.trim();
        setQuery(query, { submit: true });
      }
      if (event.target.id === "checkout-form") {
        event.preventDefault();
        placeOrder(event.target);
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-shell")) {
        document.querySelector("#search-suggestions").hidden = true;
      }
    });
  }

  function initialRoute() {
    const parsed = routeFromHash();
    state.route = parsed.route;
    if (parsed.category && categories.includes(parsed.category)) state.category = parsed.category;
    if (parsed.productId) state.productId = parsed.productId;
  }

  window.addEventListener("popstate", () => {
    const parsed = routeFromHash();
    state.route = parsed.route;
    state.productId = parsed.productId || null;
    if (parsed.category && categories.includes(parsed.category)) state.category = parsed.category;
    render();
  });

  window.MercadoLocal = {
    products,
    getFilteredProducts,
    addToCart,
    cartTotals,
    state,
  };

  initializeEvents();
  initialRoute();
  render();
})();