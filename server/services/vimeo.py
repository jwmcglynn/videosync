import json
import urlparse
import re

from twisted.internet import reactor
from twisted.web.client import Agent
from twisted.web.http_headers import Headers

from services.common import ResponseHandler, VideoInfo, UrlError, VideoError

VIMEO_VIDEOID = re.compile("^[0-9]*$")

__agent = Agent(reactor)

class VimeoResponseHandler(ResponseHandler):
	def connectionLost(self, reason):
		# Note: vimeo sends a couple of rate-limiting information headers.
		# use self.response.headers to check
		#	x-ratelimit-remaining: # of remaining calls
		#	x-ratelimit-limit: Total # of calls allowed
		#	x-ratelimit-reset: Unix timestamp when the ratelimit will be reset
		try:
			response = json.loads(self.body)
			video_data = response[0]

			if not True:
				pass
			else:
				url = video_data["url"]
				uid = video_data["id"]
				title = video_data["title"]
				duration = video_data["duration"]

				video_info = VideoInfo(u"vimeo", url, uid, title, duration, 0)

				self.finished.callback(video_info)
		except (ValueError, KeyError):
			self.finished.errback(VideoError("Unable to find vimeo video info."))

def resolve(parts):
	path_parts = parts["path"][1:].split("/")

	if len(path_parts):
		video_id = path_parts[len(path_parts) - 1]
	else:
		raise UrlError("Unable to find videoID.")

	if not VIMEO_VIDEOID.match(video_id):
		raise UrlError("Unable to find valid videoID.")

	d = __agent.request("GET", "http://vimeo.com/api/v2/video/{0}.json".format(video_id), None, None)

	handler = VimeoResponseHandler()
	d.addCallbacks(handler.response_callback, handler.error_callback)

	return d
