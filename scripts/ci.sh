#! /usr/bin/env bash
npm run prettier
npm run lint
npx tsc --noEmit
npm run mocha
npx cypress run --component
