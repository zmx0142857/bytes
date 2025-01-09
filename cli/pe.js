import { promises as fs } from 'fs'
import Pe from '../examples/pe.js'

const main = async () => {
  const { argv } = process
  if (argv[2] === 'info') {
    const bytes = await fs.readFile(argv[3])
    console.log(Pe.info(bytes))
  } else {
    console.log(`
usage: node pe.js COMMAND PATH

command:
  info    show PE info
`)
  }
}

main()