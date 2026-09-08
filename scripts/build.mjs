import { cpSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
mkdirSync('dist', { recursive: true });
for (const file of ['styles.module.css', 'styles.module.css.d.ts']) cpSync(`src/${file}`, `dist/${file}`);
