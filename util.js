"use strict"

function dupnum(num) {
	var i, val = new Array(num.length);

	for (i = 0; i < num.length; i++)
		val[i] = num[i];

	while (i --> 0)
		if (val[i] > 0)
			break;

	val.length = i + 1;

	return val;
}

function bytes_to_hex(bytes) {
	var i, val = ""; 
	for (i = 0; i < bytes.length; i++)
		val += ((bytes[i] & 0xff) | 0x100).toString(16).substring(1);
	return val;
}

function num_to_hex(num) {
	var val = "";
	num = dupnum(num);
	while (num.length > 0)
		val = mod_single(num, 0x10).toString(16) + val;
	return val;
}

function hex_to_num(hex) {
	var i, val = new Array();
	for (i = 0; i < hex.length; i++)
		val = muladd_single(val, 0x10, parseInt(hex.charAt(i), 16));
	return val;
}

function bytes_to_num(bytes) {
	var i, val = new Array();
	for (i = 0; i < bytes.length; i++)
		val = muladd_single(val, 0x100, bytes[i]);
	return val;
}

function num_to_words(num, words) {
	var i = 0, phrase = '';

	if (!words)
		words = words_english;

	num = dupnum(num);
	while (num.length > 0)
		phrase = words[mod_single(num, words.length)] + ' ' + phrase;

	return phrase;
}

function sha256_string(str) {
	var hash = new SHA256();
	hash.update(encode_utf8(str));
	return bytes_to_hex(hash.finalize());
}

function hmac_sha256_string(key, msg) {
	var hash = new SHA256();
	return bytes_to_hex(hmac(hash, encode_utf8(key), encode_utf8(msg)));
}

