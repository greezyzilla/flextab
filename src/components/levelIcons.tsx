import { Folder, Inbox, Layers, ListTree } from "lucide-react"
import { Icon, type IconSize } from "~src/components/ui/icon"

/**
 * One distinct shape per organisational level (TASK-1, option B), used
 * everywhere the level appears (sidebar, breadcrumb, sections, destination
 * picker) so a level is recognisable by shape, never by colour alone
 * (WCAG 1.4.1). Labels stay visible next to every icon (icons alone are
 * ambiguous). Space = its avatar (same letters/colour as the rail);
 * Tab = its favicon. Drawn through Icon (TASK-76): `size` is from its scale.
 */
type IconProps = { size?: IconSize; className?: string }

export function ProjectIcon({ size = "sm", className }: IconProps) {
  return <Icon icon={Folder} size={size} className={className} />
}

/** A category is a part of a project: a sub-list in the project's tree. */
export function CategoryIcon({ size = "sm", className }: IconProps) {
  return <Icon icon={ListTree} size={size} className={className} />
}

/** A group is a stack of saved tabs. */
export function GroupIcon({ size = "sm", className }: IconProps) {
  return <Icon icon={Layers} size={size} className={className} />
}

/**
 * Unsorted (TASK-20) is the system's tray for tabs saved without a group:
 * a tray shape, not a dashed one (dashed means "empty / create" in this app).
 */
export function UnsortedIcon({ size = "sm", className }: IconProps) {
  return <Icon icon={Inbox} size={size} className={className} />
}

const RAIL_TEXT_RATIO = 12 / 40;

/**
 * Space avatar fill + letter colour. One formula for the rail and every
 * inline avatar, so a space looks the same wherever it appears.
 */
export function spaceAvatarColors(space: { color?: string } | undefined, active: boolean) {
  return {
    backgroundColor: space?.color
      ? `${space.color}${active ? "40" : "25"}`
      : active ? "hsl(var(--ink) / 0.2)" : "hsl(var(--ink) / 0.08)",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
  };
}

/** The rail's space avatar, shrunk for inline contexts (breadcrumb, picker). */
export function SpaceAvatar({ space, size = 16, active = true }: {
  space?: { name: string; abbreviation?: string; color?: string };
  size?: number;
  /** Rail's selected look; inline avatars usually show the open space. */
  active?: boolean;
}) {
  const letters = (space?.abbreviation || space?.name.slice(0, 2) || "?").toUpperCase();
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full inline-flex items-center justify-center font-sans font-normal"
      style={{
        width: size,
        height: size,
        // Same letter-to-circle ratio as the rail avatar (12px text in 40px).
        fontSize: size * RAIL_TEXT_RATIO,
        ...spaceAvatarColors(space, active),
      }}
    >
      {letters}
    </span>
  );
}
