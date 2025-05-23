import * as examples from '../examples/index.js'

const name = process.argv[2]
const argv = process.argv.slice(3)
if (examples[name]) {
  examples[name].cli(argv, { name })
} else {
  console.log(`
usage: bytes MODULE ARGS...

modules:
  ${Object.keys(examples).join(' ')}

type 'bytes <module name>' for more info
`)
}