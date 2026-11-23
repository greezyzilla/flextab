import { useEffect, type RefObject } from "react";
import type { SettingsTab } from "~src/components/settings/types";
import { currentDensity, measureSettingsPage, storeSettingsShape } from "~src/lib/settingsShape";
import { storeSettingsSkeletonMarkup } from "~src/components/layout/SettingsSkeleton";

/**
 * Keeps the loading shell's copy of the open Settings page current (TASK-108): its shape
 * (lib/settingsShape.ts) and its skeleton markup for boot/shell.js, written once the page settles
 * and again whenever it changes size (a list arrives, a row wraps, the density changes).
 */
export function useSettingsShapeMirror(tab: SettingsTab, signedIn: boolean, columnRef: RefObject<HTMLElement | null>, previewRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const record = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        storeSettingsShape(tab, measureSettingsPage(column, previewRef.current, currentDensity()), signedIn);
        storeSettingsSkeletonMarkup(tab);
      }, 300);
    };
    record();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(record);
    observer?.observe(column);
    if (previewRef.current) observer?.observe(previewRef.current);
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, [tab, signedIn, columnRef, previewRef]);
}
