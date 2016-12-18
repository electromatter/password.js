"use strict"

function hmac(hash, key, data) {
	var inner_key = new Array(),
	    outer_key = new Array(),
	    i;

	if (key.length > hash.block_size) {
		hash.init();
		hash.update(key);
		key = hash.finalize();
	}

	// initialize keys
	for (i = 0; i < key.length; i++) {
		inner_key[i] = 0x36 ^ key[i];
		outer_key[i] = 0x5c ^ key[i];
	}

	for ( ; i < hash.block_size; i++) {
		inner_key[i] = 0x36;
		outer_key[i] = 0x5c;
	}

	// inner round
	hash.init();
	hash.update(inner_key);
	hash.update(data);
	inner = hash.finalize();

	// outer round
	hash.init();
	hash.update(outer_key);
	hash.update(inner);
	return hash.finalize();
}

