import { useSyncConflict } from "~src/store/useSyncConflict"
import { resolveConflict } from "~src/services/syncEngine"

// Shown on sign-in when this device has local tabs AND the account already has
// tabs. Nothing is overwritten until the user chooses.
export function SyncConflictModal() {
  const { pending, serverTabs, localTabs } = useSyncConflict()

  if (!pending) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 font-sans">
      <div className="bg-black-900 border border-black-700 rounded-xl w-[420px] p-6 flex flex-col gap-5 shadow-2xl">
        <div className="flex flex-col gap-2">
          <h2 className="text-white/90 text-base font-medium">Choose what to keep</h2>
          <p className="text-white/45 text-sm leading-relaxed">
            This device has local tabs and your account already has saved tabs.
            Nothing is changed until you pick one.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-white/40">Your account</div>
            <div className="text-white/80 font-medium">{serverTabs} tab{serverTabs !== 1 ? "s" : ""}</div>
          </div>
          <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-white/40">This device</div>
            <div className="text-white/80 font-medium">{localTabs} tab{localTabs !== 1 ? "s" : ""}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => resolveConflict("merge")}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Merge both (recommended)
          </button>
          <button
            onClick={() => resolveConflict("server")}
            className="w-full px-4 py-2.5 rounded-lg text-sm bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.1] transition-colors"
          >
            Keep my account's tabs
          </button>
          <button
            onClick={() => resolveConflict("local")}
            className="w-full px-4 py-2.5 rounded-lg text-sm bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.1] transition-colors"
          >
            Keep this device's tabs
          </button>
        </div>

        <p className="text-white/25 text-[11px] leading-relaxed">
          "Merge both" keeps everything from both sides. The other options replace
          one with the other.
        </p>
      </div>
    </div>
  )
}
