import urlparse

from isodate import parse_duration
from isodate.isoerror import ISO8601Error

from services.common import UrlError, VideoInfo
from services.youtube import resolve as youtube_resolve

YOUTUBE_HOSTNAMES = ( "youtu.be", "youtube.com" )

def resolve(url):
	parts = urlparse.urlparse(url)

	hostname = parts.hostname
	path = parts.path
	query = urlparse.parse_qs(parts.query)
	fragment = parts.fragment

	if not parts.scheme in ( "", "http", "https" ):
		raise UrlError("Invalid Url Scheme.")

	if not hostname:
		raise UrlError("Unable to find hostname.")

	# Discard the www. from the url
	if hostname[:4] == "www.":
		hostname = hostname[4:]

	# Youtube url processing
	if hostname in YOUTUBE_HOSTNAMES:
		start_time_str = None

		if path == "/watch":
			fragment_parts = urlparse.parse_qs(fragment)

			if not "v" in query:
				raise UrlError("Unable to find videoID.")

			if "t" in fragment_parts:
				start_time_str = fragment_parts["t"][0]

			videoID = query["v"][0]
		elif hostname == "youtu.be":
			# First character of path is /
			videoID = path[1:] # TODO - Validate this to make sure its a valid videoID

			if videoID == "":
				raise UrlError("Unable to find videoID.")

			if "t" in query:
				start_time_str = query["t"][0]

		query = "v=" + videoID
		fragment = ""
		if start_time_str:
			try:
				start_time = parse_duration("PT" + start_time_str.upper()).seconds
				fragment = "t=" + start_time_str
			except ISO8601Error:
				start_time = 0
		else:
			start_time = 0

		url = urlparse.urlunparse(( "http", "youtube.com", "/watch", "", query, fragment ))

		video_info = VideoInfo(u"youtube", url, videoID, None, None, start_time)

		d = youtube_resolve(video_info)

		return d
	else:
		raise UrlError("Unsupported site.")
