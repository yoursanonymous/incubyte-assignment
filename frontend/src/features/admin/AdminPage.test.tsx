import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pageOf, renderApp, vehicle } from '../../test/helpers';

const LIST = 'GET /api/vehicles/search';

describe('admin-only UI', () => {
  it('hides the Manage link from customers and blocks /admin', async () => {
    renderApp('/admin', { [LIST]: { body: pageOf([]) } }, { role: 'CUSTOMER' });
    expect(await screen.findByRole('heading', { name: 'Staff only' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add vehicle' })).not.toBeInTheDocument();
  });

  it('shows Manage and the management table to administrators', async () => {
    renderApp('/admin', { [LIST]: { body: pageOf([vehicle()]) } }, { role: 'ADMIN' });
    expect(await screen.findByRole('link', { name: 'Manage' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit Toyota Corolla' })).toBeInTheDocument();
  });

  it('validates the add-vehicle form before calling the API', async () => {
    const { http } = renderApp('/admin', { [LIST]: { body: pageOf([]) } }, { role: 'ADMIN' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    const dialog = screen.getByRole('dialog', { name: 'Add vehicle' });
    await userEvent.type(within(dialog).getByLabelText('Price ($)'), '12.999');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add vehicle' }));
    expect(await within(dialog).findByText('Enter the make.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a category.')).toBeInTheDocument();
    expect(within(dialog).getByText(/at most 2 decimals/)).toBeInTheDocument();
    expect(http.count('POST /api/vehicles')).toBe(0);
  });

  it('creates a vehicle and refreshes the table', async () => {
    let created = false;
    const { http } = renderApp(
      '/admin',
      {
        [LIST]: () => ({
          body: pageOf(created ? [vehicle({ id: 'v-9', make: 'Mazda', model: 'MX-5' })] : []),
        }),
        'POST /api/vehicles': () => {
          created = true;
          return {
            status: 201,
            body: { data: vehicle({ id: 'v-9', make: 'Mazda', model: 'MX-5' }) },
          };
        },
      },
      { role: 'ADMIN' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Make'), 'Mazda');
    await userEvent.type(within(dialog).getByLabelText('Model'), 'MX-5');
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'CONVERTIBLE');
    await userEvent.type(within(dialog).getByLabelText('Price ($)'), '28990');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add vehicle' }));
    expect(await screen.findByRole('button', { name: 'Edit Mazda MX-5' })).toBeInTheDocument();
    expect(http.calls.find((c) => c.method === 'POST' && c.url === '/api/vehicles')!.body).toEqual({
      make: 'Mazda',
      model: 'MX-5',
      category: 'CONVERTIBLE',
      price: '28990',
      quantity: 1,
    });
  });

  it('asks for confirmation before deleting, and Keep it does nothing', async () => {
    const { http } = renderApp(
      '/admin',
      { [LIST]: { body: pageOf([vehicle()]) }, 'DELETE /api/vehicles/v-1': { status: 204 } },
      { role: 'ADMIN' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Toyota Corolla' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete vehicle?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(http.count('DELETE /api/vehicles/v-1')).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Toyota Corolla' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete vehicle' }),
    );
    expect(await screen.findByText(/removed from inventory/)).toBeInTheDocument();
    expect(http.count('DELETE /api/vehicles/v-1')).toBe(1);
  });

  it('restocks with validation and sends the quantity', async () => {
    const { http } = renderApp(
      '/admin',
      {
        [LIST]: { body: pageOf([vehicle({ quantity: 2 })]) },
        'POST /api/vehicles/v-1/restock': { body: { data: vehicle({ quantity: 12 }) } },
      },
      { role: 'ADMIN' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Restock Toyota Corolla' }));
    const dialog = screen.getByRole('dialog', { name: 'Restock' });
    const input = within(dialog).getByLabelText('Units to add');
    await userEvent.clear(input);
    await userEvent.type(input, '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add stock' }));
    expect(await within(dialog).findByText(/whole number from 1 to 1,000/)).toBeInTheDocument();
    expect(http.count('POST /api/vehicles/v-1/restock')).toBe(0);
    await userEvent.clear(input);
    await userEvent.type(input, '10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add stock' }));
    expect(await screen.findByText(/now has 12 in stock/)).toBeInTheDocument();
    expect(http.calls.find((c) => c.url.endsWith('/restock'))!.body).toEqual({ quantity: 10 });
  });

  it('explains a conflicting edit (409) instead of overwriting silently', async () => {
    renderApp(
      '/admin',
      {
        [LIST]: { body: pageOf([vehicle()]) },
        'PUT /api/vehicles/v-1': {
          status: 409,
          body: { error: { code: 'CONFLICT', message: 'x', requestId: 'r' } },
        },
      },
      { role: 'ADMIN' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Toyota Corolla' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this vehicle');
  });
});
