# Bytes

Read & write binary files using js.

> ⚠ The files contained in `examples` and `cli` folders are for example purposes only, the functions may be incomplete.

Of course you can use `DataView` instead of this lib:
```js
const msg = new Uint8Array([...])
const view = new DataView(msg.buffer)
const number = view.getUint32(msg.byteOffset) // big endian
```
