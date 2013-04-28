from string import maketrans

keyspace = "0123456789abcdefghjkmnpqrstvwxyz"
keyspace_len = 32
assert len(keyspace) == keyspace_len

decode_translation = maketrans(
	"OoIiLlABCDEFGHJKMNPQRSTVWXYZ",
	"001111abcdefghjkmnpqrstvwxyz")

def encode(number):
	""" Turn a positive integer into a string. """
	assert number >= 0
	out = ""

	if number == 0:
		out = keyspace[0]
	else:
		while number > 0:
			number, digit = divmod(number, keyspace_len)
			out += keyspace[digit]
	return out[::-1]

def decode(str):
	""" Turn a string into a positive integer."""
	str = str.translate(decode_translation)
	result = 0

	for c in str:
		result = result * keyspace_len + keyspace.index(c)
	return result
