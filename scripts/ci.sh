#! /usr/bin/env bash
npm run prettier
npm run lint
npx tsc --noEmit
npx cypress run --component
