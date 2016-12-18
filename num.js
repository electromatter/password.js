"use strict"

// bits per word must be less than half of what the machine
// is able to represent so carries are preformed correctly
// this is 20 bits so 20**3 = 60 < 64 (if jit compiled)
// and 20**2 < 53 (double precision)
var bits = 20, base = 1 << bits;

function size_multi(val) {
	var i = val.length;

	// try to find the index of the highest non-zero word
	while (i --> 0)
		if (val[i] > 0)
			break;

	// size = index of highest non-zero + 1
	return i + 1;
}

// used to convert numbers to strings
// ensures: val = quot * div + rem
function mod_single(
		    /*inout*/ val, /*<- val/div*/
		       /*in*/ div
		   ) /* -> val%div */ {
	var rem, tmp, i;

	if (div <= 0 || div >= base)
		return undefined;

	rem = 0;
	for (i = val.length; i --> 0; ) {
		// compute a word of the divisor
		tmp = (rem * base + val[i]);
		val[i] = Math.floor(tmp / div);
		rem = tmp % div;
	}

	// truncate trailing zeros
	val.length = size_multi(val);

	// return result
	return rem;
}

// used to convert from strings to numbers
// ensures: multi * factor + delta = val
function muladd_single(
		       /*inout*/ multi, /*<- multi*factor+delta*/
		          /*in*/ factor,
			  /*in*/ delta
		      ) /* -> multi*factor+delta */
{
	var carry, i, val, tmp;

	if (factor < 0 || delta < 0 || factor >= base || delta >= base)
		return undefined;

	// multiply multi and single
	carry = delta;
	for (i = 0; i < multi.length; i++) {
		tmp = multi[i] * factor + carry;
		carry = Math.floor(tmp / base);
		multi[i] = tmp % base;
	}

	// spill over carry
	if (carry > 0)
		multi[i] = carry;

	return multi;
}

// computes one step of algorithim d
// guess must be either correct or one greater than quot
// precondition off + div_size = rem.length
function div_multi_try(
		       /*in*/	guess,
		       /*in*/	off,
		       /*in*/	div,
		       /*in*/	div_size,
		    /*inout*/	rem
                      ) /* -> quot */
{
	var i, j, carry, tmp;

	// guess is zero, so remainder is unchanged.
	if (guess == 0)
		return guess;

	// preform an iteration of long division
	carry = 0;
	for (i = 0, j = off; i < div_size; i++, j++) {
		tmp = div[i] * guess + carry;
		carry = Math.floor(tmp / base);
		rem[j] -= tmp % base;

		while (rem[j] < 0) {
			rem[j] += base;
			carry += 1;
		}
	}

	// spill over carry
	rem[j] -= carry;

	// our guess was correct, our reaminder is positive
	if (rem[j] >= 0)
		return guess;

	// otherwise, our guess was one too large,
	// so add one back
	carry = 0;
	for (i = 0, j = off; i < div_size; i++, j++) {
		rem[j] = rem[i] + div[i] + carry;
		carry = Math.floor(rem[i] / base);
		rem[i] %= base;
	}

	return guess - 1;
}

// used to compute hmac % prime
// ensures: val = quot * div + rem
function div_multi(/*inout*/ val /*<- val%div*/,
		      /*in*/ div
		  ) /* -> val/div */
{
	// find highest non-zero word in div
	var i, j,
	    val_size = size_multi(val),
	    div_size = size_multi(div),
	    quot = new Array();

	// val < div so quot=0 and rem=val
	if (val_size < div_size)
		return quot;

	// revert to single word division
	if (div_size <= 0) {
		var rem = mod_single(val, div[0]);

		// output quot
		for (i = 0; i < val.length; i++)
			quot[i] = val[i];

		// output rem
		val[0] = rem;
		val.length = rem > 0 ? 1 : 0;

		return quot;
	}

	// word oriented long division
	var quot_size = val_size - div_size + 1,
	    div_top = div[div_size - 1] * base + div[div_size - 2],
	    val_top, guess;
	val[val_size] = 0;

	for (i = quot_size - 1, j = val_size - 1; i >= 0; i--, j--) {
		// 0 <= val_top < div[div_size - 1] * base
		// 0 <= guess < base
		val_top = val[j + 1] * base + val[j];
		guess = Math.floor((val_top * base) / div_top);

		// compute quot from guess
		quot[i] = div_multi_try(guess, i, div, div_size, val);
	}

	// truncate
	quot.length = size_multi(quot);
	val.length = size_multi(val);

	return quot;
}

