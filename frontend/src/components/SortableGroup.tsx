import { useState } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableProductCard } from './SortableProductCard';
import { Product, ProductGroup } from '../api/client';

interface Props {
  group: ProductGroup | { id: 'ungrouped'; name: 'Ungrouped' };
  products: Product[];
  onDeleteProduct: (id: number) => void;
  onRefreshProduct: (id: number) => Promise<void>;
  selectedIds: Set<number>;
  onSelectProduct: (id: number, selected: boolean) => void;
  onRenameGroup?: (id: number, newName: string) => void;
  onDeleteGroup?: (id: number) => void;
}

export function SortableGroup({
  group,
  products,
  onDeleteProduct,
  onRefreshProduct,
  selectedIds,
  onSelectProduct,
  onRenameGroup,
  onDeleteGroup,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `group-${group.id}`,
    data: {
      type: 'Group',
      group,
    },
    disabled: group.id === 'ungrouped', // Ungrouped cannot be dragged
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    marginBottom: '2rem',
    background: 'var(--surface-50)',
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    boxShadow: isDragging ? 'var(--shadow-lg)' : 'none',
  };

  const handleSaveEdit = () => {
    if (editName.trim() && group.id !== 'ungrouped' && onRenameGroup) {
      onRenameGroup(group.id as number, editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div 
        className="group-header" 
        style={{ display: 'flex', alignItems: 'center', marginBottom: isCollapsed ? '0' : '1rem' }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {group.id !== 'ungrouped' && (
          <div 
            className="group-drag-handle" 
            {...attributes} 
            {...listeners} 
            style={{ 
              cursor: 'grab', 
              marginRight: '0.5rem', 
              padding: '0.25rem',
              borderRadius: '4px',
              color: isHovering ? 'var(--text)' : 'var(--text-muted)',
              background: isHovering ? 'var(--background)' : 'transparent',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm12-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
            </svg>
          </div>
        )}

        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '0.25rem',
            marginRight: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
          title={isCollapsed ? "Expand group" : "Collapse group"}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        
        {isEditing && group.id !== 'ungrouped' ? (
          <input 
            type="text" 
            value={editName} 
            onChange={(e) => setEditName(e.target.value)} 
            onBlur={handleSaveEdit}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
            autoFocus
            style={{ fontSize: '1.25rem', fontWeight: 600, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.5rem' }}
          />
        ) : (
          <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: group.id !== 'ungrouped' ? 'pointer' : 'default' }} onDoubleClick={() => group.id !== 'ungrouped' && setIsEditing(true)}>
            {group.name} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>({products.length})</span>
          </h2>
        )}

        <div style={{ flex: 1 }} />

        {group.id !== 'ungrouped' && isHovering && (
          <div className="group-actions" style={{ display: 'flex', gap: '0.5rem', opacity: isHovering ? 1 : 0, transition: 'opacity 0.2s' }}>
             <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)}>Rename</button>
             <button className="btn btn-secondary btn-sm" style={{ color: 'var(--error)' }} onClick={() => onDeleteGroup && onDeleteGroup(group.id as number)}>Delete</button>
          </div>
        )}
      </div>

      <SortableContext 
        items={products.map(p => `product-${p.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {!isCollapsed && (
          <div className="products-list" style={{ minHeight: '100px' }}>
            {products.length > 0 ? (
              products.map((product) => (
                <SortableProductCard
                  key={product.id}
                  product={product}
                  onDelete={onDeleteProduct}
                  onRefresh={onRefreshProduct}
                  isSelected={selectedIds.has(product.id)}
                  onSelect={onSelectProduct}
                />
              ))
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                Drop products here
              </div>
            )}
          </div>
        )}
      </SortableContext>
    </div>
  );
}
