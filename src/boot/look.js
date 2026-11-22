// The boot script (TASK-107): a classic script in the <head> of the new tab and the popup. It runs
// before the body paints and before the app bundle, so the first frame is already in the user's
// mode, colours, spacing and font, or the defaults. MV3 pages allow no inline scripts, hence a file;
// a classic script may not import, hence this standalone copy of lib/theme.ts applyStoredLook
// (src/boot/templates.test.ts runs both on the same copies and requires the same <html>).
;(function () {
  var root = document.documentElement
  var DEFAULT = { hue: 214, intensity: 100, groupTint: 35, radius: 8, fontFamily: "inter", uiScale: 1, density: "comfortable", reduceMotion: false }
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
  try {
    var s = JSON.parse(read("flextab-appearance") || "null")
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
})()
