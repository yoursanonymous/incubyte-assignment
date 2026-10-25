/** OpenAPI 3.0 description of the API. Kept next to the code and checked by tests/integration/openapi.test.ts. */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const err = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});
const json = (schema: object) => ({ 'application/json': { schema } });
const bearer = [{ bearerAuth: [] }];
const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const ok401 = { 401: err('Missing, invalid or expired access token') };
const adminOnly = { ...ok401, 403: err('Authenticated but not an administrator') };
const validation = { 400: err('Invalid input (VALIDATION_ERROR)') };

const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'pageSize',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 12 },
  },
];
const vehicleFilters = [
  ...pageParams,
  {
    name: 'sort',
    in: 'query',
    schema: {
      type: 'string',
      enum: ['make', 'model', 'price', 'quantity', 'createdAt'],
      default: 'make',
    },
  },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
  {
    name: 'make',
    in: 'query',
    description: 'Case-insensitive partial match',
    schema: { type: 'string', maxLength: 60 },
  },
  {
    name: 'model',
    in: 'query',
    description: 'Case-insensitive partial match',
    schema: { type: 'string', maxLength: 60 },
  },
  { name: 'category', in: 'query', schema: ref('Category') },
  {
    name: 'minPrice',
    in: 'query',
    description: 'Inclusive, decimal with up to 2 places',
    schema: { type: 'string', example: '10000.00' },
  },
  {
    name: 'maxPrice',
    in: 'query',
    description: 'Inclusive, decimal with up to 2 places',
    schema: { type: 'string', example: '35000.00' },
  },
  { name: 'inStock', in: 'query', schema: { type: 'boolean' } },
];
const vehicleList = {
  200: {
    description: 'A page of vehicles',
    content: json({
      type: 'object',
      properties: { data: { type: 'array', items: ref('Vehicle') }, pagination: ref('Pagination') },
    }),
  },
  ...validation,
  ...ok401,
};
const sessionResponse = (description: string, status: number) => ({
  [status]: {
    description: `${description}. Sets an HttpOnly refresh_token cookie (SameSite=Strict, Path=/api/auth).`,
    content: json(ref('Session')),
  },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Car Dealership Inventory API',
    version: '1.0.0',
    description:
      'Customers browse, search and purchase vehicles. Administrators manage the catalogue and stock. ' +
      'Money is an exact decimal string (never a float). Errors use one envelope: {error:{code,message,details,requestId}}.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access token (15 min).',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'requestId'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'UNAUTHENTICATED',
                  'FORBIDDEN',
                  'NOT_FOUND',
                  'CONFLICT',
                  'EMAIL_TAKEN',
                  'INSUFFICIENT_STOCK',
                  'IDEMPOTENCY_KEY_REUSED',
                  'RATE_LIMITED',
                  'PAYLOAD_TOO_LARGE',
                  'SERVICE_UNAVAILABLE',
                  'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
              details: { nullable: true },
              requestId: { type: 'string' },
            },
          },
        },
      },
      Category: {
        type: 'string',
        enum: ['SEDAN', 'SUV', 'TRUCK', 'COUPE', 'HATCHBACK', 'CONVERTIBLE', 'VAN', 'WAGON'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['CUSTOMER', 'ADMIN'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Session: {
        type: 'object',
        properties: {
          user: ref('User'),
          accessToken: { type: 'string' },
          expiresIn: { type: 'integer', example: 900 },
        },
      },
      Credentials: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: {
            type: 'string',
            minLength: 10,
            maxLength: 128,
            description:
              'Login accepts any non-empty password up to 128 characters; registration requires 10+.',
          },
        },
      },
      Vehicle: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          make: { type: 'string' },
          model: { type: 'string' },
          category: ref('Category'),
          price: { type: 'string', example: '24999.99', description: 'Exact decimal string' },
          quantity: { type: 'integer', minimum: 0, maximum: 100000 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      VehicleCreate: {
        type: 'object',
        additionalProperties: false,
        required: ['make', 'model', 'category', 'price'],
        properties: {
          make: { type: 'string', minLength: 1, maxLength: 60 },
          model: { type: 'string', minLength: 1, maxLength: 60 },
          category: ref('Category'),
          price: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
            description: 'Decimal, 0.01–10000000.00, at most 2 decimals',
            example: '24999.99',
          },
          quantity: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
        },
      },
      VehicleUpdate: {
        type: 'object',
        additionalProperties: false,
        required: ['make', 'model', 'category', 'price'],
        description:
          'Replaces the editable catalogue fields. Stock cannot be changed here; use purchase/restock.',
        properties: {
          make: { type: 'string' },
          model: { type: 'string' },
          category: ref('Category'),
          price: { oneOf: [{ type: 'string' }, { type: 'number' }] },
          expectedUpdatedAt: {
            type: 'string',
            format: 'date-time',
            description:
              'Optimistic concurrency: 409 CONFLICT if the vehicle changed since this timestamp.',
          },
        },
      },
      Purchase: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          vehicleId: { type: 'string', format: 'uuid' },
          quantity: { type: 'integer' },
          unitPrice: { type: 'string', description: 'Price captured at purchase time' },
          total: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          remainingStock: { type: 'integer', description: 'Only in the purchase response' },
          vehicle: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              make: { type: 'string' },
              model: { type: 'string' },
            },
          },
          customer: {
            type: 'object',
            description: 'Admin listing only',
            properties: { id: { type: 'string' }, email: { type: 'string' } },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        summary: 'Register a customer account (role is always CUSTOMER)',
        tags: ['Auth'],
        requestBody: { required: true, content: json(ref('Credentials')) },
        responses: {
          ...sessionResponse('Account created', 201),
          ...validation,
          409: err('Email already registered (EMAIL_TAKEN)'),
          429: err('Rate limited'),
        },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Log in',
        tags: ['Auth'],
        requestBody: { required: true, content: json(ref('Credentials')) },
        responses: {
          ...sessionResponse('Authenticated', 200),
          ...validation,
          401: err('Invalid email or password'),
          429: err('Rate limited'),
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        summary: 'Rotate the refresh cookie and obtain a new access token',
        tags: ['Auth'],
        description:
          'Uses the refresh_token cookie. Reusing a rotated token revokes the whole session family. Origin must be allowlisted.',
        responses: {
          ...sessionResponse('New session', 200),
          401: err('Missing, expired, used or revoked refresh token'),
          403: err('Origin not allowed'),
          429: err('Rate limited'),
        },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Revoke the session and clear the cookie',
        tags: ['Auth'],
        responses: { 204: { description: 'Logged out' }, 403: err('Origin not allowed') },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Current user',
        tags: ['Auth'],
        security: bearer,
        responses: {
          200: {
            description: 'User',
            content: json({ type: 'object', properties: { user: ref('User') } }),
          },
          ...ok401,
        },
      },
    },

    '/api/vehicles': {
      get: {
        summary: 'List vehicles (paginated, sortable, filterable)',
        tags: ['Vehicles'],
        security: bearer,
        parameters: vehicleFilters,
        responses: vehicleList,
      },
      post: {
        summary: 'Create a vehicle (admin)',
        tags: ['Vehicles'],
        security: bearer,
        requestBody: { required: true, content: json(ref('VehicleCreate')) },
        responses: {
          201: {
            description: 'Created',
            content: json({ type: 'object', properties: { data: ref('Vehicle') } }),
          },
          ...validation,
          ...adminOnly,
        },
      },
    },
    '/api/vehicles/search': {
      get: {
        summary: 'Search by make, model, category and price range',
        tags: ['Vehicles'],
        security: bearer,
        parameters: vehicleFilters,
        responses: vehicleList,
      },
    },
    '/api/vehicles/{id}': {
      get: {
        summary: 'Get one vehicle',
        tags: ['Vehicles'],
        security: bearer,
        parameters: [idParam],
        responses: {
          200: {
            description: 'Vehicle',
            content: json({ type: 'object', properties: { data: ref('Vehicle') } }),
          },
          ...validation,
          ...ok401,
          404: err('Not found or archived'),
        },
      },
      put: {
        summary: 'Update catalogue details (admin)',
        tags: ['Vehicles'],
        security: bearer,
        parameters: [idParam],
        requestBody: { required: true, content: json(ref('VehicleUpdate')) },
        responses: {
          200: {
            description: 'Updated',
            content: json({ type: 'object', properties: { data: ref('Vehicle') } }),
          },
          ...validation,
          ...adminOnly,
          404: err('Not found'),
          409: err('Edited by someone else (CONFLICT)'),
        },
      },
      delete: {
        summary: 'Archive (soft delete) a vehicle (admin)',
        tags: ['Vehicles'],
        security: bearer,
        parameters: [idParam],
        responses: {
          204: { description: 'Archived' },
          ...validation,
          ...adminOnly,
          404: err('Not found'),
        },
      },
    },
    '/api/vehicles/{id}/purchase': {
      post: {
        summary: 'Purchase units of a vehicle',
        tags: ['Inventory'],
        security: bearer,
        description:
          'Atomic: decrements stock only if enough remains, records the purchase at the current price. Send Idempotency-Key to make retries safe.',
        parameters: [
          idParam,
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,128}$' },
          },
        ],
        requestBody: {
          required: false,
          content: json({
            type: 'object',
            additionalProperties: false,
            properties: { quantity: { type: 'integer', minimum: 1, maximum: 10, default: 1 } },
          }),
        },
        responses: {
          201: {
            description:
              'Purchased (also returned for an idempotent replay, with header Idempotent-Replayed: true)',
            content: json({ type: 'object', properties: { data: ref('Purchase') } }),
          },
          ...validation,
          ...ok401,
          404: err('Vehicle not found'),
          409: err('INSUFFICIENT_STOCK'),
          422: err('IDEMPOTENCY_KEY_REUSED with a different request'),
        },
      },
    },
    '/api/vehicles/{id}/restock': {
      post: {
        summary: 'Increase stock (admin)',
        tags: ['Inventory'],
        security: bearer,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            additionalProperties: false,
            required: ['quantity'],
            properties: { quantity: { type: 'integer', minimum: 1, maximum: 1000 } },
          }),
        },
        responses: {
          200: {
            description: 'Restocked',
            content: json({ type: 'object', properties: { data: ref('Vehicle') } }),
          },
          ...validation,
          ...adminOnly,
          404: err('Not found'),
          409: err('Would exceed the maximum stock of 100000'),
        },
      },
    },
    '/api/purchases/mine': {
      get: {
        summary: "The caller's purchase history",
        tags: ['Purchases'],
        security: bearer,
        parameters: pageParams,
        responses: {
          200: {
            description: 'Page',
            content: json({
              type: 'object',
              properties: {
                data: { type: 'array', items: ref('Purchase') },
                pagination: ref('Pagination'),
              },
            }),
          },
          ...validation,
          ...ok401,
        },
      },
    },
    '/api/purchases': {
      get: {
        summary: 'All purchases (admin)',
        tags: ['Purchases'],
        security: bearer,
        parameters: pageParams,
        responses: {
          200: {
            description: 'Page',
            content: json({
              type: 'object',
              properties: {
                data: { type: 'array', items: ref('Purchase') },
                pagination: ref('Pagination'),
              },
            }),
          },
          ...validation,
          ...adminOnly,
        },
      },
    },
    '/health/live': {
      get: {
        summary: 'Liveness: the process is running',
        tags: ['Operations'],
        responses: { 200: { description: 'ok' } },
      },
    },
    '/health/ready': {
      get: {
        summary: 'Readiness: the database is reachable',
        tags: ['Operations'],
        responses: { 200: { description: 'ok' }, 503: { description: 'unavailable' } },
      },
    },
  },
} as const;
