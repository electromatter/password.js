"use strict"

function Fortuna(seed) {
	var i;

	this.hash = new SHA256();
	this.block_size = this.hash.digest_size;
	this.key = new Array();
	this.counter = new Array(this.block_size);
	this.seeded = false;

	for (i = 0; i < this.counter.length; i++)
		this.counter[i] = 0;

	this.reseed = function (seed) {
		var hash = this.hash;

		if (!seed)
			return;

		hash.update(this.key);
		hash.update(seed);
		this.key = hash.finalize();

		this.seeded = true;
		this.increment_counter();
	}

	this.increment_counter = function () {
		var i = 0, carry = 1;
		for (; i < this.block_size; i++) {
			this.counter[i] += carry;
			carry = this.counter[i] >>> 8;
			this.counter[i] &= 0xff;
		}
	}

	this.random_blocks = function (n) {
		var i, j, off, hash = this.hash;

		if (!this.seeded)
			return undefined;

		if (n === undefined)
			n = 1;

		var blocks = new Array(n * this.block_size);
		for (i = 0, off = 0; i < n; i++, off += this.block_size) {
			copy_to(blocks, off,
				hmac(hash, this.key, this.counter));
		}

		return blocks;
	}

	this.random_bytes = function (n) {
		if (!this.seeded)
			return undefined;

		if (!n || n <= 0)
			return new Array();

		var bytes = this.random_blocks(Math.ceil(n / this.block_size));
		bytes.length = n;
		this.key = this.random_blocks(2);
		return bytes;
	}

	if (seed)
		this.reseed(seed);
}

