import { Bookmark, Boxes, Cloud, Gauge, History, LayoutGrid, List, Palette, Receipt, User } from "lucide-react"
import { Icon } from "~src/components/ui/icon"

/** Settings › section icons (TASK-76): one Lucide glyph per section, nav size. */
export const SpacesIcon = () => <Icon icon={Boxes} size="sm" />
export const SavingIcon = () => <Icon icon={Bookmark} size="sm" />
export const PaletteIcon = () => <Icon icon={Palette} size="sm" />
export const SyncIcon = () => <Icon icon={Cloud} size="sm" />
export const HistoryIcon = () => <Icon icon={History} size="sm" />
export const PlanIcon = () => <Icon icon={Gauge} size="sm" />
export const ReceiptIcon = () => <Icon icon={Receipt} size="sm" />
export const UserIcon = () => <Icon icon={User} size="sm" />

/** List and Grid in Settings › Appearance › Groups layout. */
export const ListIcon = () => <Icon icon={List} size="xs" />
export const GridIcon = () => <Icon icon={LayoutGrid} size="xs" />
