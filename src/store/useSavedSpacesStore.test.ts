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
  },
}));

describe('useSavedSpacesStore', () => {
  beforeEach(() => {
    useSavedSpacesStore.setState({
      savedSpaces: [],
      activeSpace: 0,
      activeProject: 0,
      activeCategory: 0,
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
    it('should set active space', () => {
      useSavedSpacesStore.getState().setActiveSpace(2);
      expect(useSavedSpacesStore.getState().activeSpace).toBe(2);
    });

    it('should set active project', () => {
      useSavedSpacesStore.getState().setActiveProject(1);
      expect(useSavedSpacesStore.getState().activeProject).toBe(1);
    });

    it('should set active category', () => {
      useSavedSpacesStore.getState().setActiveCategory(3);
      expect(useSavedSpacesStore.getState().activeCategory).toBe(3);
    });
  });
});