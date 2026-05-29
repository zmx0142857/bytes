import Bytes from '../lib/bytes.js'

const { hex } = Bytes.types

/**
 * @example
 * ```
 * $ echo 'e4bda0e5a5bd68656c6c6f' | bytes hex -d
 * 你好hello
 * ```
 */
const Hex = {
  async cli (argv, { read, write }) {
    const isDecode = argv.includes('-d')
    argv = argv.filter(v => v[0] !== '-')
    if (isDecode) {
      const input = await read(argv[0], 'utf-8')
      const output = hex.toBytes(input)
      await write(argv[1], output)
    } else {
      const input = await read(argv[0])
      const output = hex.fromBytes(input) + '\n'
      await write(argv[1], output, 'utf-8')
    }
    process.exit()
  }
}

export default Hex
