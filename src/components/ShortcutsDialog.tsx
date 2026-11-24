import { Modal, ModalBody, ModalHeader } from "~src/components/ui/modal"
import { Button } from "~src/components/ui/button"
import { Kbd } from "~src/components/ui/kbd"
import { useUIStore } from "~src/store/useUIStore"
import { useCommandShortcuts } from "~src/hooks/useCommandShortcuts"
import { browserName, openShortcutSettings } from "~src/lib/browserKind"

// The page's own shortcuts. They work while the new tab is focused and you
// are not typing; letters were chosen because Chrome keeps Ctrl/⌘+N for
// itself.
const IN_FLEXTAB: { label: string; keys: string[] }[] = [
  { label: "Search tabs, groups and spaces", keys: ["/", "Mod+K"] },
  { label: "New group in this category", keys: ["N"] },
  { label: "New project in this space", keys: ["Shift+N"] },
  { label: "New space", keys: ["Alt+N"] },
  { label: "Save all tabs", keys: ["Mod+Shift+S"] },
]

// The extension's commands work from any tab. People can change them in
// Chrome, so show what is set now, not what we suggested.
const COMMANDS: Record<string, string> = {
  "save-page": "Save this page",
  "save-window": "Save this window",
}

// Label in the primary colour (it is the content), keys quieter; a rule
// between rows ties each label to its keys across the gap.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="text-fg text-sm">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-fg-subtle text-xs">{children}</span>
    </li>
  )
}

const heading = "text-fg-subtle text-caption font-medium uppercase tracking-wider"

/** Every keyboard shortcut in one place, opened with "?" or the panel footer. */
export function ShortcutsDialog() {
  const open = useUIStore((s) => s.shortcutsOpen)
  const setOpen = useUIStore((s) => s.setShortcutsOpen)
  const set = useCommandShortcuts(open)
  const commands = Object.keys(COMMANDS).filter((name) => name in set).map((name) => ({ name, label: COMMANDS[name], shortcut: set[name] }))
  return (
    // A sheet to read (passive, modal standard §10): focus opens on the dialog
    // itself, so no control is highlighted before anyone touches it. Esc closes it.
    <Modal kind="dialog" size="m" open={open} onOpenChange={setOpen} initialFocus="dialog">
      <ModalHeader title="Keyboard shortcuts" description={<>Single keys work when you&apos;re not typing in a field.</>} />
      <ModalBody>
          <div className="flex flex-col gap-6">
            <section aria-labelledby="shortcuts-flextab" className="flex flex-col gap-1">
              <h3 id="shortcuts-flextab" className={heading}>In FlexTab</h3>
              <ul className="divide-y divide-ink/[0.06]">
                {IN_FLEXTAB.map((s) => (
                  <Row key={s.label} label={s.label}>
                    {s.keys.map((k, i) => <span key={k} className="flex items-center gap-1.5">{i > 0 && "or"}<Kbd shortcut={k} /></span>)}
                  </Row>
                ))}
              </ul>
            </section>

            <section aria-labelledby="shortcuts-chrome" className="flex flex-col gap-1">
              {/* "Change" sits on its section's heading, so it is clear what it changes. */}
              <div className="flex items-center justify-between text-xs">
                <h3 id="shortcuts-chrome" className={heading}>Anywhere in {browserName()}</h3>
                <Button
                  variant="link"
                  size="inline"
                  aria-label={`Change the ${browserName()} shortcuts`}
                  onClick={openShortcutSettings}
                >
                  Change
                </Button>
              </div>
              <ul className="divide-y divide-ink/[0.06]">
                {commands.map((c) => (
                  <Row key={c.name} label={c.label}>
                    {c.shortcut ? <Kbd shortcut={c.shortcut} /> : <span>Not set</span>}
                  </Row>
                ))}
              </ul>
            </section>
          </div>
      </ModalBody>
    </Modal>
  )
}
