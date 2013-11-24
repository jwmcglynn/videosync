import re

from twisted.internet.protocol import Protocol
from twisted.internet.defer import Deferred
from twisted.internet.ssl import ClientContextFactory

class UrlError(Exception):
	def __init__(self, message):
		self.message = message

class VideoError(Exception):
	def __init__(self, message):
		self.message = message

class VideoInfo:
	def __init__(self, service, url, uid, title, duration, start_time):
		self.service = service
		self.url = url
		self.uid = uid
		self.title = title
		self.duration = duration
		self.start_time = start_time

class WebClientContextFactory(ClientContextFactory):
	def getContext(self, hostname, port):
		return ClientContextFactory.getContext(self)

class ResponseHandler(Protocol):
	def response_callback(self, response):
		self.finished = Deferred()
		self.body = ""
		self.response = response
		response.deliverBody(self)
		return self.finished

	def error_callback(self, error):
		print type(error.value), error
		return VideoError("Unable to find video info.")

	def dataReceived(self, bytes):
		self.body += bytes

	def connectionLost(self, reason):
		self.finished.callback(self.body)
