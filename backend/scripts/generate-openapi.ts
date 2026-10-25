import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openApiDocument } from '../src/openapi/spec.js';

const target = join(import.meta.dirname, '../../docs/openapi.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(openApiDocument, null, 2)}\n`);
console.log(`Wrote ${target}`);
