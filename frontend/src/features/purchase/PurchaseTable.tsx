import type { Purchase } from '../../shared/api/types';
import { formatMoney } from '../../shared/lib/money';

export function PurchaseTable({
  rows,
  showCustomer = false,
}: {
  rows: Purchase[];
  showCustomer?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-paper">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Purchases</caption>
        <thead className="bg-asphalt text-paper">
          <tr>
            <th scope="col" className="px-4 py-3">
              Date
            </th>
            {showCustomer && (
              <th scope="col" className="px-4 py-3">
                Customer
              </th>
            )}
            <th scope="col" className="px-4 py-3">
              Vehicle
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Qty
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Unit price
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-line">
              <td className="px-4 py-3">{new Date(p.createdAt).toLocaleString()}</td>
              {showCustomer && <td className="px-4 py-3">{p.customer?.email}</td>}
              <td className="px-4 py-3 font-semibold">
                {p.vehicle ? `${p.vehicle.make} ${p.vehicle.model}` : 'Vehicle'}
              </td>
              <td className="px-4 py-3 text-right">{p.quantity}</td>
              <td className="px-4 py-3 text-right">{formatMoney(p.unitPrice)}</td>
              <td className="px-4 py-3 text-right font-bold">{formatMoney(p.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
