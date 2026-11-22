import * as SliderPrimitive from "@radix-ui/react-slider";
import type { IconWeight } from "~src/components/ui/icon";
import { Icon } from "~src/components/ui/icon"
import { DUPLICATE_TONE } from "~src/components/DuplicateMark";
import { Monitor, Moon, Sun, SwatchBook, RotateCcw, CaseSensitive, Layers, Link2, MousePointerClick, TriangleAlert, Wind, MousePointer2, Option, Keyboard, Ribbon, EyeOff, ArrowUpLeft, ArrowUpRight } from "lucide-react";
import type { ThemeMode } from "~src/lib/theme";
import { useSettingsStore, HUE_PRESETS, FONT_OPTIONS, type GroupLayout, type Density, type FontKey, type DuplicateMark, type DuplicateTone, type DuplicateCorner, type DuplicateLabel } from "~src/store/useSettingsStore";
import { Switch } from "~src/components/ui/switch";
import { Slider } from "~src/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~src/components/ui/select";
import { Button, IconTooltip } from "~src/components/ui/button";
import { SettingRow, ToggleGroup, SettingsPage, SettingsSection, type SettingControlProps } from "./shared";
import type { LinkCutScope } from "~src/lib/displayUrl";
import type { TabPreview } from "~src/store/useSettingsStore";
import { isMac } from "~src/lib/platform";

/** What each Link cut scope does, shown under its choice (TASK-71). */
const LINK_CUT_SCOPE_NOTE: Record<LinkCutScope, string> = {
  all: "The whole link is shortened as one.",
  site: "Only the site is shortened, so the path stays whole. If the path alone doesn't fit, the whole link is shortened.",
  path: "Only the path is shortened, so the site stays whole. If the site alone doesn't fit, the whole link is shortened.",
};

/** Alt is Option on macOS (TASK-80). */
const ALT_KEY = isMac() ? "Option" : "Alt";
/** When a cut tab's full title and link show, said under the choice (TASK-80). */
const TAB_PREVIEW_NOTE: Record<TabPreview, string> = {
  hover: "Pointing at a cut tab shows its full title and link.",
  alt: `Hold ${ALT_KEY} while pointing at a cut tab, or while it has keyboard focus, to see its full title and link.`,
};
import { ListIcon, GridIcon } from "./icons";
import { releaseTabGroups, requestTabGroups } from "~src/services/openTab";
import { Swatch } from "~src/components/ui/swatch";

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

/**
 * Appearance (TASK-84): Theme, Display and Layout are three topics in the
 * Settings nav. "Reset appearance" resets all three, so each of them ends with
 * it as an ordinary setting row (one Settings language, no page-only parts).
 */
export function ResetAppearance() {
  const resetAppearance = useSettingsStore(s => s.resetAppearance);
  return (
    <SettingsSection title="Defaults" icon={RotateCcw} subtitle="Put Theme, Display and Layout back to how FlexTab starts.">
      <SettingRow label="Reset appearance" description="Theme, Display and Layout go back to their defaults.">
        <Button variant="ghost" size="sm" onClick={resetAppearance}>Reset</Button>
      </SettingRow>
    </SettingsSection>
  );
}

/** Settings › Appearance › Theme: mode, colour and shape. */
export function ThemeTab() {
  const { theme, setTheme, hue, setHue, intensity, setIntensity, groupTint, setGroupTint, radius, setRadius } = useSettingsStore();
  return (
    <SettingsPage>
      <SettingsSection title="Colour and shape" icon={SwatchBook} subtitle="Light or dark, the accent colour, and how round things are.">
        <SettingRow label="Mode" description="Follow your device, or always use light or dark.">
          {(controlProps) => (
            <ToggleGroup<ThemeMode>
              {...controlProps}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System', icon: <Icon icon={Monitor} size="xs" /> },
                { value: 'light', label: 'Light', icon: <Icon icon={Sun} size="xs" /> },
                { value: 'dark', label: 'Dark', icon: <Icon icon={Moon} size="xs" /> },
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
              <div className="flex items-center justify-between gap-1">
                {HUE_PRESETS.map(p => (
                  <IconTooltip key={p.hue} content={p.label}>
                    <Swatch color={`hsl(${p.hue} 85% 56%)`} label={p.label} selected={hue === p.hue} onClick={() => setHue(p.hue)} />
                  </IconTooltip>
                ))}
              </div>
            </div>
          )}
        </SettingRow>

        <SettingRow label="Colour intensity" description="How much colour shows." info="0 = neutral grayscale; higher = vivid accent + tinted surfaces.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${intensity} percent`} min={0} max={100} value={[intensity]} onValueChange={(v) => setIntensity(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-10 text-right shrink-0">{intensity}%</span>
            </div>
          )}
        </SettingRow>

        <SettingRow label="Group tint" description="How strongly a coloured group tints its card." info="0 = no tint, the colour shows only as its dot.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${groupTint} percent`} min={0} max={100} value={[groupTint]} onValueChange={(v) => setGroupTint(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-10 text-right shrink-0">{groupTint}%</span>
            </div>
          )}
        </SettingRow>

        <SettingRow label="Roundness" description="Corner radius across the UI." info="0 = sharp, higher = softer.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${radius} pixels`} min={0} max={16} value={[radius]} onValueChange={(v) => setRadius(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-10 text-right shrink-0">{radius}px</span>
            </div>
          )}
        </SettingRow>
      </SettingsSection>
      <ResetAppearance />
    </SettingsPage>
  );
}

