import re

from twisted.internet.protocol import Protocol
from twisted.internet.defer import Deferred
from twisted.internet.ssl import ClientContextFactory

class UrlError(Exception):
	def __init__(self, message):
		self.message = message

	def __str__(self):
		return self.message

class VideoError(Exception):
	def __init__(self, message, nested_exception=None):
		self.message = message
		self.nested_exception = nested_exception

	def __str__(self):
		if self.nested_exception is None:
			return self.message
		else:
			return "%s, nested exception %s: %s" % (self.message, self.nested_exception.__class__.__name__, self.nested_exception)


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
		return VideoError("Unable to find video info.", error)

	def dataReceived(self, bytes):
		self.body += bytes

	def connectionLost(self, reason):
		self.finished.callback(self.body)
