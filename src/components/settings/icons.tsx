import { Bookmark, Boxes, Cloud, Gauge, History, KeyRound, LayoutGrid, List, MousePointerClick, Palette, PanelsTopLeft, Type, User } from "lucide-react"
import { Icon } from "~src/components/ui/icon"

/** Settings › topic icons (TASK-76, TASK-84): one Lucide glyph per topic, nav size. */
export const SpacesIcon = () => <Icon icon={Boxes} size="sm" />
export const SavingIcon = () => <Icon icon={Bookmark} size="sm" />
export const OpeningIcon = () => <Icon icon={MousePointerClick} size="sm" />
export const PaletteIcon = () => <Icon icon={Palette} size="sm" />
export const DisplayIcon = () => <Icon icon={Type} size="sm" />
export const LayoutIcon = () => <Icon icon={PanelsTopLeft} size="sm" />
export const SyncIcon = () => <Icon icon={Cloud} size="sm" />
export const HistoryIcon = () => <Icon icon={History} size="sm" />
export const PlanIcon = () => <Icon icon={Gauge} size="sm" />
export const UserIcon = () => <Icon icon={User} size="sm" />
export const SecurityIcon = () => <Icon icon={KeyRound} size="sm" />

/** List and Grid in Settings › Layout › Group layout. */
export const ListIcon = () => <Icon icon={List} size="xs" />
export const GridIcon = () => <Icon icon={LayoutGrid} size="xs" />
