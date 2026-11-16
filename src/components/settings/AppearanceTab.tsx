import * as SliderPrimitive from "@radix-ui/react-slider";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemeMode } from "~src/lib/theme";
import { useSettingsStore, HUE_PRESETS, FONT_OPTIONS, type GroupLayout, type Density, type FontKey, type DuplicateMark, type DuplicateTone, type DuplicateCorner, type DuplicateLabel } from "~src/store/useSettingsStore";
import { Switch } from "~src/components/ui/switch";
import { Slider } from "~src/components/ui/slider";
import { Button } from "~src/components/ui/button";
import { SettingRow, ToggleGroup, GroupHeading, type SettingControlProps } from "./shared";
import { LayoutIcon, ListIcon, GridIcon } from "./icons";
import { canGroupTabs, releaseTabGroups, requestTabGroups } from "~src/services/openTab";

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0 85% 56%), hsl(60 85% 56%), hsl(120 85% 56%), hsl(180 85% 56%), hsl(240 85% 56%), hsl(300 85% 56%), hsl(360 85% 56%))";

export function HueSlider({ value, onChange, ...controlProps }: { value: number; onChange: (h: number) => void } & SettingControlProps) {
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
        {...controlProps}
        aria-valuetext={`${value} degrees`}
        className="block h-4 w-4 rounded-full border-2 border-white bg-[var(--accent)] shadow outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)]"
      />
    </SliderPrimitive.Root>
  );
}

