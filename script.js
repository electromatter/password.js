"use strict"

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

	// divide by zero!
	if (div_size == 0)
		return undefined;

	// val < div so quot=0 and rem=val
	if (val_size < div_size)
		return quot;

	// revert to single word division
	if (div_size <= 1) {
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
	var inner = hash.finalize();

	// outer round
	hash.init();
	hash.update(outer_key);
	hash.update(inner);
	return hash.finalize();
}

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

	if (bytes.length % 4)
		return undefined;

	if (!words)
		words = new Array(Math.floor(bytes.length / 4));

	while (j < bytes.length) {
		words[i]  = ((bytes[j++] & 0xff) << 24);
		words[i] |= ((bytes[j++] & 0xff) << 16);
		words[i] |= ((bytes[j++] & 0xff) <<  8);
		words[i] |=  (bytes[j++] & 0xff);
		words[i] >>>= 0;
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

function sha256_expand(words) {
	var i;
	for (i = 16; i < 64; i++) {
		var w15 = words[i - 15],
		    w2  = words[i - 2]
		words[i] = ((words[i - 16] + words[i - 7])
			 + (ror32(w15, 7) ^ ror32(w15, 18) ^ (w15 >>> 3))
			 + (ror32(w2, 17) ^ ror32(w2,  19) ^ (w2 >>> 10))) >>> 0;
	}
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

	sha256_expand(words);

	for (i = 0; i < 64; i++) {
		tmp1 = (h
		     + (ror32(e, 6) ^ ror32(e, 11) ^ ror32(e, 25))
		     + ((e & f) ^ ((~e) & g))
		     + words[i]
		     + sha256_constants[i]) >>> 0;

		tmp2 = ((ror32(a, 2) ^ ror32(a, 13) ^ ror32(a, 22))
			+ ((a & b) ^ (a & c) ^ (b & c))) >>> 0;

		h = g;
		g = f;
		f = e;
		e = (d + tmp1) >>> 0;
		d = c;
		c = b;
		b = a;
		a = (tmp1 + tmp2) >>> 0;
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

		if (this.digest || !bytes)
			return;

		// process bytes blockwise
		while (i < bytes.length) {
			this.bytes[off++] = bytes[i++];
			if (off == 64) {
				off = 0;
				bytes_to_be32(this.bytes, words);
				sha256_compress(this.state, words);
			}
		}

		this.offset = off;
		this.num_bits += bytes.length * 8;
	}

	this.finalize = function () {
		var off = this.offset, words = new Array(64);

		if (this.digest)
			return this.digest;

		// pad with one bit and zeros up to the nearest block
		this.bytes[off++] = 0x80;
		while (off < 64)
			this.bytes[off++] = 0;

		// if we need to, pad some more zeros so we can fit the size
		if (this.offset >= 56) {
			bytes_to_be32(this.bytes, words);
			sha256_compress(this.state, words);

			off = 0;
			while (off < 64)
				this.bytes[off++] = 0;
		}

		bytes_to_be32(this.bytes, words);

		// write out the number of bits
		words[14] = Math.floor(this.num_bits / 4294967296);
		words[15] = this.num_bits >>> 0;

		sha256_compress(this.state, words);

		this.digest = be32_to_bytes(this.state);

		return this.digest;
	}

	this.init();
}

function hex_bytes(digest) {
	var i, val = "";
	for (i = 0; i < digest.length; i++)
		val += ((digest[i] & 0xff) | 0x100).toString(16).substring(1);
	return val;
}

"use strict"

// From the bips-39 wordlist which can also be found at the url:
// https://github.com/bitcoin/bips/blob/ce1862ac6bcffa1dd20aad858380e51e66e949ea/bip-0039/english.txt
var words_english = new Array(
	"abandon",  "ability",  "able",     "about",    "above",    "absent",   "absorb",   "abstract",
	"absurd",   "abuse",    "access",   "accident", "account",  "accuse",   "achieve",  "acid",
	"acoustic", "acquire",  "across",   "act",      "action",   "actor",    "actress",  "actual",
	"adapt",    "add",      "addict",   "address",  "adjust",   "admit",    "adult",    "advance",
	"advice",   "aerobic",  "affair",   "afford",   "afraid",   "again",    "age",      "agent",
	"agree",    "ahead",    "aim",      "air",      "airport",  "aisle",    "alarm",    "album",
	"alcohol",  "alert",    "alien",    "all",      "alley",    "allow",    "almost",   "alone",
	"alpha",    "already",  "also",     "alter",    "always",   "amateur",  "amazing",  "among",
	"amount",   "amused",   "analyst",  "anchor",   "ancient",  "anger",    "angle",    "angry",
	"animal",   "ankle",    "announce", "annual",   "another",  "answer",   "antenna",  "antique",
	"anxiety",  "any",      "apart",    "apology",  "appear",   "apple",    "approve",  "april",
	"arch",     "arctic",   "area",     "arena",    "argue",    "arm",      "armed",    "armor",
	"army",     "around",   "arrange",  "arrest",   "arrive",   "arrow",    "art",      "artefact",
	"artist",   "artwork",  "ask",      "aspect",   "assault",  "asset",    "assist",   "assume",
	"asthma",   "athlete",  "atom",     "attack",   "attend",   "attitude", "attract",  "auction",
	"audit",    "august",   "aunt",     "author",   "auto",     "autumn",   "average",  "avocado",
	"avoid",    "awake",    "aware",    "away",     "awesome",  "awful",    "awkward",  "axis",
	"baby",     "bachelor", "bacon",    "badge",    "bag",      "balance",  "balcony",  "ball",
	"bamboo",   "banana",   "banner",   "bar",      "barely",   "bargain",  "barrel",   "base",
	"basic",    "basket",   "battle",   "beach",    "bean",     "beauty",   "because",  "become",
	"beef",     "before",   "begin",    "behave",   "behind",   "believe",  "below",    "belt",
	"bench",    "benefit",  "best",     "betray",   "better",   "between",  "beyond",   "bicycle",
	"bid",      "bike",     "bind",     "biology",  "bird",     "birth",    "bitter",   "black",
	"blade",    "blame",    "blanket",  "blast",    "bleak",    "bless",    "blind",    "blood",
	"blossom",  "blouse",   "blue",     "blur",     "blush",    "board",    "boat",     "body",
	"boil",     "bomb",     "bone",     "bonus",    "book",     "boost",    "border",   "boring",
	"borrow",   "boss",     "bottom",   "bounce",   "box",      "boy",      "bracket",  "brain",
	"brand",    "brass",    "brave",    "bread",    "breeze",   "brick",    "bridge",   "brief",
	"bright",   "bring",    "brisk",    "broccoli", "broken",   "bronze",   "broom",    "brother",
	"brown",    "brush",    "bubble",   "buddy",    "budget",   "buffalo",  "build",    "bulb",
	"bulk",     "bullet",   "bundle",   "bunker",   "burden",   "burger",   "burst",    "bus",
	"business", "busy",     "butter",   "buyer",    "buzz",     "cabbage",  "cabin",    "cable",
	"cactus",   "cage",     "cake",     "call",     "calm",     "camera",   "camp",     "can",
	"canal",    "cancel",   "candy",    "cannon",   "canoe",    "canvas",   "canyon",   "capable",
	"capital",  "captain",  "car",      "carbon",   "card",     "cargo",    "carpet",   "carry",
	"cart",     "case",     "cash",     "casino",   "castle",   "casual",   "cat",      "catalog",
	"catch",    "category", "cattle",   "caught",   "cause",    "caution",  "cave",     "ceiling",
	"celery",   "cement",   "census",   "century",  "cereal",   "certain",  "chair",    "chalk",
	"champion", "change",   "chaos",    "chapter",  "charge",   "chase",    "chat",     "cheap",
	"check",    "cheese",   "chef",     "cherry",   "chest",    "chicken",  "chief",    "child",
	"chimney",  "choice",   "choose",   "chronic",  "chuckle",  "chunk",    "churn",    "cigar",
	"cinnamon", "circle",   "citizen",  "city",     "civil",    "claim",    "clap",     "clarify",
	"claw",     "clay",     "clean",    "clerk",    "clever",   "click",    "client",   "cliff",
	"climb",    "clinic",   "clip",     "clock",    "clog",     "close",    "cloth",    "cloud",
	"clown",    "club",     "clump",    "cluster",  "clutch",   "coach",    "coast",    "coconut",
	"code",     "coffee",   "coil",     "coin",     "collect",  "color",    "column",   "combine",
	"come",     "comfort",  "comic",    "common",   "company",  "concert",  "conduct",  "confirm",
	"congress", "connect",  "consider", "control",  "convince", "cook",     "cool",     "copper",
	"copy",     "coral",    "core",     "corn",     "correct",  "cost",     "cotton",   "couch",
	"country",  "couple",   "course",   "cousin",   "cover",    "coyote",   "crack",    "cradle",
	"craft",    "cram",     "crane",    "crash",    "crater",   "crawl",    "crazy",    "cream",
	"credit",   "creek",    "crew",     "cricket",  "crime",    "crisp",    "critic",   "crop",
	"cross",    "crouch",   "crowd",    "crucial",  "cruel",    "cruise",   "crumble",  "crunch",
	"crush",    "cry",      "crystal",  "cube",     "culture",  "cup",      "cupboard", "curious",
	"current",  "curtain",  "curve",    "cushion",  "custom",   "cute",     "cycle",    "dad",
	"damage",   "damp",     "dance",    "danger",   "daring",   "dash",     "daughter", "dawn",
	"day",      "deal",     "debate",   "debris",   "decade",   "december", "decide",   "decline",
	"decorate", "decrease", "deer",     "defense",  "define",   "defy",     "degree",   "delay",
	"deliver",  "demand",   "demise",   "denial",   "dentist",  "deny",     "depart",   "depend",
	"deposit",  "depth",    "deputy",   "derive",   "describe", "desert",   "design",   "desk",
	"despair",  "destroy",  "detail",   "detect",   "develop",  "device",   "devote",   "diagram",
	"dial",     "diamond",  "diary",    "dice",     "diesel",   "diet",     "differ",   "digital",
	"dignity",  "dilemma",  "dinner",   "dinosaur", "direct",   "dirt",     "disagree", "discover",
	"disease",  "dish",     "dismiss",  "disorder", "display",  "distance", "divert",   "divide",
	"divorce",  "dizzy",    "doctor",   "document", "dog",      "doll",     "dolphin",  "domain",
	"donate",   "donkey",   "donor",    "door",     "dose",     "double",   "dove",     "draft",
	"dragon",   "drama",    "drastic",  "draw",     "dream",    "dress",    "drift",    "drill",
	"drink",    "drip",     "drive",    "drop",     "drum",     "dry",      "duck",     "dumb",
	"dune",     "during",   "dust",     "dutch",    "duty",     "dwarf",    "dynamic",  "eager",
	"eagle",    "early",    "earn",     "earth",    "easily",   "east",     "easy",     "echo",
	"ecology",  "economy",  "edge",     "edit",     "educate",  "effort",   "egg",      "eight",
	"either",   "elbow",    "elder",    "electric", "elegant",  "element",  "elephant", "elevator",
	"elite",    "else",     "embark",   "embody",   "embrace",  "emerge",   "emotion",  "employ",
	"empower",  "empty",    "enable",   "enact",    "end",      "endless",  "endorse",  "enemy",
	"energy",   "enforce",  "engage",   "engine",   "enhance",  "enjoy",    "enlist",   "enough",
	"enrich",   "enroll",   "ensure",   "enter",    "entire",   "entry",    "envelope", "episode",
	"equal",    "equip",    "era",      "erase",    "erode",    "erosion",  "error",    "erupt",
	"escape",   "essay",    "essence",  "estate",   "eternal",  "ethics",   "evidence", "evil",
	"evoke",    "evolve",   "exact",    "example",  "excess",   "exchange", "excite",   "exclude",
	"excuse",   "execute",  "exercise", "exhaust",  "exhibit",  "exile",    "exist",    "exit",
	"exotic",   "expand",   "expect",   "expire",   "explain",  "expose",   "express",  "extend",
	"extra",    "eye",      "eyebrow",  "fabric",   "face",     "faculty",  "fade",     "faint",
	"faith",    "fall",     "false",    "fame",     "family",   "famous",   "fan",      "fancy",
	"fantasy",  "farm",     "fashion",  "fat",      "fatal",    "father",   "fatigue",  "fault",
	"favorite", "feature",  "february", "federal",  "fee",      "feed",     "feel",     "female",
	"fence",    "festival", "fetch",    "fever",    "few",      "fiber",    "fiction",  "field",
	"figure",   "file",     "film",     "filter",   "final",    "find",     "fine",     "finger",
	"finish",   "fire",     "firm",     "first",    "fiscal",   "fish",     "fit",      "fitness",
	"fix",      "flag",     "flame",    "flash",    "flat",     "flavor",   "flee",     "flight",
	"flip",     "float",    "flock",    "floor",    "flower",   "fluid",    "flush",    "fly",
	"foam",     "focus",    "fog",      "foil",     "fold",     "follow",   "food",     "foot",
	"force",    "forest",   "forget",   "fork",     "fortune",  "forum",    "forward",  "fossil",
	"foster",   "found",    "fox",      "fragile",  "frame",    "frequent", "fresh",    "friend",
	"fringe",   "frog",     "front",    "frost",    "frown",    "frozen",   "fruit",    "fuel",
	"fun",      "funny",    "furnace",  "fury",     "future",   "gadget",   "gain",     "galaxy",
	"gallery",  "game",     "gap",      "garage",   "garbage",  "garden",   "garlic",   "garment",
	"gas",      "gasp",     "gate",     "gather",   "gauge",    "gaze",     "general",  "genius",
	"genre",    "gentle",   "genuine",  "gesture",  "ghost",    "giant",    "gift",     "giggle",
	"ginger",   "giraffe",  "girl",     "give",     "glad",     "glance",   "glare",    "glass",
	"glide",    "glimpse",  "globe",    "gloom",    "glory",    "glove",    "glow",     "glue",
	"goat",     "goddess",  "gold",     "good",     "goose",    "gorilla",  "gospel",   "gossip",
	"govern",   "gown",     "grab",     "grace",    "grain",    "grant",    "grape",    "grass",
	"gravity",  "great",    "green",    "grid",     "grief",    "grit",     "grocery",  "group",
	"grow",     "grunt",    "guard",    "guess",    "guide",    "guilt",    "guitar",   "gun",
	"gym",      "habit",    "hair",     "half",     "hammer",   "hamster",  "hand",     "happy",
	"harbor",   "hard",     "harsh",    "harvest",  "hat",      "have",     "hawk",     "hazard",
	"head",     "health",   "heart",    "heavy",    "hedgehog", "height",   "hello",    "helmet",
	"help",     "hen",      "hero",     "hidden",   "high",     "hill",     "hint",     "hip",
	"hire",     "history",  "hobby",    "hockey",   "hold",     "hole",     "holiday",  "hollow",
	"home",     "honey",    "hood",     "hope",     "horn",     "horror",   "horse",    "hospital",
	"host",     "hotel",    "hour",     "hover",    "hub",      "huge",     "human",    "humble",
	"humor",    "hundred",  "hungry",   "hunt",     "hurdle",   "hurry",    "hurt",     "husband",
	"hybrid",   "ice",      "icon",     "idea",     "identify", "idle",     "ignore",   "ill",
	"illegal",  "illness",  "image",    "imitate",  "immense",  "immune",   "impact",   "impose",
	"improve",  "impulse",  "inch",     "include",  "income",   "increase", "index",    "indicate",
	"indoor",   "industry", "infant",   "inflict",  "inform",   "inhale",   "inherit",  "initial",
	"inject",   "injury",   "inmate",   "inner",    "innocent", "input",    "inquiry",  "insane",
	"insect",   "inside",   "inspire",  "install",  "intact",   "interest", "into",     "invest",
	"invite",   "involve",  "iron",     "island",   "isolate",  "issue",    "item",     "ivory",
	"jacket",   "jaguar",   "jar",      "jazz",     "jealous",  "jeans",    "jelly",    "jewel",
	"job",      "join",     "joke",     "journey",  "joy",      "judge",    "juice",    "jump",
	"jungle",   "junior",   "junk",     "just",     "kangaroo", "keen",     "keep",     "ketchup",
	"key",      "kick",     "kid",      "kidney",   "kind",     "kingdom",  "kiss",     "kit",
	"kitchen",  "kite",     "kitten",   "kiwi",     "knee",     "knife",    "knock",    "know",
	"lab",      "label",    "labor",    "ladder",   "lady",     "lake",     "lamp",     "language",
	"laptop",   "large",    "later",    "latin",    "laugh",    "laundry",  "lava",     "law",
	"lawn",     "lawsuit",  "layer",    "lazy",     "leader",   "leaf",     "learn",    "leave",
	"lecture",  "left",     "leg",      "legal",    "legend",   "leisure",  "lemon",    "lend",
	"length",   "lens",     "leopard",  "lesson",   "letter",   "level",    "liar",     "liberty",
	"library",  "license",  "life",     "lift",     "light",    "like",     "limb",     "limit",
	"link",     "lion",     "liquid",   "list",     "little",   "live",     "lizard",   "load",
	"loan",     "lobster",  "local",    "lock",     "logic",    "lonely",   "long",     "loop",
	"lottery",  "loud",     "lounge",   "love",     "loyal",    "lucky",    "luggage",  "lumber",
	"lunar",    "lunch",    "luxury",   "lyrics",   "machine",  "mad",      "magic",    "magnet",
	"maid",     "mail",     "main",     "major",    "make",     "mammal",   "man",      "manage",
	"mandate",  "mango",    "mansion",  "manual",   "maple",    "marble",   "march",    "margin",
	"marine",   "market",   "marriage", "mask",     "mass",     "master",   "match",    "material",
	"math",     "matrix",   "matter",   "maximum",  "maze",     "meadow",   "mean",     "measure",
	"meat",     "mechanic", "medal",    "media",    "melody",   "melt",     "member",   "memory",
	"mention",  "menu",     "mercy",    "merge",    "merit",    "merry",    "mesh",     "message",
	"metal",    "method",   "middle",   "midnight", "milk",     "million",  "mimic",    "mind",
	"minimum",  "minor",    "minute",   "miracle",  "mirror",   "misery",   "miss",     "mistake",
	"mix",      "mixed",    "mixture",  "mobile",   "model",    "modify",   "mom",      "moment",
	"monitor",  "monkey",   "monster",  "month",    "moon",     "moral",    "more",     "morning",
	"mosquito", "mother",   "motion",   "motor",    "mountain", "mouse",    "move",     "movie",
	"much",     "muffin",   "mule",     "multiply", "muscle",   "museum",   "mushroom", "music",
	"must",     "mutual",   "myself",   "mystery",  "myth",     "naive",    "name",     "napkin",
	"narrow",   "nasty",    "nation",   "nature",   "near",     "neck",     "need",     "negative",
	"neglect",  "neither",  "nephew",   "nerve",    "nest",     "net",      "network",  "neutral",
	"never",    "news",     "next",     "nice",     "night",    "noble",    "noise",    "nominee",
	"noodle",   "normal",   "north",    "nose",     "notable",  "note",     "nothing",  "notice",
	"novel",    "now",      "nuclear",  "number",   "nurse",    "nut",      "oak",      "obey",
	"object",   "oblige",   "obscure",  "observe",  "obtain",   "obvious",  "occur",    "ocean",
	"october",  "odor",     "off",      "offer",    "office",   "often",    "oil",      "okay",
	"old",      "olive",    "olympic",  "omit",     "once",     "one",      "onion",    "online",
	"only",     "open",     "opera",    "opinion",  "oppose",   "option",   "orange",   "orbit",
	"orchard",  "order",    "ordinary", "organ",    "orient",   "original", "orphan",   "ostrich",
	"other",    "outdoor",  "outer",    "output",   "outside",  "oval",     "oven",     "over",
	"own",      "owner",    "oxygen",   "oyster",   "ozone",    "pact",     "paddle",   "page",
	"pair",     "palace",   "palm",     "panda",    "panel",    "panic",    "panther",  "paper",
	"parade",   "parent",   "park",     "parrot",   "party",    "pass",     "patch",    "path",
	"patient",  "patrol",   "pattern",  "pause",    "pave",     "payment",  "peace",    "peanut",
	"pear",     "peasant",  "pelican",  "pen",      "penalty",  "pencil",   "people",   "pepper",
	"perfect",  "permit",   "person",   "pet",      "phone",    "photo",    "phrase",   "physical",
	"piano",    "picnic",   "picture",  "piece",    "pig",      "pigeon",   "pill",     "pilot",
	"pink",     "pioneer",  "pipe",     "pistol",   "pitch",    "pizza",    "place",    "planet",
	"plastic",  "plate",    "play",     "please",   "pledge",   "pluck",    "plug",     "plunge",
	"poem",     "poet",     "point",    "polar",    "pole",     "police",   "pond",     "pony",
	"pool",     "popular",  "portion",  "position", "possible", "post",     "potato",   "pottery",
	"poverty",  "powder",   "power",    "practice", "praise",   "predict",  "prefer",   "prepare",
	"present",  "pretty",   "prevent",  "price",    "pride",    "primary",  "print",    "priority",
	"prison",   "private",  "prize",    "problem",  "process",  "produce",  "profit",   "program",
	"project",  "promote",  "proof",    "property", "prosper",  "protect",  "proud",    "provide",
	"public",   "pudding",  "pull",     "pulp",     "pulse",    "pumpkin",  "punch",    "pupil",
	"puppy",    "purchase", "purity",   "purpose",  "purse",    "push",     "put",      "puzzle",
	"pyramid",  "quality",  "quantum",  "quarter",  "question", "quick",    "quit",     "quiz",
	"quote",    "rabbit",   "raccoon",  "race",     "rack",     "radar",    "radio",    "rail",
	"rain",     "raise",    "rally",    "ramp",     "ranch",    "random",   "range",    "rapid",
	"rare",     "rate",     "rather",   "raven",    "raw",      "razor",    "ready",    "real",
	"reason",   "rebel",    "rebuild",  "recall",   "receive",  "recipe",   "record",   "recycle",
	"reduce",   "reflect",  "reform",   "refuse",   "region",   "regret",   "regular",  "reject",
	"relax",    "release",  "relief",   "rely",     "remain",   "remember", "remind",   "remove",
	"render",   "renew",    "rent",     "reopen",   "repair",   "repeat",   "replace",  "report",
	"require",  "rescue",   "resemble", "resist",   "resource", "response", "result",   "retire",
	"retreat",  "return",   "reunion",  "reveal",   "review",   "reward",   "rhythm",   "rib",
	"ribbon",   "rice",     "rich",     "ride",     "ridge",    "rifle",    "right",    "rigid",
	"ring",     "riot",     "ripple",   "risk",     "ritual",   "rival",    "river",    "road",
	"roast",    "robot",    "robust",   "rocket",   "romance",  "roof",     "rookie",   "room",
	"rose",     "rotate",   "rough",    "round",    "route",    "royal",    "rubber",   "rude",
	"rug",      "rule",     "run",      "runway",   "rural",    "sad",      "saddle",   "sadness",
	"safe",     "sail",     "salad",    "salmon",   "salon",    "salt",     "salute",   "same",
	"sample",   "sand",     "satisfy",  "satoshi",  "sauce",    "sausage",  "save",     "say",
	"scale",    "scan",     "scare",    "scatter",  "scene",    "scheme",   "school",   "science",
	"scissors", "scorpion", "scout",    "scrap",    "screen",   "script",   "scrub",    "sea",
	"search",   "season",   "seat",     "second",   "secret",   "section",  "security", "seed",
	"seek",     "segment",  "select",   "sell",     "seminar",  "senior",   "sense",    "sentence",
	"series",   "service",  "session",  "settle",   "setup",    "seven",    "shadow",   "shaft",
	"shallow",  "share",    "shed",     "shell",    "sheriff",  "shield",   "shift",    "shine",
	"ship",     "shiver",   "shock",    "shoe",     "shoot",    "shop",     "short",    "shoulder",
	"shove",    "shrimp",   "shrug",    "shuffle",  "shy",      "sibling",  "sick",     "side",
	"siege",    "sight",    "sign",     "silent",   "silk",     "silly",    "silver",   "similar",
	"simple",   "since",    "sing",     "siren",    "sister",   "situate",  "six",      "size",
	"skate",    "sketch",   "ski",      "skill",    "skin",     "skirt",    "skull",    "slab",
	"slam",     "sleep",    "slender",  "slice",    "slide",    "slight",   "slim",     "slogan",
	"slot",     "slow",     "slush",    "small",    "smart",    "smile",    "smoke",    "smooth",
	"snack",    "snake",    "snap",     "sniff",    "snow",     "soap",     "soccer",   "social",
	"sock",     "soda",     "soft",     "solar",    "soldier",  "solid",    "solution", "solve",
	"someone",  "song",     "soon",     "sorry",    "sort",     "soul",     "sound",    "soup",
	"source",   "south",    "space",    "spare",    "spatial",  "spawn",    "speak",    "special",
	"speed",    "spell",    "spend",    "sphere",   "spice",    "spider",   "spike",    "spin",
	"spirit",   "split",    "spoil",    "sponsor",  "spoon",    "sport",    "spot",     "spray",
	"spread",   "spring",   "spy",      "square",   "squeeze",  "squirrel", "stable",   "stadium",
	"staff",    "stage",    "stairs",   "stamp",    "stand",    "start",    "state",    "stay",
	"steak",    "steel",    "stem",     "step",     "stereo",   "stick",    "still",    "sting",
	"stock",    "stomach",  "stone",    "stool",    "story",    "stove",    "strategy", "street",
	"strike",   "strong",   "struggle", "student",  "stuff",    "stumble",  "style",    "subject",
	"submit",   "subway",   "success",  "such",     "sudden",   "suffer",   "sugar",    "suggest",
	"suit",     "summer",   "sun",      "sunny",    "sunset",   "super",    "supply",   "supreme",
	"sure",     "surface",  "surge",    "surprise", "surround", "survey",   "suspect",  "sustain",
	"swallow",  "swamp",    "swap",     "swarm",    "swear",    "sweet",    "swift",    "swim",
	"swing",    "switch",   "sword",    "symbol",   "symptom",  "syrup",    "system",   "table",
	"tackle",   "tag",      "tail",     "talent",   "talk",     "tank",     "tape",     "target",
	"task",     "taste",    "tattoo",   "taxi",     "teach",    "team",     "tell",     "ten",
	"tenant",   "tennis",   "tent",     "term",     "test",     "text",     "thank",    "that",
	"theme",    "then",     "theory",   "there",    "they",     "thing",    "this",     "thought",
	"three",    "thrive",   "throw",    "thumb",    "thunder",  "ticket",   "tide",     "tiger",
	"tilt",     "timber",   "time",     "tiny",     "tip",      "tired",    "tissue",   "title",
	"toast",    "tobacco",  "today",    "toddler",  "toe",      "together", "toilet",   "token",
	"tomato",   "tomorrow", "tone",     "tongue",   "tonight",  "tool",     "tooth",    "top",
	"topic",    "topple",   "torch",    "tornado",  "tortoise", "toss",     "total",    "tourist",
	"toward",   "tower",    "town",     "toy",      "track",    "trade",    "traffic",  "tragic",
	"train",    "transfer", "trap",     "trash",    "travel",   "tray",     "treat",    "tree",
	"trend",    "trial",    "tribe",    "trick",    "trigger",  "trim",     "trip",     "trophy",
	"trouble",  "truck",    "true",     "truly",    "trumpet",  "trust",    "truth",    "try",
	"tube",     "tuition",  "tumble",   "tuna",     "tunnel",   "turkey",   "turn",     "turtle",
	"twelve",   "twenty",   "twice",    "twin",     "twist",    "two",      "type",     "typical",
	"ugly",     "umbrella", "unable",   "unaware",  "uncle",    "uncover",  "under",    "undo",
	"unfair",   "unfold",   "unhappy",  "uniform",  "unique",   "unit",     "universe", "unknown",
	"unlock",   "until",    "unusual",  "unveil",   "update",   "upgrade",  "uphold",   "upon",
	"upper",    "upset",    "urban",    "urge",     "usage",    "use",      "used",     "useful",
	"useless",  "usual",    "utility",  "vacant",   "vacuum",   "vague",    "valid",    "valley",
	"valve",    "van",      "vanish",   "vapor",    "various",  "vast",     "vault",    "vehicle",
	"velvet",   "vendor",   "venture",  "venue",    "verb",     "verify",   "version",  "very",
	"vessel",   "veteran",  "viable",   "vibrant",  "vicious",  "victory",  "video",    "view",
	"village",  "vintage",  "violin",   "virtual",  "virus",    "visa",     "visit",    "visual",
	"vital",    "vivid",    "vocal",    "voice",    "void",     "volcano",  "volume",   "vote",
	"voyage",   "wage",     "wagon",    "wait",     "walk",     "wall",     "walnut",   "want",
	"warfare",  "warm",     "warrior",  "wash",     "wasp",     "waste",    "water",    "wave",
	"way",      "wealth",   "weapon",   "wear",     "weasel",   "weather",  "web",      "wedding",
	"weekend",  "weird",    "welcome",  "west",     "wet",      "whale",    "what",     "wheat",
	"wheel",    "when",     "where",    "whip",     "whisper",  "wide",     "width",    "wife",
	"wild",     "will",     "win",      "window",   "wine",     "wing",     "wink",     "winner",
	"winter",   "wire",     "wisdom",   "wise",     "wish",     "witness",  "wolf",     "woman",
	"wonder",   "wood",     "wool",     "word",     "work",     "world",    "worry",    "worth",
	"wrap",     "wreck",    "wrestle",  "wrist",    "write",    "wrong",    "yard",     "year",
	"yellow",   "you",      "young",    "youth",    "zebra",    "zero",     "zone",     "zoo"
	);

"use strict"

function copy_to(dest, off, src) {
	var i;

	if (!src)
		return;

	for (i = 0; i < src.length; i++)
		dest[off + i] = src[i];

	return dest;
}

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

"use strict"

// A list of the greatest prime less than a power of 2048 (in hexidecimal)
var primes = new Array(
	// 2048**1 - 9
	"7f7",
	// 2048**2 - 3
	"3ffffd",
	// 2048**3 - 9
	"1fffffff7",
	// 2048**4 - 17
	"fffffffffef",
	// 2048**5 - 55
	"7fffffffffffc9",
	// 2048**6 - 5
	"3fffffffffffffffb",
	// 2048**7 - 33
	"1fffffffffffffffffdf",
	// 2048**8 - 299
	"fffffffffffffffffffed5",
	// 2048**9 - 115
	"7ffffffffffffffffffffff8d",
	// 2048**10 - 21
	"3fffffffffffffffffffffffffeb",
	// 2048**11 - 73
	"1ffffffffffffffffffffffffffffb7",
	// 2048**12 - 347
	"ffffffffffffffffffffffffffffffea5",
	// 2048**13 - 69
	"7fffffffffffffffffffffffffffffffffbb",
	// 2048**14 - 243
	"3ffffffffffffffffffffffffffffffffffff0d",
	// 2048**15 - 25
	"1fffffffffffffffffffffffffffffffffffffffe7",
	// 2048**16 - 233
	"ffffffffffffffffffffffffffffffffffffffffff17",
	// 2048**17 - 85
	"7ffffffffffffffffffffffffffffffffffffffffffffab",
	// 2048**18 - 17
	"3fffffffffffffffffffffffffffffffffffffffffffffffef",
	// 2048**19 - 33
	"1ffffffffffffffffffffffffffffffffffffffffffffffffffdf",
	// 2048**20 - 77
	"fffffffffffffffffffffffffffffffffffffffffffffffffffffb3",
	// 2048**21 - 165
	"7fffffffffffffffffffffffffffffffffffffffffffffffffffffff5b",
	// 2048**22 - 63
	"3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc1",
	// 2048**23 - 273
	"1ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeef",
	// 2048**24 - 275
	"fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeed",
	// 2048**25 - 129
	"7ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
	// 2048**26 - 165
	"3fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff5b",
	// 2048**27 - 123
	"1ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff85"
	);

for (var i = 0; i < primes.length; i++)
	primes[i] = hex_to_num(primes[i]);

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
    phrase_outbox = document.getElementById('out_phrase'),
    entropy_outbox = document.getElementById('entropy'),
    random_outbox = document.getElementById('random_phrase');

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

var csrng = new Fortuna(), mouse = new MouseEntropy();

function add_point(x, y) {
	var val = mouse.add_point(x, y);
	if (false)
		console.log(val);
	var entropy = mouse.source.entropy;
	if (csrng.seeded)
		entropy = '';
	entropy_outbox.value = entropy;
}

function random_phrase(size) {
	var prime = pick_prime(size),
	    num_bytes = Math.ceil(prime.length * bits / 8);

	var entropy_threshold = 4096;

	// we have to wait for the entropy measure to converge
	// and we want to wait until we have sufficent entropy
	// to generate our random phrase
	if (!csrng.seeded && mouse.source.entropy < entropy_threshold)
		return;

	// reseed whenever possible
	// it can't hurt our entropy.
	csrng.reseed(mouse.finalize());
	entropy_outbox.value = '';
	mouse.init();

	var bytes = csrng.random_bytes(num_bytes);
	var num = bytes_to_num(bytes);

	div_multi(num, prime);

	return num_to_words(num);
}

function update_random_phrase() {
	var phrase = random_phrase(6);

	if (phrase === undefined)
		phrase = '**** NEEDS MORE ENTROPY ****';

	random_outbox.value = phrase;
}

