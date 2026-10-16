import { Button } from "./ui/button";

export function WorkspaceLoadError() {
  return (
    <div className="bg-black-900 p-6 font-sans text-white/90">
      <p role="alert" className="text-sm mb-3">
        Could not load your saved workspace. Editing and sync are paused to protect your data.
      </p>
      <p className="text-xs text-white/60 mb-4">
        Try reloading. If this keeps happening, keep this extension installed and contact support before clearing its storage.
      </p>
      <Button variant="secondary" onClick={() => window.location.reload()}>Reload workspace</Button>
    </div>
  );
}