// Appearance = theme (accent + colour) and layout (list/grid, density), merged
// into one surface since they're all "how the workspace looks".
export function AppearanceTab() {
  const {
    theme, setTheme, hue, setHue, intensity, setIntensity, groupTint, setGroupTint, radius, setRadius,
    fontFamily, setFontFamily, uiScale, setUiScale,
    groupLayout, setGroupLayout, gridColumns, setGridColumns, density, setDensity,
    duplicateMark, setDuplicateMark, duplicateTone, setDuplicateTone,
    duplicateCorner, setDuplicateCorner, duplicateLabel, setDuplicateLabel,
    reduceMotion, setReduceMotion, resetAppearance, openAsTabGroups, setOpenAsTabGroups,
  } = useSettingsStore();

  // TASK-31. Turning it on asks for `tabGroups` right in this click (Chrome
  // needs the gesture) and only sticks when granted; off gives it back.
  const changeOpenAsTabGroups = (on: boolean) => {
    if (!on) { setOpenAsTabGroups(false); void releaseTabGroups(); return; }
    void requestTabGroups().then((answer) => { if (answer === "granted") setOpenAsTabGroups(true); });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-7">
        <GroupHeading>Theme</GroupHeading>
        <SettingRow label="Mode" description="Follow your device, or always use light or dark.">
          {(controlProps) => (
            <ToggleGroup<ThemeMode>
              {...controlProps}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System', icon: <Monitor className="h-3 w-3" aria-hidden /> },
                { value: 'light', label: 'Light', icon: <Sun className="h-3 w-3" aria-hidden /> },
                { value: 'dark', label: 'Dark', icon: <Moon className="h-3 w-3" aria-hidden /> },
              ]}
            />
          )}
        </SettingRow>

        <SettingRow label="Accent hue" description="The colour for accents and highlights.">
          {(controlProps) => (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <HueSlider {...controlProps} value={hue} onChange={setHue} />
                <span className="w-10 shrink-0 rounded-md border border-ink/10 py-0.5 text-center text-xs font-sans text-fg-subtle">{hue}°</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {HUE_PRESETS.map(p => (
                  <button
                    key={p.hue}
                    onClick={() => setHue(p.hue)}
                    className={`h-5 w-5 rounded-full border transition-all ${hue === p.hue ? 'border-ink/70 scale-110' : 'border-transparent hover:border-ink/40'}`}
                    style={{ backgroundColor: `hsl(${p.hue} 85% 56%)` }}
                    title={p.label}
                  />
                ))}
              </div>
            </div>
          )}
        </SettingRow>

        <SettingRow label="Colour intensity" description="How much colour shows. 0 = neutral grayscale; higher = vivid accent + tinted surfaces.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${intensity} percent`} min={0} max={100} value={[intensity]} onValueChange={(v) => setIntensity(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-9 text-right shrink-0">{intensity}%</span>
            </div>
          )}
        </SettingRow>

        <SettingRow label="Group tint" description="How strongly a coloured group tints its card. 0 = no tint, the colour shows only as its dot.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${groupTint} percent`} min={0} max={100} value={[groupTint]} onValueChange={(v) => setGroupTint(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-9 text-right shrink-0">{groupTint}%</span>
            </div>
          )}
        </SettingRow>

        {canGroupTabs() && (
          <SettingRow label="Open as tab groups" description="Open all puts a group's tabs in a browser tab group with the same name and color.">
            {(controlProps) => (
              <div className="flex items-center gap-2">
                <Switch {...controlProps} checked={openAsTabGroups} onCheckedChange={changeOpenAsTabGroups} />
                <span className="text-fg-muted text-sm font-sans">{openAsTabGroups ? 'On' : 'Off'}</span>
              </div>
            )}
          </SettingRow>
        )}

        <SettingRow label="Roundness" description="Corner radius across the UI. 0 = sharp, higher = softer.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${radius} pixels`} min={0} max={16} value={[radius]} onValueChange={(v) => setRadius(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-9 text-right shrink-0">{radius}px</span>
            </div>
          )}
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Display</GroupHeading>
        <SettingRow label="Font" description="The typeface used across the app.">
          {(controlProps) => (
            <ToggleGroup<FontKey>
              {...controlProps}
              value={fontFamily}
              onChange={setFontFamily}
              options={FONT_OPTIONS.map(f => ({ value: f.key, label: f.label }))}
            />
          )}
        </SettingRow>

        <SettingRow label="Interface scale" description="Zoom the whole UI in or out.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${Math.round(uiScale * 100)} percent`} min={0.8} max={1.2} step={0.05} value={[uiScale]} onValueChange={(v) => setUiScale(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-9 text-right shrink-0">{Math.round(uiScale * 100)}%</span>
            </div>
          )}
        </SettingRow>
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Layout</GroupHeading>
        <SettingRow label="Group layout" description="How saved tab groups are displayed.">
          {(controlProps) => (
            <ToggleGroup<GroupLayout>
              {...controlProps}
              value={groupLayout}
              onChange={setGroupLayout}
              options={[
                { value: 'list', label: 'List', icon: <ListIcon /> },
                { value: 'grid', label: 'Grid', icon: <GridIcon /> },
              ]}
            />
          )}
        </SettingRow>

        {groupLayout === 'grid' && (
          <SettingRow label="Grid columns" description="Maximum columns in grid view. Narrow windows show fewer so titles stay readable.">
            {(controlProps) => (
              <ToggleGroup<string>
                {...controlProps}
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
            )}
          </SettingRow>
        )}

        <SettingRow label="Density" description="Controls spacing and padding.">
          {(controlProps) => (
            <ToggleGroup<Density>
              {...controlProps}
              value={density}
              onChange={setDensity}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'cozy', label: 'Cozy' },
                { value: 'comfortable', label: 'Comfortable' },
              ]}
            />
          )}
        </SettingRow>

        <SettingRow label="Duplicate tabs" description="How a tab saved twice in the same group is marked.">
          {(controlProps) => (
            <ToggleGroup<DuplicateMark>
              {...controlProps}
              value={duplicateMark}
              onChange={setDuplicateMark}
              options={[
                { value: 'ribbon', label: 'Ribbon' },
                { value: 'icon', label: 'Icon' },
                { value: 'off', label: 'Off' },
              ]}
            />
          )}
        </SettingRow>

        {duplicateMark !== 'off' && (
          <SettingRow label="Duplicate colour" description="The colour of the duplicate mark.">
            {(controlProps) => (
              <ToggleGroup<DuplicateTone>
                {...controlProps}
                value={duplicateTone}
                onChange={setDuplicateTone}
                options={[
                  { value: 'caution', label: 'Warning' },
                  { value: 'accent', label: 'Accent' },
                  { value: 'neutral', label: 'Grey' },
                ]}
              />
            )}
          </SettingRow>
        )}

        {duplicateMark === 'ribbon' && (
          <SettingRow label="Ribbon corner" description="Which top corner of the tab the ribbon sits on.">
            {(controlProps) => (
              <ToggleGroup<DuplicateCorner>
                {...controlProps}
                value={duplicateCorner}
                onChange={setDuplicateCorner}
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'left', label: 'Left' },
                ]}
              />
            )}
          </SettingRow>
        )}

        {duplicateMark === 'ribbon' && (
          <SettingRow label="Ribbon text" description="A word, or how many copies of the tab are in the group.">
            {(controlProps) => (
              <ToggleGroup<DuplicateLabel>
                {...controlProps}
                value={duplicateLabel}
                onChange={setDuplicateLabel}
                options={[
                  { value: 'dupe', label: 'DUPE' },
                  { value: 'count', label: 'Count' },
                ]}
              />
            )}
          </SettingRow>
        )}
      </section>

      <section className="flex flex-col gap-7">
        <GroupHeading>Motion</GroupHeading>
        <SettingRow label="Reduce motion" description="Minimise animations and transitions across the app.">
          {(controlProps) => (
            <div className="flex items-center gap-2">
              <Switch {...controlProps} checked={reduceMotion} onCheckedChange={setReduceMotion} />
              <span className="text-fg-muted text-sm font-sans">{reduceMotion ? 'On' : 'Off'}</span>
            </div>
          )}
        </SettingRow>
      </section>

      <div className="pt-2 border-t border-ink/5">
        <Button variant="ghost" size="sm" onClick={resetAppearance} className="!text-fg-subtle hover:!text-fg">
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
