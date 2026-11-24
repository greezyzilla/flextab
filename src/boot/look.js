// The boot script: a classic script in the <head> of the new tab and the popup. It runs
// before the body paints and before the app bundle, so the first frame is already in the user's
// mode, colours, spacing and font, or the defaults. MV3 pages allow no inline scripts, hence a file;
// a classic script may not import, hence this standalone copy of lib/theme.ts applyStoredLook
// (src/boot/templates.test.ts runs both on the same copies and requires the same <html>).
;(function () {
  var root = document.documentElement
  var DEFAULT = { hue: 214, intensity: 100, groupTint: 35, radius: 8, fontFamily: "inter", uiScale: 1, density: "cozy", reduceMotion: false }
  var FONTS = {
    inter: '"Inter Variable", Inter, system-ui, -apple-system, sans-serif',
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Quicksand", system-ui, sans-serif',
    serif: 'Georgia, Cambria, "Times New Roman", ui-serif, serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
  }
  var DENSITIES = ["compact", "cozy", "comfortable"]
  function read(key) { try { return localStorage.getItem(key) } catch (e) { return null } }
  function num(v) { return typeof v === "number" && isFinite(v) }

  var mode = read("flextab-theme")
  root.classList.toggle("light", mode === "light")
  root.classList.toggle("dark", mode === "dark")

  var a = DEFAULT
  var s = null
  try {
    s = JSON.parse(read("flextab-appearance") || "null")
    if (s && num(s.hue) && num(s.intensity) && num(s.groupTint) && num(s.radius) && num(s.uiScale) &&
        typeof s.fontFamily === "string" && Object.prototype.hasOwnProperty.call(FONTS, s.fontFamily) &&
        DENSITIES.indexOf(s.density) >= 0 && typeof s.reduceMotion === "boolean") a = s
  } catch (e) { /* a broken copy: the defaults */ }

  root.style.setProperty("--hue", String(a.hue))
  root.style.setProperty("--intensity", String(a.intensity))
  root.style.setProperty("--group-tint", String(a.groupTint))
  root.style.setProperty("--radius", a.radius + "px")
  root.style.setProperty("--font-sans", FONTS[a.fontFamily] || FONTS.inter)
  root.style.fontSize = a.uiScale * 100 + "%"
  root.style.removeProperty("zoom")
  root.classList.remove("density-compact", "density-cozy", "density-comfortable")
  root.classList.add("density-" + a.density)
  root.classList.toggle("reduce-motion", a.reduceMotion)

  // The tab icon in the accent from the start: the copy lib/appIcon.ts keeps of the last
  // drawn icon, when it was drawn for this look. The <link> sits above this script in <head>.
  var accent = s && s.appIcon !== "blue" && a === s && (a.hue !== DEFAULT.hue || a.intensity !== DEFAULT.intensity)
  var link = document.querySelector('link[rel~="icon"]')
  if (link && !link.getAttribute("data-default-href")) link.setAttribute("data-default-href", link.getAttribute("href") || "")
  if (accent && link) {
    try {
      var icon = JSON.parse(read("flextab-favicon") || "null")
      if (icon && icon.key === a.hue + "," + a.intensity && typeof icon.url === "string" && icon.url.indexOf("data:image/png") === 0) link.setAttribute("href", icon.url)
    } catch (e) { /* drawn by the page */ }
  }
})()
