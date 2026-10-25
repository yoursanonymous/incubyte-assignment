const MAX_BAYS = 10;

/**
 * The signature element: stock drawn as parking bays. A filled bay is one unit on the lot;
 * an empty outline is a vacant bay. Text and aria-label carry the same information.
 */
export function StockBays({ quantity }: { quantity: number }) {
  const filled = Math.min(quantity, MAX_BAYS);
  const extra = quantity - filled;
  const label = quantity === 0 ? 'Sold out' : `${quantity} in stock`;
  return (
    <div className="flex items-center gap-2" role="img" aria-label={label}>
      <svg width={MAX_BAYS * 9} height="22" viewBox={`0 0 ${MAX_BAYS * 9} 22`} aria-hidden="true">
        {Array.from({ length: MAX_BAYS }, (_, i) => (
          <path
            key={i}
            d={`M${i * 9 + 1} 21V3h6v18`}
            fill={i < filled ? 'var(--color-paint)' : 'none'}
            stroke={i < filled ? 'var(--color-ink)' : 'var(--color-line)'}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <span
        aria-hidden="true"
        className={`text-sm font-semibold ${quantity === 0 ? 'text-stop' : 'text-go'}`}
      >
        {quantity === 0 ? 'Sold out' : extra > 0 ? `${quantity} in stock` : `${quantity} in stock`}
      </span>
    </div>
  );
}
