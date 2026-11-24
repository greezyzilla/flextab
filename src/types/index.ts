// Groupings: Space -> Project -> Category -> Group (tabs)

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  favicon: string;
  order?: number;
}

/**
 * Group metadata, stored in the API's existing group `config` field.
 * `kind: "unsorted"` marks the one system group per category that holds tabs
 * saved without a chosen group.
 */
export interface GroupConfig {
  kind?: "unsorted";
}

/** An optional group colour, the nine of Chrome's tab groups. */
export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

export interface SavedGroup {
  id: string;
  name: string;
  tabs: SavedTab[];
  order?: number;
  config?: GroupConfig;
  color?: GroupColor;
}

export interface SavedCategory {
  id: string;
  name: string;
  groups: SavedGroup[];
  order?: number;
}

export interface SavedProject {
  id: string;
  name: string;
  categories: SavedCategory[];
  order?: number;
}

export interface SavedSpace {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  abbreviation?: string;
  projects: SavedProject[];
  order?: number;
}
