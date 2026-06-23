// Minimal pure-Node ZIP writer (deflate-compressed, store fallback for binary).
// No external dependencies — uses only node:fs, node:zlib, node:path, node:string_decoder.
// Produces a valid ZIP64-friendly archive that any standard ZIP tool can read.
//
// Format reference: APPNOTE.TXT (PKWARE) — local file header, central
// directory header, and end-of-central-directory record.
//
// Usage:
//   const out = createZip(path)
//   addFileToZip(out, 'foo.txt', 'hello')
//   addFileToZip(out, 'sub/bar.json', JSON.stringify(obj))
//   await finalizeZip(out)

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const UTF8_FLAG = 0x0800

function dosTime(date = new Date()) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() / 2) & 0x1f)
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f)
  return { time, day }
}

function encodeName(name) {
  const norm = name.replace(/\\/g, '/')
  return { nameBuf: Buffer.from(norm, 'utf8'), flag: UTF8_FLAG }
}

function crc32(buf) {
  let c
  if (!crc32._table) {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
      table[n] = c >>> 0
    }
    crc32._table = table
  }
  c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (crc32._table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0
  }
  return (c ^ 0xffffffff) >>> 0
}

function buildLocalHeader(fileNameBuf, flag, dataBuf, crc, td, dd, method, extra) {
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0) // local file header signature
  header.writeUInt16LE(20, 4) // version needed
  header.writeUInt16LE(flag, 6)
  header.writeUInt16LE(method, 8) // 0=store, 8=deflate
  header.writeUInt16LE(td, 10)
  header.writeUInt16LE(dd, 12)
  header.writeUInt32LE(crc, 14)
  header.writeUInt32LE(dataBuf.length, 18) // compressed size
  header.writeUInt32LE(extra?.compressedSize ?? dataBuf.length, 18) // overwritten below
  header.writeUInt32LE(extra?.uncompressedSize ?? 0, 22) // uncompressed
  header.writeUInt16LE(fileNameBuf.length, 26)
  header.writeUInt16LE(extra?.extraField?.length ?? 0, 28)
  // Overwrite compressed/uncompressed with potentially-zip64 values
  if (extra && extra.compressedSize > 0xffffffff) {
    header.writeUInt32LE(0xffffffff, 18)
  }
  if (extra && extra.uncompressedSize > 0xffffffff) {
    header.writeUInt32LE(0xffffffff, 22)
  }
  return Buffer.concat([header, fileNameBuf, extra?.extraField || Buffer.alloc(0)])
}

function buildZip64Extra(uncompressedSize, compressedSize, localHeaderOffset) {
  // Tag 0x0001, size 28 (or 24 if no offset)
  const hasOffset = localHeaderOffset !== undefined
  const size = hasOffset ? 28 : 16
  const buf = Buffer.alloc(4 + size)
  buf.writeUInt16LE(0x0001, 0)
  buf.writeUInt16LE(size, 2)
  buf.writeBigUInt64LE(BigInt(uncompressedSize), 4)
  buf.writeBigUInt64LE(BigInt(compressedSize), 12)
  if (hasOffset) {
    buf.writeBigUInt64LE(BigInt(localHeaderOffset), 20)
  }
  return buf
}

function buildCentralEntry(
  fileNameBuf,
  flag,
  td,
  dd,
  crc,
  compressedSize,
  uncompressedSize,
  localHeaderOffset,
  method
) {
  const needZip64 =
    compressedSize > 0xffffffff ||
    uncompressedSize > 0xffffffff ||
    localHeaderOffset > 0xffffffff
  const extraBuf = needZip64
    ? buildZip64Extra(uncompressedSize, compressedSize, localHeaderOffset)
    : Buffer.alloc(0)

  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0) // central file header signature
  entry.writeUInt16LE(20, 4) // version made by
  entry.writeUInt16LE(20, 6) // version needed
  entry.writeUInt16LE(flag, 8)
  entry.writeUInt16LE(method, 10)
  entry.writeUInt16LE(td, 12)
  entry.writeUInt16LE(dd, 14)
  entry.writeUInt32LE(crc, 16)
  entry.writeUInt32LE(needZip64 ? 0xffffffff : compressedSize, 20)
  entry.writeUInt32LE(needZip64 ? 0xffffffff : uncompressedSize, 24)
  entry.writeUInt16LE(fileNameBuf.length, 28)
  entry.writeUInt16LE(extraBuf.length, 30)
  entry.writeUInt16LE(0, 32) // comment length
  entry.writeUInt16LE(0, 34) // disk number
  entry.writeUInt16LE(0, 36) // internal attrs
  entry.writeUInt32LE(0, 38) // external attrs
  entry.writeUInt32LE(needZip64 ? 0xffffffff : localHeaderOffset, 42)
  return Buffer.concat([entry, fileNameBuf, extraBuf])
}

