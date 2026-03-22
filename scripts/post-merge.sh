#!/bin/bash
set -e

# Install dependencies
pnpm install --frozen-lockfile=false

# Push any schema changes to the database
npm run db:push
