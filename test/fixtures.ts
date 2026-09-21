import * as fs from 'fs';
import * as path from 'path';

/** Fixtures live in the sources, not in the compiled output. */
const FIXTURE_DIR = path.join(__dirname, '..', '..', 'test', 'fixtures');

export function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}
