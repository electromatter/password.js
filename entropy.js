"use strict"

function le32_to_bytes(val) {
	return new Array( val         & 0xff,
			 (val >>>  8) & 0xff,
			 (val >>> 16) & 0xff,
			 (val >>> 24)  & 0xff);
}

function EntropySource(num_buckets) {
	if (!num_buckets || num_buckets <= 0)
		num_buckets = 251;

	this.hash = new SHA256();

	this.num_buckets = num_buckets;
	this.bucket = new Array(num_buckets);

	this.entropy = 0;
	this.count = 0;
	this.current_count = 0;

	var i;
	for (i = 0; i < this.num_buckets; i++)
		this.bucket[i] = 0;

	this.init = function () {
		this.hash.init();
		this.entropy = 0;
		this.current_count = 0;
	}

	this.update = function (val) {
		if (this.hash.digest || isNaN(val))
			return;

		val = (val >>> 0) % this.num_buckets;
		this.bucket[val] += 1;
		this.hash.update(le32_to_bytes(val));
		this.count += 1;
		this.current_count += 1;
		this.recompute_entropy();
		return val;
	}

	this.recompute_entropy = function () {
		var i, entropy = 0, p, count;

		count = this.count;
		for (i = 0; i < this.num_buckets; i++) {
			p = this.bucket[i] / count;
			if (p > 0)
				entropy += -p * Math.log(p);
		}

		this.entropy = this.current_count * entropy;
	}

	this.finalize = function () {
		return this.hash.finalize();
	}

	this.init();
}

function MouseEntropy() {
	this.source = new EntropySource();
	this.last_x = 0;
	this.last_y = 0;

	this.init = function () {
		this.source.init();
		this.last_x = 0;
		this.last_y = 0;
	}

	this.add_point = function (x, y) {
		var dx = x - this.last_x, dy = y - this.last_y;
		if (isNaN(x) || isNaN(y))
			return;
		this.last_x = x;
		this.last_y = y;
		return this.source.update(
					10 * Math.sqrt(dx * dx + dy * dy));
	}

	this.finalize = function () {
		return this.source.finalize();
	}

	this.init();
}

