#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { startDatabases, _Users } = require('../utils/database');

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[name] = value;
  }
  return args;
};

const required = ['firstName', 'lastName', 'phone', 'email', 'password', 'companyId'];

const args = parseArgs(process.argv.slice(2));
const missing = required.filter((field) => !args[field]);

if (missing.length) {
  console.error('Missing required fields:', missing.join(', '));
  console.error('Usage: node scripts/createUser.js --firstName Alice --lastName Doe --phone +391234567890 --email alice@example.com --password secret --companyId 65f... ');
  console.error('Optional: --role 1 --status 0 --privilege 2 --allowedVehicleTags tagA,tagB');
  process.exit(1);
}

const role = Number.isFinite(Number(args.role)) ? Number(args.role) : 1;
const status = Number.isFinite(Number(args.status)) ? Number(args.status) : 0;
const privilege = Number.isFinite(Number(args.privilege)) ? Number(args.privilege) : 2;
const allowedVehicleTags = typeof args.allowedVehicleTags === 'string' && args.allowedVehicleTags.trim()
  ? args.allowedVehicleTags.split(',').map((tag) => tag.trim()).filter(Boolean)
  : [];

(async () => {
  await startDatabases();

  const user = await _Users.new(
    args.firstName,
    args.lastName,
    args.phone,
    args.email,
    args.password,
    args.companyId,
    role,
    status,
    privilege,
    allowedVehicleTags
  );

  console.log('User created with id:', user._id?.toString?.() || user.id);
  console.log('Email:', user.email);
  console.log('Privilege:', user.privilege);
  process.exit(0);
})().catch((err) => {
  console.error('Error creating user:', err);
  process.exit(1);
});
