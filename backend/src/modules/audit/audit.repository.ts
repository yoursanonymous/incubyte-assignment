import type { Prisma } from '../../generated/prisma/client.js';
import type { TxClient } from '../../infrastructure/db.js';

export type AuditAction =
  | 'VEHICLE_CREATED'
  | 'VEHICLE_UPDATED'
  | 'VEHICLE_ARCHIVED'
  | 'VEHICLE_RESTOCKED'
  | 'VEHICLE_PURCHASED';

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: 'vehicle';
  targetId: string;
  /** Safe context only: field names and numeric deltas. Never credentials or tokens. */
  metadata?: Prisma.InputJsonObject;
}

/**
 * Append-only audit trail. Callers pass the *transaction* client so the event commits or rolls
 * back together with the change it describes.
 */
export function createAuditRepository(client: TxClient) {
  return {
    record: (entry: AuditEntry) =>
      client.auditEvent.create({
        data: { ...entry, metadata: entry.metadata ?? {} },
      }),
  };
}
