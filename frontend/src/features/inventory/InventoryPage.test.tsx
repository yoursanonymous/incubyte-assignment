import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pageOf, renderApp, vehicle } from '../../test/helpers';

const LIST = 'GET /api/vehicles/search';

describe('inventory dashboard', () => {
  it('shows a loading state, then the vehicles with formatted prices and stock', async () => {
    renderApp('/', {
      [LIST]: {
        body: pageOf([
          vehicle(),
          vehicle({ id: 'v-2', make: 'Honda', model: 'Civic', price: '24999.99', quantity: 1 }),
        ]),
      },
    });
    expect(await screen.findByLabelText('Loading vehicles')).toBeInTheDocument();
    expect(await screen.findByText('$21,990.00')).toBeInTheDocument();
    expect(screen.getByText('$24,999.99')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '5 in stock' })).toBeInTheDocument();
    expect(screen.getByText('2 vehicles')).toBeInTheDocument();
  });

  it('disables Purchase when stock is zero and labels it accessibly', async () => {
    renderApp('/', {
      [LIST]: {
        body: pageOf([
          vehicle({ quantity: 0 }),
          vehicle({ id: 'v-2', model: 'Camry', quantity: 3 }),
        ]),
      },
    });
    const soldOut = await screen.findByRole('button', { name: 'Toyota Corolla is sold out' });
    expect(soldOut).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Purchase Toyota Camry' })).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Sold out' })).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    renderApp('/?make=zzz', { [LIST]: { body: pageOf([]) } });
    expect(await screen.findByRole('heading', { name: 'No vehicles match' })).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    let attempts = 0;
    renderApp('/', {
      [LIST]: () =>
        ++attempts === 1
          ? {
              status: 503,
              body: {
                error: {
                  code: 'SERVICE_UNAVAILABLE',
                  message: 'The service is temporarily unavailable.',
                  requestId: 'r',
                },
              },
            }
          : { body: pageOf([vehicle()]) },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Corolla')).toBeInTheDocument();
  });

  it('sends make, category, price range and in-stock filters to the API', async () => {
    const { http } = renderApp('/', { [LIST]: { body: pageOf([vehicle()]) } });
    await screen.findByText('Corolla');
    await userEvent.type(screen.getByLabelText('Make'), 'toy');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'SUV');
    await userEvent.type(screen.getByLabelText('Min price ($)'), '10000');
    await userEvent.type(screen.getByLabelText('Max price ($)'), '30000.50');
    await userEvent.click(screen.getByLabelText('In stock only'));
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      const url = new URL(http.calls.at(-1)!.url, 'http://x');
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        make: 'toy',
        category: 'SUV',
        minPrice: '10000',
        maxPrice: '30000.50',
        inStock: 'true',
      });
    });
  });

  it('rejects an inverted or malformed price range without calling the API', async () => {
    const { http } = renderApp('/', { [LIST]: { body: pageOf([vehicle()]) } });
    await screen.findByText('Corolla');
    const before = http.count(LIST);
    await userEvent.type(screen.getByLabelText('Min price ($)'), '5000');
    await userEvent.type(screen.getByLabelText('Max price ($)'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot exceed');
    expect(http.count(LIST)).toBe(before);
  });

  it('requests the next page', async () => {
    const { http } = renderApp('/', {
      [LIST]: {
        body: {
          data: [vehicle()],
          pagination: { page: 1, pageSize: 12, total: 30, totalPages: 3 },
        },
      },
    });
    await screen.findByText('Corolla');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(http.calls.at(-1)!.url).toContain('page=2'));
  });
});

describe('purchase flow', () => {
  it('confirms, sends quantity with an Idempotency-Key, and updates stock on the card', async () => {
    const { http } = renderApp('/', {
      [LIST]: { body: pageOf([vehicle({ quantity: 5 })]) },
      'POST /api/vehicles/v-1/purchase': {
        status: 201,
        body: {
          data: {
            id: 'p-1',
            vehicleId: 'v-1',
            quantity: 2,
            unitPrice: '21990.00',
            total: '43980.00',
            createdAt: '2026-01-02T00:00:00Z',
            remainingStock: 3,
          },
        },
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Purchase Toyota Corolla' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm purchase' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Increase quantity' }));
    expect(within(dialog).getByTestId('total')).toHaveTextContent('$43,980.00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Buy now' }));

    expect(
      await screen.findByText(/Purchased 2 × Toyota Corolla for \$43,980.00/),
    ).toBeInTheDocument();
    const call = http.calls.find((c) => c.method === 'POST' && c.url.endsWith('/purchase'))!;
    expect(call.body).toEqual({ quantity: 2 });
    expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(call.headers.authorization).toBe('Bearer access-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '3 in stock' })).toBeInTheDocument();
  });

  it('reports insufficient stock, refreshes the figure and keeps the dialog open', async () => {
    renderApp('/', {
      [LIST]: { body: pageOf([vehicle({ quantity: 3 })]) },
      'POST /api/vehicles/v-1/purchase': {
        status: 409,
        body: {
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: 'Only 1 unit(s) available.',
            details: { available: 1 },
            requestId: 'r',
          },
        },
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Purchase Toyota Corolla' }));
    await userEvent.click(screen.getByRole('button', { name: 'Buy now' }));
    expect(
      await screen.findByText('Only 1 left. Adjust the quantity and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 in stock' })).toBeInTheDocument();
  });

  it('reuses the same Idempotency-Key when retrying after a network failure', async () => {
    let attempts = 0;
    const { http } = renderApp('/', {
      [LIST]: { body: pageOf([vehicle()]) },
      'POST /api/vehicles/v-1/purchase': () => {
        if (++attempts === 1) throw new TypeError('network down');
        return {
          status: 201,
          body: {
            data: {
              id: 'p',
              vehicleId: 'v-1',
              quantity: 1,
              unitPrice: '21990.00',
              total: '21990.00',
              createdAt: '2026-01-02T00:00:00Z',
              remainingStock: 4,
            },
          },
        };
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Purchase Toyota Corolla' }));
    await userEvent.click(screen.getByRole('button', { name: 'Buy now' }));
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Buy now' }));
    await screen.findByText(/Purchased 1 × Toyota Corolla/);
    const keys = http.calls
      .filter((c) => c.url.endsWith('/purchase'))
      .map((c) => c.headers['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('traps focus, labels the dialog and closes on Escape, restoring focus', async () => {
    renderApp('/', { [LIST]: { body: pageOf([vehicle()]) } });
    const trigger = await screen.findByRole('button', { name: 'Purchase Toyota Corolla' });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Confirm purchase' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 8; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
