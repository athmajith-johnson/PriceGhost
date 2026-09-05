import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ProductCard from './ProductCard';
import { Product } from '../api/client';

interface Props {
  product: Product;
  onDelete: (id: number) => void;
  onRefresh: (id: number) => Promise<void>;
  isSelected: boolean;
  onSelect: (id: number, selected: boolean) => void;
}

export function SortableProductCard({
  product,
  onDelete,
  onRefresh,
  isSelected,
  onSelect,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `product-${product.id}`,
    data: {
      type: 'Product',
      product,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dragHandle = (
    <div className="drag-handle" {...attributes} {...listeners} style={{ cursor: 'grab', paddingRight: '0.25rem', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm12-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
      </svg>
    </div>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <ProductCard
        product={product}
        onDelete={onDelete}
        onRefresh={onRefresh}
        showCheckbox={true}
        isSelected={isSelected}
        onSelect={onSelect}
        dragHandle={dragHandle}
      />
    </div>
  );
}
