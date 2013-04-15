import sys, argparse, json
from twisted.internet import reactor
from twisted.python import log
from twisted.web.server import Site
from twisted.web.static import File

from autobahn.websocket import WebSocketServerFactory, WebSocketServerProtocol, listenWS

class VideoSyncServerProtocol(WebSocketServerProtocol):
	def onConnect(self, connectionRequest):
		return None # Return the accepted protocol from list of WebSockets (sub)protocols provided by client or None to speak no specific one or when the client list was empty.
		
		# Throw a HttpException to refuse the connection ( might want to use this for a ip ban later )
		# throw HttpException(httpstatus.HTTP_STATUS_CODE_UNAUTHORIZED[0], "You are not authorized for this!")
	
	def onOpen(self):
		self.factory.register(self)
	
	def onMessage(self, message, binary):
		if not binary:
			self.factory.onMessage(self, message)
	
	def connectionLost(self, reason):
		WebSocketServerProtocol.connectionLost(self, reason)
		self.factory.unregister(self)
	
	def sendJsonMessage(self, object):
		message = json.dumps(object, separators=(',',':'))
		self.sendMessage(message)

class VideoSyncServerFactory(WebSocketServerFactory):
	def __init__(self, url, debug = False, debugCodePaths = False):
		WebSocketServerFactory.__init__(self, url, debug = debug, debugCodePaths = debugCodePaths)
		
		# Define class variables
		self.clients = []
		self.controllingClient = None
		self.currentVideo = None
		self.videoState = 0
		self.position = 0
	
	def register(self, client):
		if not client in self.clients:
			print "registered client " + client.peerstr
			self.clients.append(client)
			
			# Send current state for newly connected client
			initialState = { "command": "initialState", "video": self.currentVideo, "videoState": self.videoState, "position": self.position }
			client.sendJsonMessage(initialState)
	
	def unregister(self, client):
		if client in self.clients:
			print "unregistered client " + client.peerstr
			self.clients.remove(client)
			
			if self.controllingClient == client:
				# TODO - Automatically give someone else control?
				self.controllingClient = None
	
	def broadcast(self, message):
		print "broadcasting message '%s' .." % message
		for c in self.clients:
			c.sendMessage(message)
			print "message sent to " + c.peerstr
	
	def broadcastJson(self, object):
		message = json.dumps(object, separators=(',',':'))
		self.broadcast(message)
	
	def broadcastAllExcept(self, message, excluded):
		print "broadcasting message '%s' to all except '%s' .." % (message, excluded.peerstr)
		for c in self.clients:
			if not c == excluded:
				c.sendMessage(message)
				print "message sent to " + c.peerstr
	
	def broadcastJsonAllExcept(self, object, excluded):
		message = json.dumps(object, separators=(',',':'))
		self.broadcastAllExcept(message, excluded)
	
	def onMessage(self, client, messageStr):
		print "Got message: " + messageStr
		message = json.loads(messageStr)
		hasControl = (client == self.controllingClient)
		if "command" in message:
			command = message["command"]
			if command == "takeControl":
				# TODO - Add some actual permissions checks in here
				self.setController(client)
			# TODO - Temporary message. Replace with server-side playlist handling later
			elif command == "changeVideo" and hasControl:
				self.changeVideo(message["video"])
			elif command == "videoState" and hasControl:
				# TODO - Do some actual checking of the message
				self.videoState = message["videoState"]
				self.broadcastAllExcept(messageStr, client)
			elif command == "reportPlaybackPosition" and hasControl:
				# TODO - Do some actual checking of the message
				self.position = message["position"]
				self.broadcastAllExcept(messageStr, client)
	
	def setController(self, client):
		if self.controllingClient == client:
			return
		if self.controllingClient:
			self.controllingClient.sendJson({ "command": "updateControl", "control": False })
		self.controllingClient = client
		client.sendJsonMessage({ "command": "updateControl", "control": True })
	
	def changeVideo(self, video):
		self.currentVideo = video
		self.broadcastJson({ "command": "changeVideo", "video": video })

if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("-d", "--debug", help="Enable debug output", action="store_true")
	parser.add_argument("-w", "--webserver", help="Enable local webserver", action="store_true")
	args = parser.parse_args()
	
	if args.debug:
		log.startLogging(sys.stdout)
		debug = True
	else:
		debug = False
	
	ServerFactory = VideoSyncServerFactory
	
	factory = ServerFactory("ws://localhost:9000", debug = debug, debugCodePaths = debug)
	factory.protocol = VideoSyncServerProtocol
	factory.setProtocolOptions(allowHixie76 = True)
	listenWS(factory)
	
	if args.webserver:
		webdir = File("../site")
		web = Site(webdir)
		reactor.listenTCP(8080, web)
	
	reactor.run()