function buildEndOfCentralDirectory(entries, cdSize, cdOffset) {
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with central dir
  eocd.writeUInt16LE(entries.length, 8) // entries on this disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  const needZip64 = cdSize > 0xffffffff || cdOffset > 0xffffffff
  eocd.writeUInt32LE(needZip64 ? 0xffffffff : cdSize, 12)
  eocd.writeUInt32LE(needZip64 ? 0xffffffff : cdOffset, 16)
  eocd.writeUInt16LE(0, 20) // comment length
  return eocd
}

function buildZip64EndOfCentralDirectory(entries, cdSize, cdOffset) {
  // Zip64 end-of-central-directory record (56 bytes) + Zip64 end-of-central-dir locator (20 bytes)
  const eocd64 = Buffer.alloc(56)
  eocd64.writeUInt32LE(0x06064b50, 0)
  eocd64.writeBigUInt64LE(BigInt(44), 4) // size of zip64 EOCD record (excluding the 12 bytes already written)
  eocd64.writeUInt16LE(20, 12) // version made by
  eocd64.writeUInt16LE(20, 14) // version needed
  eocd64.writeUInt32LE(0, 16) // disk number
  eocd64.writeUInt32LE(0, 20) // disk with central dir
  eocd64.writeBigUInt64LE(BigInt(entries.length), 24) // entries on this disk
  eocd64.writeBigUInt64LE(BigInt(entries.length), 32) // total entries
  eocd64.writeBigUInt64LE(BigInt(cdSize), 40)
  eocd64.writeBigUInt64LE(BigInt(cdOffset), 48)

  const locator = Buffer.alloc(20)
  locator.writeUInt32LE(0x07064b50, 0)
  locator.writeUInt32LE(0, 4) // disk with zip64 EOCD
  const eocd64Offset = cdOffset + cdSize
  locator.writeBigUInt64LE(BigInt(eocd64Offset), 8)
  locator.writeUInt32LE(1, 16) // total disks

  return Buffer.concat([eocd64, locator])
}

function createZip(zipPath) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true })
  const fd = fs.openSync(zipPath, 'w')
  return {
    fd,
    zipPath,
    writtenBytes: 0,
    centralEntries: [],
    cdBuf: Buffer.alloc(0)
  }
}

function _writeToZip(state, chunk) {
  const written = fs.writeSync(state.fd, chunk, 0, chunk.length, state.writtenBytes)
  state.writtenBytes += written
}

function addFileToZip(state, fileName, content) {
  if (state.fd === null) {
    throw new Error('zip already finalized')
  }
  const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
  const crc = crc32(dataBuf)

  // Try deflate; if output is larger than input (rare for tiny files), use store.
  let method = 8
  let compressed = zlib.deflateRawSync(dataBuf, { level: 9 })
  if (compressed.length >= dataBuf.length) {
    method = 0
    compressed = dataBuf
  }

  const { time, day } = dosTime()
  const { nameBuf, flag } = encodeName(fileName)

  const localHeaderOffset = state.writtenBytes
  const localHeader = buildLocalHeader(nameBuf, flag, compressed, crc, time, day, method, {
    compressedSize: compressed.length,
    uncompressedSize: dataBuf.length,
    extraField: null
  })
  _writeToZip(state, localHeader)
  _writeToZip(state, compressed)

  state.centralEntries.push({
    nameBuf,
    flag,
    td: time,
    dd: day,
    crc,
    compressedSize: compressed.length,
    uncompressedSize: dataBuf.length,
    localHeaderOffset,
    method
  })
}

function _appendCd(state, chunk) {
  state.cdBuf = Buffer.concat([state.cdBuf, chunk])
}

function finalizeZip(state) {
  if (state.fd === null) {
    return Promise.resolve()
  }
  const cdOffset = state.writtenBytes
  for (const entry of state.centralEntries) {
    const cdEntry = buildCentralEntry(
      entry.nameBuf,
      entry.flag,
      entry.td,
      entry.dd,
      entry.crc,
      entry.compressedSize,
      entry.uncompressedSize,
      entry.localHeaderOffset,
      entry.method
    )
    _appendCd(state, cdEntry)
  }
  _writeToZip(state, state.cdBuf)
  const cdSize = state.cdBuf.length

  const needZip64 = cdSize > 0xffffffff || cdOffset > 0xffffffff
  if (needZip64) {
    _writeToZip(state, buildZip64EndOfCentralDirectory(state.centralEntries, cdSize, cdOffset))
  }
  _writeToZip(state, buildEndOfCentralDirectory(state.centralEntries, cdSize, cdOffset))

  const fd = state.fd
  state.fd = null
  return new Promise((resolve, reject) => {
    fs.close(fd, (err) => (err ? reject(err) : resolve()))
  })
}

async function createZipFromFiles(zipPath, files) {
  const state = createZip(zipPath)
  for (const [name, content] of Object.entries(files)) {
    addFileToZip(state, name, content)
  }
  await finalizeZip(state)
}

module.exports = {
  createZip,
  addFileToZip,
  finalizeZip,
  createZipFromFiles
}
