function encode_utf8_codepoint(dest, off, val) {
	if (val < 0x80) {
		dest[off++] = val;
		return off;
	} else if (val < 0x800) {
		dest[off++] = 0xc0 | ((val >>  6) & 0x1f);
		dest[off++] = 0x80 |  (val        & 0x3f);
		return off;
	} else if (val < 0x10000) {
		dest[off++] = 0xe0 | ((val >> 12) & 0x0f);
		dest[off++] = 0x80 | ((val >>  6) & 0x3f);
		dest[off++] = 0x80 |  (val        & 0x3f);
		return off;
	} else if (val < 0x200000) {
		dest[off++] = 0xf0 | ((val >> 18) & 0x07);
		dest[off++] = 0x80 | ((val >> 12) & 0x3f);
		dest[off++] = 0x80 | ((val >>  6) & 0x3f);
		dest[off++] = 0x80 |  (val        & 0x3f);
		return off;
	} else if (val < 0x4000000) {
		dest[off++] = 0xf8 | ((val >> 24) & 0x03);
		dest[off++] = 0x80 | ((val >> 18) & 0x3f);
		dest[off++] = 0x80 | ((val >> 12) & 0x3f);
		dest[off++] = 0x80 | ((val >>  6) & 0x3f);
		dest[off++] = 0x80 |  (val       & 0x3f);
		return off;
	} else if (val < 0x80000000) {
		dest[off++] = 0xfc | ((val >> 30) & 0x01);
		dest[off++] = 0x80 | ((val >> 24) & 0x3f);
		dest[off++] = 0x80 | ((val >> 18) & 0x3f);
		dest[off++] = 0x80 | ((val >> 12) & 0x3f);
		dest[off++] = 0x80 | ((val >>  6) & 0x3f);
		dest[off++] = 0x80 |  (val       & 0x3f);
		return off;
	} else {
		return undefined;
	}
}

function encode_utf8(val) {
	var i, off, dest;
	off = 0;
	dest = new Array(val.length * 3);
	for (i = 0; i < val.length; i++)
		off = encode_utf8_codepoint(dest, off, val.charCodeAt(i));
	dest.length = off;
	return dest;
}

