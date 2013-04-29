import sys
import argparse
import database
from client_connection import ClientConnection
from twisted.internet import reactor
from twisted.python import log
from twisted.web.server import Site
from twisted.web.static import File
from autobahn.websocket import WebSocketServerFactory, listenWS

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
	

	database.connect("videosync.sqlitedb")

	factory = WebSocketServerFactory("ws://localhost:9000", debug = debug, debugCodePaths = debug)
	factory.protocol = ClientConnection
	factory.setProtocolOptions(allowHixie76 = True)
	listenWS(factory)
	
	if args.webserver:
		webdir = File("../site")
		webdir.contentTypes[".svg"] = "image/svg+xml"
		web = Site(webdir)
		reactor.listenTCP(8080, web)
	
	reactor.run()
	database.close()
