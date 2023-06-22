#! /usr/bin/env bash
yarn lint
yarn tsc
yarn cypress run --component
