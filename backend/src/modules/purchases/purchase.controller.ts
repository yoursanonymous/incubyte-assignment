import type { RequestHandler } from 'express';
import { getValidated } from '../../middleware/validate.js';
import { parseIdempotencyKey, type ListPurchasesQuery } from './purchase.schemas.js';
import type { PurchaseService } from './purchase.service.js';

export function createPurchaseController(service: PurchaseService) {
  const purchase: RequestHandler = async (req, res) => {
    const { params, body } = getValidated<{ id: string }, unknown, { quantity: number }>(res);
    const key = parseIdempotencyKey(req.headers['idempotency-key']);
    const result = await service.purchase(req.auth!.userId, params.id, body.quantity, key);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  };

  const restock: RequestHandler = async (req, res) => {
    const { params, body } = getValidated<{ id: string }, unknown, { quantity: number }>(res);
    res.json({ data: await service.restock(req.auth!.userId, params.id, body.quantity) });
  };

  const listMine: RequestHandler = async (req, res) => {
    const { query } = getValidated<unknown, ListPurchasesQuery>(res);
    res.json(await service.listForUser(req.auth!.userId, query.page, query.pageSize));
  };

  const listAll: RequestHandler = async (_req, res) => {
    const { query } = getValidated<unknown, ListPurchasesQuery>(res);
    res.json(await service.listAll(query.page, query.pageSize));
  };

  return { purchase, restock, listMine, listAll };
}
