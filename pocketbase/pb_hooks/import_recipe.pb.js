/// <reference path="../pb_data/types.d.ts" />

// Recipe import for Foodshare. Browsers can't read other sites (CORS), so the server
// fetches the page and returns its schema.org Recipe data (JSON-LD). Only hosts in the
// allowlist below can be fetched, so the server can't be used to reach arbitrary URLs.
//
// POST /api/foodshare/import-recipe  { url }  -> { title, description, servings, totalTime, ingredients[], steps[], tags[], image }
// GET  /api/foodshare/import-image?url=...    -> the image bytes (for allowlisted image hosts)
//
// Note: JSVM handlers run isolated, so helpers live inside each handler.

routerAdd("POST", "/api/foodshare/import-recipe", (e) => {
  const PAGE_HOSTS = /^https:\/\/(www\.)?oda\.com\//

  const url = String(e.requestInfo().body.url || "").trim()
  if (!PAGE_HOSTS.test(url)) {
    throw new BadRequestError("Only recipes from oda.com can be imported.")
  }

  const res = $http.send({
    url: url,
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 (Foodshare recipe import)", "Accept": "text/html" },
    timeout: 15,
  })
  if (res.statusCode !== 200) {
    throw new BadRequestError("Could not fetch the recipe page (" + res.statusCode + ").")
  }
  const html = toString(res.body)

  // Find a schema.org Recipe in the page's JSON-LD blocks (may be nested in arrays or @graph).
  function findRecipe(node) {
    if (!node || typeof node !== "object") return null
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = findRecipe(n)
        if (r) return r
      }
      return null
    }
    const type = node["@type"]
    if (type === "Recipe" || (Array.isArray(type) && type.indexOf("Recipe") >= 0)) return node
    return findRecipe(node["@graph"])
  }

  let recipe = null
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []
  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "")
    try {
      recipe = findRecipe(JSON.parse(json))
    } catch (_) {
      recipe = null
    }
    if (recipe) break
  }
  if (!recipe) {
    throw new BadRequestError("No recipe found on that page.")
  }

  const decode = (s) =>
    String(s || "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim()

  function steps(node) {
    if (!node) return []
    if (typeof node === "string") return [decode(node)]
    if (Array.isArray(node)) return node.reduce((all, n) => all.concat(steps(n)), [])
    if (node.text) return [decode(node.text)]
    if (node.itemListElement) return steps(node.itemListElement)
    return []
  }

  let image = recipe.image
  if (Array.isArray(image)) image = image[0]
  if (image && typeof image === "object") image = image.url

  const yieldValue = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield

  // Tags from keywords and category; either may be a comma-separated string or a list.
  const list = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map(decode).filter((s) => s)
  const tags = []
  for (const tag of list(recipe.recipeCategory).concat(list(recipe.keywords))) {
    if (!tags.some((x) => x.toLowerCase() === tag.toLowerCase())) tags.push(tag)
  }

  return e.json(200, {
    title: decode(recipe.name),
    description: decode(recipe.description),
    servings: decode(yieldValue),
    totalTime: decode(recipe.totalTime || recipe.cookTime),
    ingredients: (recipe.recipeIngredient || []).map(decode).filter((s) => s),
    steps: steps(recipe.recipeInstructions).filter((s) => s),
    tags: tags,
    image: decode(image),
  })
}, $apis.requireAuth())

routerAdd("GET", "/api/foodshare/import-image", (e) => {
  const IMAGE_HOSTS = /^https:\/\/images\.oda\.com\//

  const url = String(e.request.url.query().get("url") || "")
  if (!IMAGE_HOSTS.test(url)) {
    throw new BadRequestError("Image host not allowed.")
  }
  const res = $http.send({ url: url, method: "GET", timeout: 20 })
  const type = String((res.headers["Content-Type"] || res.headers["content-type"] || [""])[0] || "")
  if (res.statusCode !== 200 || type.indexOf("image/") !== 0) {
    throw new BadRequestError("Could not fetch the image.")
  }
  return e.blob(200, type, res.body)
}, $apis.requireAuth())
