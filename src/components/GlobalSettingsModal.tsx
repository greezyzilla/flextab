import { useSettingsStore, type GroupLayout, type Density } from "~src/store/useSettingsStore";

export function GlobalSettingsModal({ onClose }: { onClose: () => void }) {
  const { groupLayout, setGroupLayout, gridColumns, setGridColumns, density, setDensity } = useSettingsStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-black-900 border border-black-700 rounded-xl w-[400px] p-6 flex flex-col gap-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white/90 font-sans text-base font-medium">Settings</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Group Layout */}
        <SettingSection label="Group Layout" description="How saved tab groups are displayed.">
          <ToggleGroup<GroupLayout>
            value={groupLayout}
            onChange={setGroupLayout}
            options={[
              { value: 'list', label: 'List', icon: <ListIcon /> },
              { value: 'grid', label: 'Grid', icon: <GridIcon /> },
            ]}
          />
        </SettingSection>

        {/* Grid Columns */}
        {groupLayout === 'grid' && (
          <SettingSection label="Grid Columns" description="Number of columns in grid view.">
            <ToggleGroup<string>
              value={String(gridColumns)}
              onChange={(v) => setGridColumns(Number(v))}
              options={[
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
              ]}
            />
          </SettingSection>
        )}

        {/* Density */}
        <SettingSection label="Layout Density" description="Controls spacing and padding across the UI.">
          <ToggleGroup<Density>
            value={density}
            onChange={setDensity}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </SettingSection>
      </div>
    </div>
  );
}

function SettingSection({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <div className="text-white/70 font-sans text-sm font-medium">{label}</div>
        <div className="text-white/30 font-sans text-xs mt-0.5">{description}</div>
      </div>
      {children}
    </div>
  );
}

function ToggleGroup<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-sans transition-colors border ${
            value === opt.value
              ? 'bg-white/10 border-white/20 text-white/80'
              : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/15'
          }`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ListIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}
