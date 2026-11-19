import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcWorker = path.join(rootDir, 'node_modules/@zama-fhe/sdk/dist/esm/encrypt.worker.js');
const destDir = path.join(rootDir, 'apps/client/public');
const destWorker = path.join(destDir, 'encrypt.worker.js');

if (fs.existsSync(srcWorker)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcWorker, destWorker);
  console.log('Copied FHE encrypt.worker.js to apps/client/public/encrypt.worker.js');
} else {
  console.warn('Warning: @zama-fhe/sdk encrypt.worker.js not found at', srcWorker);
}
