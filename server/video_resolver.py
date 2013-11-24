import urlparse

from services.common import UrlError
from services.youtube import resolve as youtube_resolve
from services.vimeo import resolve as vimeo_resolve

YOUTUBE_HOSTNAMES = ( "youtu.be", "youtube.com" )
VIMEO_HOSTNAMES = ( "vimeo.com" )

def resolve(url):
	parts = urlparse.urlparse(url)

	if parts.scheme == "":
		parts = urlparse.urlparse("http://" + url)

	if not parts.scheme in ( "", "http", "https" ):
		raise UrlError("Invalid Url Scheme.")

	hostname = parts.hostname
	query = urlparse.parse_qs(parts.query)

	if not hostname:
		raise UrlError("Unable to find hostname.")

	# Discard the www. from the url
	if hostname[:4] == "www.":
		hostname = hostname[4:]

	parts_dict = {
		"hostname": hostname
		, "path": parts.path
		, "query": query
		, "fragment": parts.fragment
	}

	if hostname in YOUTUBE_HOSTNAMES:
		return youtube_resolve(parts_dict)
	elif hostname in VIMEO_HOSTNAMES:
		return vimeo_resolve(parts_dict)
	else:
		raise UrlError("That site is not supported.")
