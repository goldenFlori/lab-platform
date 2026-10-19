// Creates an account, and its organization if it does not exist yet, directly in D1. Meant for the
// first accounts of a new institution; everyone else is added in the app (#11).
//
//   npm run account:create -- --org-slug fshn --org-name "FSHN" --username florjan.mema \
//     --full-name "Florjan Mema" --role admin --remote
//
// Without --remote it writes to the local database (--persist-to picks another local state folder).
// The password is generated and printed once; only its hash is stored. ACCOUNT_PASSWORD sets it
// instead, for tests.

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { uuidv7 } from '../src/api/db/ids.ts';
import { hashPassword } from '../src/shared/password.ts';

const ROLES = ['admin', 'coordinator', 'pedagog', 'assistant', 'student'];
/** No 0/O, 1/l/I: easy to read off a printed slip. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const { values: args } = parseArgs({
  options: {
    'org-slug': { type: 'string' },
    'org-name': { type: 'string' },
    username: { type: 'string' },
    'full-name': { type: 'string' },
    role: { type: 'string', default: 'admin' },
    remote: { type: 'boolean', default: false },
    'persist-to': { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const orgSlug = args['org-slug'] ?? fail('--org-slug is required, for example "fshn"');
const orgName = args['org-name'] ?? fail('--org-name is required, for example "FSHN"');
const username = (args.username ?? fail('--username is required')).toLowerCase();
const fullName = args['full-name'] ?? fail('--full-name is required');
const role = args.role as string;
if (!/^[a-z0-9-]{2,40}$/.test(orgSlug)) fail('--org-slug: lowercase letters, digits and dashes');
if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(username)) fail('--username: letters, digits, dots, dashes');
if (!ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(', ')}`);

function generatePassword(length = 16) {
  const chars: string[] = [];
  while (chars.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      // Drop bytes past the last full multiple of the alphabet, so every character is equally likely.
      if (byte < 256 - (256 % ALPHABET.length) && chars.length < length) chars.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return chars.join('');
}

const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;

const generated = !process.env.ACCOUNT_PASSWORD;
const password = process.env.ACCOUNT_PASSWORD || generatePassword();
const userId = uuidv7();

const statements = [
  `INSERT INTO organizations (id, name, slug) VALUES (${quote(uuidv7())}, ${quote(orgName)}, ${quote(orgSlug)}) ON CONFLICT(slug) DO NOTHING;`,
  `INSERT INTO users (id, username, full_name, password_hash) VALUES (${quote(userId)}, ${quote(username)}, ${quote(fullName)}, ${quote(await hashPassword(password))});`,
  `INSERT INTO memberships (id, org_id, user_id, role) VALUES (${quote(uuidv7())}, (SELECT id FROM organizations WHERE slug = ${quote(orgSlug)}), ${quote(userId)}, ${quote(role)});`,
];

// Sent as one query: D1's import endpoint (what --file uses) refuses wrangler's OAuth login, and a
// three-row insert needs none of its downtime. The statements carry only the password's hash.
const target = args.remote
  ? ['--remote']
  : ['--local', ...(args['persist-to'] ? ['--persist-to', args['persist-to']] : [])];
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--command', statements.join(' '), ...target], {
  stdio: 'inherit',
});

console.log(
  `\n✔ ${fullName} (${username}) is now ${role} of ${orgName}${args.remote ? '' : ' in the local database'}.`,
);
if (generated) {
  console.log(`  Password: ${password}`);
  console.log('  It is shown only this once. Store it in a password manager now.');
}
