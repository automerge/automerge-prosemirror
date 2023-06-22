#! /usr/bin/env bash
yarn prettier
yarn lint
yarn tsc
yarn cypress run --component
