import "../../style.css"

function IndexPopup() {
  return (
    <div className="w-72 bg-black-900 p-4 font-sans">
      <h2 className="text-white/90 text-base font-medium mb-3">FlexTab</h2>
      <p className="text-white/50 text-xs mb-4">
        Open a new tab to manage your saved spaces, projects, and tab groups.
      </p>
      <button
        onClick={() => chrome.tabs.create({ url: "chrome://newtab" })}
        className="w-full px-3 py-2 bg-white/10 text-white/80 rounded-md hover:bg-white/20 transition-colors text-sm"
      >
        Open FlexTab
      </button>
    </div>
  )
}

export default IndexPopup
