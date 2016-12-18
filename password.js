"use strict"

var hash = new SHA256();

hash.init();
hash.update(encode_utf8('potato'));

alert(hex_bytes(hash.finalize()));

