import ConfigParser
import json
import urlparse
import re

from apiclient.discovery import build
from twisted.internet import reactor
from twisted.web.client import Agent
from twisted.web.http_headers import Headers
from isodate import parse_duration, ISO8601Error

from services.common import WebClientContextFactory, ResponseHandler, VideoInfo, UrlError, VideoError

YOUTUBE_VIDEOID = re.compile("^[a-z0-9_-]*$", re.IGNORECASE)

config = ConfigParser.ConfigParser()
config.read("videosync.cfg")

__api_key = config.get("Youtube", "api_key")
__youtube = build("youtube", "v3", developerKey=__api_key)
__agent = Agent(reactor, WebClientContextFactory())

class YoutubeResponseHandler(ResponseHandler):
	def __init__(self, video_info):
		self.video_info = video_info

	def connectionLost(self, reason):
		try:
			response = json.loads(self.body)
			video_data = response["items"][0]

			if not video_data["status"]["embeddable"]:
				self.finished.errback(VideoError("Cannot add that video, embedding is disabled."))
			elif video_data["status"]["privacyStatus"] == "private":
				self.finished.errback(VideoError("Cannot add that video, it is private."))
			elif "regionRestriction" in video_data["contentDetails"]:
				self.finished.errback(VideoError("Cannot add that video, it has regional restrictions."))
			else:
				self.video_info.title = video_data["snippet"]["title"]
				self.video_info.duration = parse_duration(video_data["contentDetails"]["duration"]).seconds

				self.finished.callback(self.video_info)
		except (ValueError, KeyError, IndexError):
			self.finished.errback(VideoError("Unable to find youtube video info."))

def resolve(parts):
	start_time_str = None

	if parts["path"] == "/watch":
		fragment = urlparse.parse_qs(parts["fragment"])

		if not "v" in parts["query"]:
			raise UrlError("Unable to find videoID.")

		if "t" in fragment:
			start_time_str = fragment["t"][0]

		video_id = parts["query"]["v"][0]
	elif parts["hostname"] == "youtu.be":
		# First character of path is /
		video_id = parts["path"][1:]

		if video_id == "":
			raise UrlError("Unable to find videoID.")

		if "t" in parts["query"]:
			start_time_str = parts["query"]["t"][0]

	if not YOUTUBE_VIDEOID.match(video_id):
		raise UrlError("Unable to find valid videoID.")

	query = "v=" + video_id
	fragment = ""
	if start_time_str:
		try:
			start_time = parse_duration("PT" + start_time_str.upper()).seconds
			fragment = "t=" + start_time_str
		except ISO8601Error:
			start_time = 0
	else:
		start_time = 0

	request = __youtube.videos().list(id=video_id, part="snippet,contentDetails,status")
	headers = convert_headers(request.headers)
	d = __agent.request(
		"GET"
		, request.uri.encode('latin-1')
		, headers
		, None)

	url = urlparse.urlunparse(("http", "youtube.com", "/watch", "", query, fragment))
	video_info = VideoInfo(u"youtube", url, video_id, None, None, start_time)

	handler = YoutubeResponseHandler(video_info)
	d.addCallbacks(handler.response_callback, handler.error_callback)

	return d

def convert_headers(headers):
	new_headers = {}
	for k in headers.keys():
		if k == "accept-encoding":
			new_headers[k] = headers[k].split(', ')
		else:
			new_headers[k] = [headers[k]]
	return Headers(new_headers)
