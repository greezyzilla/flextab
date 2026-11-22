// The new tab's shell before its script runs (TASK-107): a classic script right after the empty
// #boot-skeleton in newtab.html, so it runs before the first paint. It puts in the markup the app
// last rendered for this workspace (ShellSkeleton storeShellSkeletonMarkup), when this window has
// the layout and screen height it was drawn for; otherwise the page shows the themed surface
// until React draws the skeleton. React removes this copy in its first commit.
;(function () {
  var host = document.getElementById("boot-skeleton")
  if (!host) return
  try {
    var s = JSON.parse(localStorage.getItem("flextab-shell-skeleton") || "null")
    if (!s || typeof s.html !== "string") return
    // The same breakpoints as hooks/useMediaQuery LEFT_INLINE_QUERY / RIGHT_INLINE_QUERY.
    if (matchMedia("(min-width: 768px)").matches !== s.leftInline) return
    if (matchMedia("(min-width: 1024px)").matches !== s.rightInline) return
    if (Math.max(innerHeight, (screen && screen.availHeight) || 0) !== s.height) return
    host.innerHTML = s.html
  } catch (e) { /* no copy: the themed surface */ }
})()
