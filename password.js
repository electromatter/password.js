"use strict"

var key_inbox = document.getElementById('master'),
    name_inbox = document.getElementById('name'),
    length_outbox = document.getElementById('length'),
    length_slider = document.getElementById('length_slider'),
    hash_outbox = document.getElementById('out_sha'),
    hmac_outbox = document.getElementById('out_hmac'),
    prime_outbox = document.getElementById('out_prime'),
    residue_outbox = document.getElementById('out_residue'),
    amazon_outbox = document.getElementById('out_amazon'),
    phrase_outbox = document.getElementById('out_phrase');

function update_prime() {
	var size = parseInt(length_slider.value);

	if (typeof size !== 'number')
		return;

	if (size < 1 || size > 24)
		return;

	pass_size = size;
	length_outbox.value = size;
}

var pass_size;
update_prime();

function pick_prime(size) {
	size = Math.floor(size);
	if (isNaN(size) || size <= 0)
		size = 4;
	if (size > 24)
		size = 24;
	return primes[size - 1];
}

function gen_phrase(key, name, size, debug) {
	var hash, num, prime, hmac_bytes;

	hash = new SHA256();
	hmac_bytes = hmac(hash, encode_utf8(key), encode_utf8(name));
	num = bytes_to_num(hmac_bytes);
	prime = pick_prime(size);
	div_multi(num, prime);

	if (debug) {
		prime_outbox.value = num_to_hex(prime);
		residue_outbox.value = num_to_hex(num);
	}

	return num_to_words(num);
}

function show_debug() {
	hash_outbox.value = sha256_string(key_inbox.value);
	hmac_outbox.value = hmac_sha256_string(key_inbox.value, name_inbox.value);
	gen_phrase(key_inbox.value, name_inbox.value, pass_size, true);
}

function update_passwords() {
	show_debug();
	amazon_outbox.value = gen_phrase(key_inbox.value, 'amazon', pass_size);
	phrase_outbox.value = gen_phrase(key_inbox.value, name_inbox.value, pass_size);
}

