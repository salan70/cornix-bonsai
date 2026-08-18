#!/usr/bin/env python3
"""RMK製UF2からVial keyboard definition (xz圧縮JSON) を取り出す使い捨てスクリプト。

usage: python3 extract-definition.py cornix-left.uf2 > vial-definition.json
"""

import lzma
import re
import struct
import sys

UF2_MAGIC0 = 0x0A324655
UF2_MAGIC1 = 0x9E5D5157
XZ_MAGIC = b"\xfd7zXZ"


def uf2_to_bin(data):
    blocks = {}
    for i in range(0, len(data), 512):
        blk = data[i : i + 512]
        if len(blk) < 512:
            break
        magic0, magic1 = struct.unpack("<II", blk[0:8])
        if magic0 != UF2_MAGIC0 or magic1 != UF2_MAGIC1:
            continue
        _flags, addr, size, _bno, _ntot, _fam = struct.unpack("<IIIIII", blk[8:32])
        blocks[addr] = blk[32 : 32 + size]
    base = min(blocks)
    end = max(addr + len(payload) for addr, payload in blocks.items())
    image = bytearray(b"\xff" * (end - base))
    for addr, payload in blocks.items():
        image[addr - base : addr - base + len(payload)] = payload
    return bytes(image)


def find_definition(image):
    for match in re.finditer(re.escape(XZ_MAGIC), image):
        try:
            out = lzma.LZMADecompressor().decompress(image[match.start() :])
        except lzma.LZMAError:
            continue
        if b'"matrix"' in out:
            return out
    return None


def main():
    image = uf2_to_bin(open(sys.argv[1], "rb").read())
    definition = find_definition(image)
    if definition is None:
        sys.exit("keyboard definition が見つからない")
    sys.stdout.buffer.write(definition)


if __name__ == "__main__":
    main()
