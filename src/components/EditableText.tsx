import { useState, useEffect } from 'react';
import { Input } from './ui/Input';

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
  const [cancelled, setCancelled] = useState(false);

  // Sync editValue when entering edit mode or when value changes externally
  useEffect(() => {
    setEditValue(value);
    setCancelled(false);
  }, [value, isEditing]);

  const handleSave = () => {
    if (cancelled) return;
    if (editValue.trim()) {
      onSave(editValue.trim());
    }
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setCancelled(true);
      setEditValue(value);
      onCancel();
    }
  };

  if (isEditing) {
    return (
      <Input
        variant="inline"
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={className}
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
