#!/usr/bin/env node

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

yargs(hideBin(process.argv))
  .command(require('./commands/create'))
  .command(require('./commands/dev'))
  .command(require('./commands/build'))
  .demandCommand(1, 'Use: momai-sdk <create|dev|build>')
  .strict()
  .help()
  .parse()
