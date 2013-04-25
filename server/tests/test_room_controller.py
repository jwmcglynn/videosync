from room_controller import RoomController
from models.user import User
from models.room import Room
from database_create import database_create
import database
import os
import threading

from nose.tools import *

k_database = "test_db.sqlitedb"

class AsyncTimeout(Exception):
	pass

class MockUserSession:
	def __init__(self, username):
		self.username = username
		self.messages = []
		self.is_moderator = False
		self.waiting_event = threading.Event()
		self.waiting_count = 0

	def __eq__(self, other):
		return self.username == other.username

	def set_moderator(self, is_moderator):
		self.is_moderator = is_moderator

	def send(self, message):
		print "%s got message: %s" % (self.username, message)
		self.messages.append(message)

		if self.waiting_count > 0 and self.waiting_count == len(self.messages):
			self.waiting_event.set()

	def wait_message_count(self, count):
		if count != len(self.messages):
			self.waiting_count = count
			if not self.waiting_event.wait(5.0):
				raise AsyncTimeout 

class TestRoomController:
	room_controller = None

	@classmethod
	def setup_class(cls):
		database_create(k_database)
		database.connect(k_database)

	@classmethod
	def teardown_class(cls):
		database.close()
		os.unlink(k_database)

	def setup(self):
		system = User(0)
		room_id = Room.create("Test Room", system)
		self.room_controller = RoomController(room_id)

	def test_basic(self):
		user1 = MockUserSession("TestUser1")
		user2 = MockUserSession("TestUser2")

		self.room_controller.user_connect(user1)
		assert_equal(
			[{"command": "initial_users", "users": ["TestUser1"]}
				 , {"command": "set_moderator", "username": "TestUser1"}
				 , {"command": "initial_queue", "queue": []}]
			, user1.messages)
		user1.messages = []

		self.room_controller.process_message(
			user1
			, {"command": "add_video"
				, "url": "http://www.youtube.com/watch?v=Qqd9S06lvH0"})
		user1.wait_message_count(1)
		assert_equal(
			[{"command": "add_queue_video"
				, "video": {"duration": 28
					, "item_id": 1
					, "service": u"youtube"
					, "start_time": 0
					, "title": u"screaming creepers"
					, "url": u"http://www.youtube.com/watch?v=Qqd9S06lvH0"}}]
			, user1.messages)
		user1.messages = []

		# Connect additional user.
		self.room_controller.user_connect(user2)
		assert_equal(
			[{"command": "user_connect", "username": "TestUser2"}]
			, user1.messages)
		assert_equal(
			[{"command": "initial_users", "users": ["TestUser1", "TestUser2"]}
				, {"command": "set_moderator", "username": "TestUser1"}
				, {"command": "initial_queue", "queue": [
					{"service": u"youtube", "title": u"screaming creepers",
						"url": u"http://www.youtube.com/watch?v=Qqd9S06lvH0",
						"start_time": 0, "duration": 28, "item_id": 1}]}
				, {"command": "change_video", "video":
					{"service": u"youtube", "title": u"screaming creepers",
						"url": u"http://www.youtube.com/watch?v=Qqd9S06lvH0",
						"start_time": 0, "duration": 28, "item_id": 1}}]
			, user2.messages)
		user1.messages = []
		user2.messages = []

