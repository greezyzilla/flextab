// The new tab's shell before its script runs (TASK-107): a classic script right after the empty
// #boot-skeleton in newtab.html, so it runs before the first paint. It puts in the markup the app
// last rendered for this workspace (ShellSkeleton storeShellSkeletonMarkup), when this window has
// the layout and screen height it was drawn for; otherwise the page shows the themed surface
// until React draws the skeleton. React removes this copy in its first commit.
// On a Settings route it puts in that Settings page's own copy instead (TASK-108,
// SettingsSkeleton storeSettingsSkeletonMarkup); a page with no copy shows the themed surface.
;(function () {
  var host = document.getElementById("boot-skeleton")
  if (!host) return
  try {
    var hash = location.hash || ""
    if (/^#\/settings(\/|$)/.test(hash)) {
      // The topic the route opens, as settings/types tabFromRoute resolves it.
      var TOPICS = ["spaces", "saving", "backup", "theme", "display", "layout", "profile", "security", "plan"]
      var LEGACY = { appearance: "theme", account: "profile", transactions: "plan", opening: "saving", sync: "backup" }
      var seg = hash.replace(/^#\/settings\/?/, "").split("/")[0]
      var topic = TOPICS.indexOf(seg) >= 0 ? seg : (LEGACY[seg] || "theme")
      var copies = JSON.parse(localStorage.getItem("flextab-settings-skeleton") || "null")
      var page = copies && copies[topic]
      if (!page || typeof page.html !== "string") return
      // Rows wrap with the width and the density (boot/look.js put it on <html> already), so a copy
      // is for the window width, density and screen height it was drawn at.
      if (innerWidth !== page.width) return
      if (!document.documentElement.classList.contains("density-" + page.density)) return
      if (Math.max(innerHeight, (screen && screen.availHeight) || 0) !== page.height) return
      host.innerHTML = page.html
      return
    }
    var s = JSON.parse(localStorage.getItem("flextab-shell-skeleton") || "null")
    if (!s || typeof s.html !== "string") return
    // The same breakpoints as hooks/useMediaQuery LEFT_INLINE_QUERY / RIGHT_INLINE_QUERY.
    if (matchMedia("(min-width: 768px)").matches !== s.leftInline) return
    if (matchMedia("(min-width: 1024px)").matches !== s.rightInline) return
    if (Math.max(innerHeight, (screen && screen.availHeight) || 0) !== s.height) return
    host.innerHTML = s.html
  } catch (e) { /* no copy: the themed surface */ }
})()
