import ConfigParser
import json

from apiclient.discovery import build
from twisted.internet import reactor
from twisted.web.client import Agent
from twisted.web.http_headers import Headers
from isodate import parse_duration

from services.common import WebClientContextFactory, ResponseHandler, VideoError

config = ConfigParser.ConfigParser()
config.read("videosync.cfg")

__api_key = config.get("Youtube", "api_key")
__youtube = build("youtube", "v3", developerKey=__api_key)
__agent = Agent(reactor, WebClientContextFactory())

class YoutubeResponseHandler(ResponseHandler):
	def __init__(self, video_info):
		self.video_info = video_info

	def connectionLost(self, reason):
		response = json.loads(self.body)

		if len(response["items"]):
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
		else:
			self.finished.errback(VideoError("Unable to find youtube video info."))

def resolve(video_info, response_callback, error_callback):
	request = __youtube.videos().list(id=video_info.uid, part="snippet,contentDetails,status")

	headers = convert_headers(request.headers)

	d = __agent.request(
		"GET"
		, request.uri.encode('latin-1')
		, headers
		, None)

	handler = YoutubeResponseHandler(video_info)
	d.addCallbacks(handler.response_callback, handler.error_callback)
	d.addCallbacks(response_callback, error_callback)

def handle_error(failure):
	print type(failure.value), failure

def convert_headers(headers):
	new_headers = {}
	for k in headers.keys():
		if k == "accept-encoding":
			new_headers[k] = headers[k].split(', ')
		else:
			new_headers[k] = [headers[k]]
	return Headers(new_headers)