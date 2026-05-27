import Bytes from '../lib/bytes.js'

const { hex } = Bytes.types

/**
 * @example
 * ```
 * $ echo 'e4bda0e5a5bd68656c6c6f' | bytes bin
 * 你好hello
 * ```
 */
const Hex = {
  async cli (argv, { name, read, write }) {
    if (name === 'bin') {
      const str = await read(argv[0], 'utf-8')
      const bytes = hex.toBytes(str)
      await write(argv[1], bytes)
    } else if (name === 'hex') {
      const bytes = await read(argv[0])
      const str = hex.fromBytes(bytes)
      await write(argv[1], str, 'utf-8')
    }
    process.exit()
  }
}

export default Hex
