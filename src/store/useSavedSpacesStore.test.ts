import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSavedSpacesStore } from './useSavedSpacesStore';
import { v7 as uuidv7 } from 'uuid';
import type { SavedSpace, SavedProject, SavedCategory, SavedGroup, SavedTab } from '../types';

vi.mock('uuid', () => ({
  v7: vi.fn(() => 'mock-uuid'),
}));

vi.mock('chrome', () => ({
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
    sync: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
}));

describe('useSavedSpacesStore', () => {
  beforeEach(() => {
    useSavedSpacesStore.setState({
      savedSpaces: [],
      activeSpaceId: null,
      activeProjectId: null,
      activeCategoryId: null,
      lastModified: Date.now(),
    });
  });

  describe('Space CRUD operations', () => {
    it('should add a new space', () => {
      const newSpace: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(newSpace);

      expect(useSavedSpacesStore.getState().savedSpaces).toHaveLength(1);
      expect(useSavedSpacesStore.getState().savedSpaces[0]).toEqual(newSpace);
    });

    it('should remove a space', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().removeSavedSpace(space);

      expect(useSavedSpacesStore.getState().savedSpaces).toHaveLength(0);
    });

    it('should reset activeSpaceId when active space is removed', () => {
      const space1: SavedSpace = { id: 'space-1', name: 'Space 1', projects: [] };
      const space2: SavedSpace = { id: 'space-2', name: 'Space 2', projects: [] };

      useSavedSpacesStore.getState().addSavedSpace(space1);
      useSavedSpacesStore.getState().addSavedSpace(space2);
      useSavedSpacesStore.getState().setActiveSpace('space-1');
      useSavedSpacesStore.getState().removeSavedSpace(space1);

      expect(useSavedSpacesStore.getState().activeSpaceId).toBe('space-2');
    });

    it('should update a space', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);

      const updatedSpace: SavedSpace = {
        ...space,
        name: 'Updated Space',
      };

      useSavedSpacesStore.getState().updateSavedSpace(updatedSpace);

      expect(useSavedSpacesStore.getState().savedSpaces[0].name).toBe('Updated Space');
    });
  });

  describe('Project CRUD operations', () => {
    it('should add a project to a space', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects).toHaveLength(1);
      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0]).toEqual(project);
    });

    it('should remove a project from a space', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);
      useSavedSpacesStore.getState().removeSavedProject(space.id, project);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects).toHaveLength(0);
    });

    it('should update a project in a space', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);

      const updatedProject: SavedProject = {
        ...project,
        name: 'Updated Project',
      };

      useSavedSpacesStore.getState().updateSavedProject(space.id, updatedProject);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0].name).toBe('Updated Project');
    });
  });

  describe('Category CRUD operations', () => {
    it('should add a category to a project', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      const category: SavedCategory = {
        id: 'test-category-1',
        name: 'Test Category',
        groups: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);
      useSavedSpacesStore.getState().addSavedCategory(space.id, project.id, category);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0].categories).toHaveLength(1);
      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0].categories[0]).toEqual(category);
    });

    it('should remove a category from a project', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      const category: SavedCategory = {
        id: 'test-category-1',
        name: 'Test Category',
        groups: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);
      useSavedSpacesStore.getState().addSavedCategory(space.id, project.id, category);
      useSavedSpacesStore.getState().removeSavedCategory(space.id, project.id, category);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0].categories).toHaveLength(0);
    });
  });

  describe('Group CRUD operations', () => {
    it('should add a group to a category', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      const category: SavedCategory = {
        id: 'test-category-1',
        name: 'Test Category',
        groups: [],
      };

      const group: SavedGroup = {
        id: 'test-group-1',
        name: 'Test Group',
        tabs: [],
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);
      useSavedSpacesStore.getState().addSavedCategory(space.id, project.id, category);
      useSavedSpacesStore.getState().addSavedGroup(space.id, project.id, category.id, group);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0].categories[0].groups).toHaveLength(1);
    });
  });

  describe('Tab CRUD operations', () => {
    it('should add a tab to a group', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      const category: SavedCategory = {
        id: 'test-category-1',
        name: 'Test Category',
        groups: [],
      };

      const group: SavedGroup = {
        id: 'test-group-1',
        name: 'Test Group',
        tabs: [],
      };

      const tab: SavedTab = {
        id: 'test-tab-1',
        url: 'https://example.com',
        title: 'Test Tab',
        favicon: 'https://example.com/favicon.ico',
        order: 0,
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);
      useSavedSpacesStore.getState().addSavedCategory(space.id, project.id, category);
      useSavedSpacesStore.getState().addSavedGroup(space.id, project.id, category.id, group);
      useSavedSpacesStore.getState().addSavedTab(space.id, project.id, category.id, group.id, tab);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0].categories[0].groups[0].tabs).toHaveLength(1);
    });

    it('should remove a tab from a group', () => {
      const space: SavedSpace = {
        id: 'test-space-1',
        name: 'Test Space',
        projects: [],
      };

      const project: SavedProject = {
        id: 'test-project-1',
        name: 'Test Project',
        categories: [],
      };

      const category: SavedCategory = {
        id: 'test-category-1',
        name: 'Test Category',
        groups: [],
      };

      const group: SavedGroup = {
        id: 'test-group-1',
        name: 'Test Group',
        tabs: [],
      };

      const tab: SavedTab = {
        id: 'test-tab-1',
        url: 'https://example.com',
        title: 'Test Tab',
        favicon: 'https://example.com/favicon.ico',
        order: 0,
      };

      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().addSavedProject(space.id, project);
      useSavedSpacesStore.getState().addSavedCategory(space.id, project.id, category);
      useSavedSpacesStore.getState().addSavedGroup(space.id, project.id, category.id, group);
      useSavedSpacesStore.getState().addSavedTab(space.id, project.id, category.id, group.id, tab);
      useSavedSpacesStore.getState().removeSavedTab(space.id, project.id, category.id, group.id, tab);

      expect(useSavedSpacesStore.getState().savedSpaces[0].projects[0].categories[0].groups[0].tabs).toHaveLength(0);
    });
  });

  describe('Active state management', () => {
    it('should set active space by ID', () => {
      useSavedSpacesStore.getState().setActiveSpace('space-123');
      expect(useSavedSpacesStore.getState().activeSpaceId).toBe('space-123');
    });

    it('should set active project by ID', () => {
      useSavedSpacesStore.getState().setActiveProject('project-456');
      expect(useSavedSpacesStore.getState().activeProjectId).toBe('project-456');
    });

    it('should set active category by ID', () => {
      useSavedSpacesStore.getState().setActiveCategory('category-789');
      expect(useSavedSpacesStore.getState().activeCategoryId).toBe('category-789');
    });

    it('should cascade reset when active space is removed', () => {
      const space: SavedSpace = { id: 'space-1', name: 'S1', projects: [] };
      useSavedSpacesStore.getState().addSavedSpace(space);
      useSavedSpacesStore.getState().setActiveSpace('space-1');
      useSavedSpacesStore.getState().setActiveProject('proj-1');
      useSavedSpacesStore.getState().setActiveCategory('cat-1');

      useSavedSpacesStore.getState().removeSavedSpace(space);

      expect(useSavedSpacesStore.getState().activeSpaceId).toBeNull();
      expect(useSavedSpacesStore.getState().activeProjectId).toBeNull();
      expect(useSavedSpacesStore.getState().activeCategoryId).toBeNull();
    });
  });
});
