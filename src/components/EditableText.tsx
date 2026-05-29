import { useState } from 'react';

export interface EditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  isEditing: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onCancel: () => void;
}

export function EditableText({ value, onSave, className, isEditing, canEdit, onEdit, onCancel }: EditableTextProps) {
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    if (editValue.trim()) {
      onSave(editValue.trim());
    }
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`bg-white/10 text-white px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-blue-500 font-sans ${className}`}
        autoFocus
      />
    );
  }

  return (
    <span
      className={`${className} ${canEdit ? 'cursor-pointer' : ''}`}
      onClick={(e) => {
        if (canEdit) {
          e.stopPropagation();
          onEdit();
        }
      }}
    >
      {value}
    </span>
  );
}
