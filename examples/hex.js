import fs from 'fs'
import Bytes from '../lib/bytes.js'

const { hex } = Bytes.types

const Hex = {
  async cli (argv, { name }) {
    if (name === 'bin' && argv[0] && argv[1]) {
      const str = await fs.promises.readFile(argv[0], 'utf-8')
      const bytes = hex.toBytes(str)
      return fs.promises.writeFile(argv[1], bytes)
    } else if (name === 'hex' && argv[0] && argv[1]) {
      const bytes = await fs.promises.readFile(argv[0])
      const str = hex.fromBytes(bytes)
      return fs.promises.writeFile(argv[1], str, 'utf-8')
    } else {
      console.log(`
usage: bytes COMMAND FIN FOUT

command:
  hex  bytes to hex
  bin  hex to bytes

example:
  hex: 636d 7074
  bin: cmpt
`)
    }
  }
}

export default Hex