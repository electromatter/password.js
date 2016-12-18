"use strict"

var sha256_initial = new Array(
	0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	);

var sha256_constants = new Array(
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	);

function ror32(x, shift) {
	return (x << (32 - shift)) | (x >>> shift);
}

function bytes_to_be32(bytes, words) {
	var i = 0, j = 0;

	if (block.length % 4)
		return undefined;

	if (!words)
		words = new Array(Math.floor(block / 4));

	while (j < block.length) {
		words[i]  = (bytes[j++] << 24);
		words[i] |= (bytes[j++] << 16);
		words[i] |= (bytes[j++] <<  8);
		words[i] |=  bytes[j++];
		i++;
	}

	return words;
}

function be32_to_bytes(words, bytes) {
	var i = 0, j = 0;

	if (!bytes)
		bytes = new Array(words.length * 4);

	while (i < words.length) {
		bytes[j++] = (words[i] >>> 24) & 0xff;
		bytes[j++] = (words[i] >>> 16) & 0xff;
		bytes[j++] = (words[i] >>> 8 ) & 0xff;
		bytes[j++] = (words[i])        & 0xff;
		i++;
	}

	return bytes;
}

function sha256_get_word(words, i) {
	if (i >= 16)  {
		var w15 = words[i - 15],
		    w2  = words[i - 2]
		words[i] = ((words[i - 16] + s0 + words[i-7] + s1)
			 + (ror32(w15, 7) ^ ror(w15, 18) ^ ror32(w15, 3))
			 + (ror32(w2, 17) ^ ror(w2,  19) ^ ror32(w2, 10))) >>> 0;
	}
	return words[i];
}

function sha256_compress(hash, words) {
	var i, tmp1, tmp2;

	var a = hash[0],
	    b = hash[1],
	    c = hash[2],
	    d = hash[3],
	    e = hash[4],
	    f = hash[5],
	    g = hash[6],
	    h = hash[7];

	for (i = 0; i < 64; i++) {
		tmp1 = (h
		     + (ror32(e, 6) ^ ror32(e, 11) ^ ror32(e, 25))
		     + ((e & f) ^ (~e & g))
		     + sha256_get_word(words, i)
		     + sha256_constants[i]) >>> 0;

		tmp2 = ((ror32(a, 2) ^ ror32(a, 13) ^ ror32(a, 22))
			+ ((a & b) ^ (a & c) ^ (b & c))) >>> 0;

		h = g;
	       	g = f;
	       	f = e;
	       	e = (d + temp1) >>> 0;
		d = c;
		c = b;
		b = a;
		a = (temp1 + temp2) >>> 0;
	}

	hash[0] = (hash[0] + a) >>> 0;
	hash[1] = (hash[1] + b) >>> 0;
	hash[2] = (hash[2] + c) >>> 0;
	hash[3] = (hash[3] + d) >>> 0;
	hash[4] = (hash[4] + e) >>> 0;
	hash[5] = (hash[5] + f) >>> 0;
	hash[6] = (hash[6] + g) >>> 0;
	hash[7] = (hash[7] + h) >>> 0;
}

function SHA256() {
	this.block_size = 64;
	this.digest_size = 32;

	this.num_bits = 0;
	this.offset = 0;
	this.state = new Array(8);
	this.bytes = new Array(this.block_size);
	this.digest = null;

	this.init = function () {
		var i;
		this.num_bits = 0;
		this.offset = 0;
		this.digest = null;
		for (i = 0; i < sha256_initial.length; i++)
			this.state[i] = sha256_initial[i];
	}

	this.update = function (bytes) {
		var i = 0, off = this.offset, words = new Array(64);

		if (this.digest)
			return;

		// process bytes blockwise
		while (i < bytes.length) {
			this.bytes[off++] = bytes[i++];
			if (off == 64) {
				off = 0;
				bytes_to_be32(bytes, words);
				sha256_compress(this.hash, words);
			}
		}

		this.offset = off;
		this.num_bits += bytes.length * 8;
	}

	this.finalize = function () {
		var off = this.offset;

		if (this.digest)
			return this.digest;

		// pad with one bit and zeros up to the nearest block
		this.bytes[off++] = 0x80;
		while (off < 64)
			this.bytes[off++] = 0;

		// if we need to, pad some more zeros so we can fit the size
		if (this.offset > 55) {
			bytes_to_be32(bytes, words);
			sha256_compress(this.hash, words);

			off = 0;
			while (off < 64)
				this.bytes[off++] = 0;
		}

		bytes_to_be32(bytes, words);

		// write out the number of bits
		words[62] = Math.floor(this.num_bits / 4294967296);
		words[63] = this.num_bits >>> 0;

		sha256_compress(this.hash, words);

		this.digest = be32_to_bytes(this.hash);

		return this.digest;
	}

	this.init();
}

function hex_bytes(digest) {
	var i, val = '';
	for (i = 0; i < digest.length; i++)
		val += ((digest[i] & 0xff) | 0x100).toString(16).substring(1);
	return val;
}

