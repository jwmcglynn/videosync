import json
from autobahn.websocket import WebSocketServerProtocol, HttpException
import room_controller
import crockford_base32

class UserSessionBase(object):
	def __init__(self, connection, username):
		self.connection = connection
		self.raw_username = username

	def __eq__(self, other):
		return self is other

	def send(self, message):
		self.connection.sendMessage(json.dumps(message, separators=(',',':')))

class UserSession(UserSessionBase):
	def __init__(self, connection, username):
		super(UserSession, self).__init__(connection, username)
		self.is_guest = False

	@property
	def username(self):
		return self.raw_username

class GuestUserSession(UserSessionBase):
	def __init__(self, connection, username):
		super(GuestUserSession, self).__init__(connection, username)
		self.is_guest = True
		self.has_changed_username = False

	def change_username(self, username):
		self.raw_username = username
		self.has_changed_username = True

	@property
	def username(self):
		return "*%s*" % self.raw_username

class ClientConnection(WebSocketServerProtocol):
	def onConnect(self, connection_request):
		self.connected = False
		self.user_session = None
		self.room = None

		path_parts = connection_request.path.split("/") # Ex: /room/0 -> ["", "room", "0"]

		if len(path_parts) != 3 or path_parts[0] != "" or path_parts[1] != "room":
			raise HttpException(404, "File Not Found")

		try:
			room_id = crockford_base32.decode(path_parts[2])
		except ValueError:
			raise HttpException(404, "File Not Found")

		try:
			self.room = room_controller.get_instance(room_id)
		except room_controller.NoSuchRoomException:
			raise HttpException(404, "File Not Found")

		# TODO: User authentication.
		guest_username = self.room.next_guest_username()
		self.user_session = GuestUserSession(self, guest_username)

		# Return the accepted protocol from list of WebSockets (sub)protocols provided by client or None to speak no specific one or when the client list was empty.
		return None
	
	def onOpen(self):
		self.room.user_connect(self.user_session)
		self.connected = True
	
	def onMessage(self, message, binary):
		if not binary:
			try:
				json_message = json.loads(message)
				self.room.process_message(self.user_session, json_message)
			except TypeError:
				pass
	
	def connectionLost(self, reason):
		WebSocketServerProtocol.connectionLost(self, reason)

		if self.connected:
			self.room.user_disconnect(self.user_session)

		self.connected = False
		self.user_session = None
		self.room = None
	