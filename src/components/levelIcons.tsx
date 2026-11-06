import { Folder, Layers, ListTree } from "lucide-react"

/**
 * One distinct shape per organisational level (TASK-1, option B), used
 * everywhere the level appears (sidebar, breadcrumb, sections, destination
 * picker) so a level is recognisable by shape, never by colour alone
 * (WCAG 1.4.1). Labels stay visible next to every icon (icons alone are
 * ambiguous). Space = its avatar (same letters/colour as the rail);
 * Tab = its favicon.
 */
type IconProps = { className?: string }

export function ProjectIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <Folder className={className} strokeWidth={1.75} aria-hidden />
}

/** A category is a part of a project: a sub-list in the project's tree. */
export function CategoryIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <ListTree className={className} strokeWidth={1.75} aria-hidden />
}

/** A group is a stack of saved tabs. */
export function GroupIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <Layers className={className} strokeWidth={1.75} aria-hidden />
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
      : active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
    color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
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
