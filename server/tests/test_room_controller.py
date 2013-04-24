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
	username = None
	messages = []
	is_moderator = False
	waiting_event = threading.Event()
	waiting_count = 0

	def __init__(self, username):
		self.username = username

	def __eq__(self, other):
		return self.username == other.username

	def set_moderator(self, is_moderator):
		self.is_moderator = is_moderator

	def send(self, message):
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

	def test_single_user(self):
		user1 = MockUserSession("TestUser1")
		self.room_controller.user_connect(user1)

		assert_equal(
			[{"command": "initial_users", "users": ["TestUser1"]},
				 {"command": "set_moderator", "username": "TestUser1"},
				 {"command": "initial_queue", "queue": []}]
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
