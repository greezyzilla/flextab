import * as SliderPrimitive from "@radix-ui/react-slider";
import { useSettingsStore, HUE_PRESETS, FONT_OPTIONS, type GroupLayout, type Density, type FontKey } from "~src/store/useSettingsStore";
import { Switch } from "~src/components/ui/switch";
import { Slider } from "~src/components/ui/slider";
import { SettingRow, ToggleGroup, GroupHeading } from "./shared";
import { LayoutIcon, ListIcon, GridIcon } from "./icons";

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0 85% 56%), hsl(60 85% 56%), hsl(120 85% 56%), hsl(180 85% 56%), hsl(240 85% 56%), hsl(300 85% 56%), hsl(360 85% 56%))";

export function HueSlider({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <SliderPrimitive.Root
      min={0}
      max={360}
      step={1}
      value={[value]}
      onValueChange={(v) => onChange(v[0])}
      className="relative flex h-5 w-full grow touch-none select-none items-center"
    >
      <SliderPrimitive.Track
        className="relative h-3 w-full grow rounded-full"
        style={{ background: HUE_GRADIENT }}
      />
      <SliderPrimitive.Thumb
        aria-label="Hue"
        className="block h-4 w-4 rounded-full border-2 border-white bg-[var(--accent)] shadow outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)]"
      />
    </SliderPrimitive.Root>
  );
}

// Appearance = theme (accent + colour) and layout (list/grid, density), merged
// into one surface since they're all "how the workspace looks".
export function AppearanceTab() {
  const {
    hue, setHue, intensity, setIntensity, radius, setRadius,
    fontFamily, setFontFamily, uiScale, setUiScale,
    groupLayout, setGroupLayout, gridColumns, setGridColumns, density, setDensity,
    reduceMotion, setReduceMotion, resetAppearance,
  } = useSettingsStore();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-7">
        <GroupHeading>Theme</GroupHeading>
        <SettingRow label="Accent hue" description="The colour for accents and highlights.">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <HueSlider value={hue} onChange={setHue} />
              <span className="w-10 shrink-0 rounded-md border border-white/10 py-0.5 text-center text-xs font-sans text-white/45">{hue}°</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {HUE_PRESETS.map(p => (
                <button
                  key={p.hue}
                  onClick={() => setHue(p.hue)}
                  className={`h-5 w-5 rounded-full border transition-all ${hue === p.hue ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/40'}`}
                  style={{ backgroundColor: `hsl(${p.hue} 85% 56%)` }}
                  title={p.label}
                />
              ))}
            </div>
          </div>
        </SettingRow>

        <SettingRow label="Colour intensity" description="How much colour shows. 0 = neutral grayscale; higher = vivid accent + tinted surfaces.">
          <div className="flex items-center gap-3">
            <Slider min={0} max={100} value={[intensity]} onValueChange={(v) => setIntensity(v[0])} className="flex-1" />
            <span className="text-white/30 text-xs font-sans w-9 text-right shrink-0">{intensity}%</span>
          </div>
        </SettingRow>

        <SettingRow label="Roundness" description="Corner radius across the UI. 0 = sharp, higher = softer.">
          <div className="flex items-center gap-3">
            <Slider min={0} max={16} value={[radius]} onValueChange={(v) => setRadius(v[0])} className="flex-1" />
            <span className="text-white/30 text-xs font-sans w-9 text-right shrink-0">{radius}px</span>
          </div>
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Display</GroupHeading>
        <SettingRow label="Font" description="The typeface used across the app.">
          <ToggleGroup<FontKey>
            value={fontFamily}
            onChange={setFontFamily}
            options={FONT_OPTIONS.map(f => ({ value: f.key, label: f.label }))}
          />
        </SettingRow>

        <SettingRow label="Interface scale" description="Zoom the whole UI in or out.">
          <div className="flex items-center gap-3">
            <Slider min={0.8} max={1.2} step={0.05} value={[uiScale]} onValueChange={(v) => setUiScale(v[0])} className="flex-1" />
            <span className="text-white/30 text-xs font-sans w-9 text-right shrink-0">{Math.round(uiScale * 100)}%</span>
          </div>
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Layout</GroupHeading>
        <SettingRow label="Group layout" description="How saved tab groups are displayed.">
          <ToggleGroup<GroupLayout>
            value={groupLayout}
            onChange={setGroupLayout}
            options={[
              { value: 'list', label: 'List', icon: <ListIcon /> },
              { value: 'grid', label: 'Grid', icon: <GridIcon /> },
            ]}
          />
        </SettingRow>

        {groupLayout === 'grid' && (
          <SettingRow label="Grid columns" description="Number of columns in grid view.">
            <ToggleGroup<string>
              value={String(gridColumns)}
              onChange={(v) => setGridColumns(Number(v))}
              options={[
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
                { value: '5', label: '5' },
                { value: '6', label: '6' },
              ]}
            />
          </SettingRow>
        )}

        <SettingRow label="Density" description="Controls spacing and padding.">
          <ToggleGroup<Density>
            value={density}
            onChange={setDensity}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'cozy', label: 'Cozy' },
              { value: 'comfortable', label: 'Comfortable' },
            ]}
          />
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Motion</GroupHeading>
        <SettingRow label="Reduce motion" description="Minimise animations and transitions across the app.">
          <div className="flex items-center gap-2">
            <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />
            <span className="text-white/60 text-sm font-sans">{reduceMotion ? 'On' : 'Off'}</span>
          </div>
        </SettingRow>
      </section>

      <div className="pt-2 border-t border-white/5">
        <Button variant="ghost" size="sm" onClick={resetAppearance} className="!text-white/45 hover:!text-white/80">
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
