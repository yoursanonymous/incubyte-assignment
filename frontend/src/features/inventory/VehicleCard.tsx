import { Link } from 'react-router-dom';
import type { Vehicle } from '../../shared/api/types';
import { formatMoney } from '../../shared/lib/money';
import { Button } from '../../shared/ui/Button';
import { StockBays } from '../../shared/ui/StockBays';

const label = (category: string) => category.charAt(0) + category.slice(1).toLowerCase();

export function VehicleCard({
  vehicle,
  onPurchase,
}: {
  vehicle: Vehicle;
  onPurchase: (v: Vehicle) => void;
}) {
  const soldOut = vehicle.quantity === 0;
  return (
    <article
      aria-label={`${vehicle.make} ${vehicle.model}`}
      className="flex flex-col rounded-lg border border-line bg-paper p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">
            {vehicle.make}
          </p>
          <h3 className="font-display text-3xl font-bold leading-none">
            <Link to={`/vehicles/${vehicle.id}`} className="hover:underline">
              {vehicle.model}
            </Link>
          </h3>
        </div>
        <span className="rounded border border-ink/30 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
          {label(vehicle.category)}
        </span>
      </div>
      <p className="mt-5 font-display text-4xl font-bold">{formatMoney(vehicle.price)}</p>
      <div className="mt-3">
        <StockBays quantity={vehicle.quantity} />
      </div>
      <div className="mt-5 flex gap-2 pt-1">
        <Link
          to={`/vehicles/${vehicle.id}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-ink/30 bg-paper px-4 font-semibold hover:border-ink"
        >
          Details
        </Link>
        <Button
          className="flex-1"
          disabled={soldOut}
          onClick={() => onPurchase(vehicle)}
          aria-label={
            soldOut
              ? `${vehicle.make} ${vehicle.model} is sold out`
              : `Purchase ${vehicle.make} ${vehicle.model}`
          }
        >
          {soldOut ? 'Sold out' : 'Purchase'}
        </Button>
      </div>
    </article>
  );
}
