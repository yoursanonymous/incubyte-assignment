export const Roles = { CUSTOMER: 'CUSTOMER', ADMIN: 'ADMIN' } as const;
export type RoleName = (typeof Roles)[keyof typeof Roles];
