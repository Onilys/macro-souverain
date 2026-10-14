import { createRoot } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type { Property } from '../../types';
import { useInlineEditor } from './useInlineEditor';

const mocks = vi.hoisted(() => ({
  property: undefined as unknown as Property,
  save: vi.fn(),
}));
vi.mock('../../core/context', () => ({
  useProperty: () => ({
    property: () => mocks.property,
    canEdit: () => true,
    onSave: mocks.save,
  }),
}));
vi.mock('../../utils', () => ({
  formatPropertyValue: (_property: Property, value: string | number) =>
    String(value),
}));

it.each([
  { valueType: 'STRING', value: 'Saved text' },
  { valueType: 'NUMBER', value: 42 },
] as const)(
  'does not save a canceled $valueType draft when the removed input blurs',
  async ({ valueType, value }) => {
    mocks.save.mockReset();
    mocks.property = {
      propertyId: 'assignment',
      propertyDefinitionId: 'definition',
      displayName: 'Property',
      owner: { scope: 'system' },
      createdAt: new Date(0),
      updatedAt: new Date(0),
      valueType,
      value,
      isMultiSelect: false,
    } as Property;
    let dispose!: () => void;
    const editor = createRoot((cleanup) => {
      dispose = cleanup;
      return useInlineEditor();
    });
    try {
      editor.startEdit();
      editor.setInputValue('123');
      editor.cancelEdit();
      await editor.save();
      expect(editor.isEditing()).toBe(false);
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.property.value).toBe(value);
    } finally {
      dispose();
    }
  }
);
