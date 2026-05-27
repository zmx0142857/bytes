import fs from 'fs'
import * as examples from '../examples/index.js'

const read = async (path, encoding) => {
  if (path) {
    return fs.promises.readFile(path, encoding)
  } else {
    return new Promise(resolve => {
      const { stdin } = process
      if (encoding) stdin.setEncoding(encoding)
      stdin.once('data', data => resolve(data))
    })
  }
}

const write = async (path, data, encoding) => {
  if (path) {
    return fs.promises.writeFile(path, data, encoding)
  } else {
    return new Promise(resolve => process.stdout.write(data, resolve))
  }
}

const name = process.argv[2]
const argv = process.argv.slice(3)
if (examples[name]) {
  examples[name].cli(argv, { name, read, write })
} else {
  console.log(`
usage: bytes MODULE ARGS...

modules:
  ${Object.keys(examples).join(' ')}

type 'bytes <module name>' for more info
`)
}