/** Settings › Appearance › Display: type, icons, scale, long titles and motion. */
export function DisplayTab() {
  const {
    fontFamily, setFontFamily, uiScale, setUiScale, titleCut, setTitleCut, linkCut, setLinkCut,
    linkCutScope, setLinkCutScope, tabPreview, setTabPreview, iconWeight, setIconWeight, reduceMotion, setReduceMotion,
  } = useSettingsStore();
  return (
    <SettingsPage>
      <SettingsSection title="Text and icons" icon={CaseSensitive} subtitle="Typeface, size and icon lines.">
        <SettingRow label="Font" description="The typeface used across the app.">
          {(controlProps) => (
            // A list that will keep growing is a dropdown, not a row of buttons (TASK-84).
            <Select value={fontFamily} onValueChange={(v) => setFontFamily(v as FontKey)}>
              <SelectTrigger {...controlProps}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(f => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>

        {/* Every icon is drawn through Icon (TASK-76), so one weight reaches them all. */}
        <SettingRow label="Icon weight" description="How thick the lines of every icon are.">
          {(controlProps) => (
            <ToggleGroup<IconWeight>
              {...controlProps}
              value={iconWeight}
              onChange={setIconWeight}
              options={[
                { value: 'thin', label: 'Thin' },
                { value: 'regular', label: 'Regular' },
                { value: 'bold', label: 'Bold' },
              ]}
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

      </SettingsSection>

      <SettingsSection title="Long titles and links" icon={Link2} subtitle="How cut titles and links are shortened and shown.">
        {/* Where a long saved tab title or link is cut (TASK-71): the value is
            where the "…" sits, so its thumb sits where the cut does. */}
        <SettingRow label="Title cut" description="Where a long tab title is shortened. 0% keeps its end, 100% keeps its start.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${titleCut} percent`} min={0} max={100} step={5} value={[titleCut]} onValueChange={(v) => setTitleCut(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-9 text-right shrink-0">{titleCut}%</span>
            </div>
          )}
        </SettingRow>

        <SettingRow label="Link cut" description="Where a long link is shortened. 0% keeps its end, 100% keeps its start.">
          {(controlProps) => (
            <div className="flex items-center gap-3">
              <Slider {...controlProps} aria-valuetext={`${linkCut} percent`} min={0} max={100} step={5} value={[linkCut]} onValueChange={(v) => setLinkCut(v[0])} className="flex-1" />
              <span className="text-fg-subtle text-xs font-sans w-9 text-right shrink-0">{linkCut}%</span>
            </div>
          )}
        </SettingRow>

        {/* Which part of the link gives way; its description says what to expect, fallback included. */}
        <SettingRow label="Link cut applies to" description={LINK_CUT_SCOPE_NOTE[linkCutScope]}>
          {(controlProps) => (
            <ToggleGroup<LinkCutScope>
              {...controlProps}
              value={linkCutScope}
              onChange={setLinkCutScope}
              options={[
                { value: 'all', label: 'All' },
                { value: 'site', label: 'Site' },
                { value: 'path', label: 'Path' },
              ]}
            />
          )}
        </SettingRow>

        {/* The preview of a cut tab, on hover or only on demand (TASK-80). */}
        <SettingRow label="Full title and link" description={TAB_PREVIEW_NOTE[tabPreview]}>
          {(controlProps) => (
            <ToggleGroup<TabPreview>
              {...controlProps}
              value={tabPreview}
              onChange={setTabPreview}
              options={[
                { value: 'hover', label: 'On hover', icon: <Icon icon={MousePointer2} size="sm" /> },
                { value: 'alt', label: `Hold ${ALT_KEY}`, icon: <Icon icon={isMac() ? Option : Keyboard} size="sm" /> },
              ]}
            />
          )}
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Motion" icon={Wind} subtitle="Animation across FlexTab.">
        <SettingRow label="Reduce motion" description="Minimise animations and transitions across the app.">
          {(controlProps) => (
            <div className="flex items-center gap-2">
              <Switch {...controlProps} checked={reduceMotion} onCheckedChange={setReduceMotion} />
              <span className="text-fg-muted text-sm font-sans">{reduceMotion ? 'On' : 'Off'}</span>
            </div>
          )}
        </SettingRow>
      </SettingsSection>
      <ResetAppearance />
    </SettingsPage>
  );
}

/** Settings › Appearance › Layout: how groups are laid out and how duplicates are marked. */
export function LayoutTab() {
  const {
    groupLayout, setGroupLayout, gridColumns, setGridColumns, density, setDensity,
    duplicateMark, setDuplicateMark, duplicateTone, setDuplicateTone,
    duplicateCorner, setDuplicateCorner, duplicateLabel, setDuplicateLabel,
  } = useSettingsStore();
  return (
    <SettingsPage>
      <SettingsSection title="Groups" icon={Layers} subtitle="How group cards are laid out.">
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

      </SettingsSection>

      <SettingsSection title="Duplicate tabs" icon={TriangleAlert} subtitle="How a tab saved twice in a group is marked.">
        <SettingRow label="Mark" description="How a tab saved twice in the same group is marked.">
          {(controlProps) => (
            <ToggleGroup<DuplicateMark>
              {...controlProps}
              value={duplicateMark}
              onChange={setDuplicateMark}
              options={[
                { value: 'ribbon', label: 'Ribbon', icon: <Icon icon={Ribbon} size="sm" /> },
                { value: 'icon', label: 'Icon', icon: <Icon icon={TriangleAlert} size="sm" /> },
                { value: 'off', label: 'Off', icon: <Icon icon={EyeOff} size="sm" /> },
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
                  { value: 'caution', label: 'Warning', icon: <Icon icon={TriangleAlert} size="sm" className={DUPLICATE_TONE.caution.icon} /> },
                  { value: 'accent', label: 'Accent', icon: <Icon icon={TriangleAlert} size="sm" className={DUPLICATE_TONE.accent.icon} /> },
                  { value: 'neutral', label: 'Grey', icon: <Icon icon={TriangleAlert} size="sm" className={DUPLICATE_TONE.neutral.icon} /> },
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
                  { value: 'right', label: 'Right', icon: <Icon icon={ArrowUpRight} size="sm" /> },
                  { value: 'left', label: 'Left', icon: <Icon icon={ArrowUpLeft} size="sm" /> },
                ]}
              />
            )}
          </SettingRow>
        )}

        {duplicateMark === 'ribbon' && (
          <SettingRow label="Ribbon text" description="A word, or the number of copies." info="A word, or how many copies of the tab are in the group.">
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
      </SettingsSection>
      <ResetAppearance />
    </SettingsPage>
  );
}

/**
 * Settings › Workspace › Saving & opening, last section (TASK-84): what
 * opening saved tabs does.
 * Moved out of Theme, where a behaviour sat among colours.
 */
export function OpeningTab() {
  const { openAsTabGroups, setOpenAsTabGroups } = useSettingsStore();
  // TASK-31. Turning it on asks for `tabGroups` right in this click (Chrome
  // needs the gesture) and only sticks when granted; off gives it back.
  const changeOpenAsTabGroups = (on: boolean) => {
    if (!on) { setOpenAsTabGroups(false); void releaseTabGroups(); return; }
    void requestTabGroups().then((answer) => { if (answer === "granted") setOpenAsTabGroups(true); });
  };
  return (
    <SettingsSection title="Opening" icon={MousePointerClick} subtitle="What happens when you open a group's tabs.">
      <SettingRow label="Open as tab groups" description="Open all makes a browser tab group." info="Open all puts a group's tabs in a browser tab group with the same name and color.">
        {(controlProps) => (
          <div className="flex items-center gap-2">
            <Switch {...controlProps} checked={openAsTabGroups} onCheckedChange={changeOpenAsTabGroups} />
            <span className="text-fg-muted text-sm font-sans">{openAsTabGroups ? 'On' : 'Off'}</span>
          </div>
        )}
      </SettingRow>
    </SettingsSection>
  );
}
