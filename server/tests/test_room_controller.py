from nose.twistedtools import threaded_reactor, reactor, deferred
from twisted.internet import defer

from room_controller import RoomController
from models.user import User
from models.room import Room
from database_create import database_create
import database
import os
import threading

from nose.tools import *

k_database = "test_db.sqlitedb"

k_video1 = {"service": u"youtube"
				, "url": u"http://youtube.com/watch?v=Qqd9S06lvH0"
				, "title": u"screaming creepers"
				, "item_id": 1
				, "duration": 28
				, "start_time": 0}
k_video2 = {"service": u"youtube"
				, "url": u"http://youtube.com/watch?v=Wl8AK5Ht65Y"
				, "title": u"Oh Bother..."
				, "item_id": 2
				, "duration": 5
				, "start_time": 0}
k_video3 = {"service": u"youtube"
				, "url": u"http://youtube.com/watch?v=3b4nFj7MhK0"
				, "title": u"Dinosaur Telephone Call"
				, "item_id": 3
				, "duration": 94
				, "start_time": 0}

class AsyncTimeout(Exception):
	pass

class MockUserSessionBase(object):
	def __init__(self, username):
		self.raw_username = username
		self.messages = []
		self.waiting_event = threading.Event()
		self.waiting_count = 0

	def __eq__(self, other):
		return self is other

	def send(self, message):
		print "%s got message: %s" % (self.username, message)
		self.messages.append(message)

		if self.waiting_count > 0 and self.waiting_count == len(self.messages):
			self.waiting_event.set()

	@deferred(5.0)
	def wait_message_count(self, count):
		d = defer.Deferred()

		if count != len(self.messages):
			self.waiting_event.clear()
			self.waiting_count = count

			def thread():
				self.waiting_event.wait()
				self.waiting_count = 0
				d.callback(None)
			t = threading.Thread(target=thread)
			t.start()
		else:
			d.callback(None)
		return d

class MockUserSession(MockUserSessionBase):
	def __init__(self, username):
		super(MockUserSession, self).__init__(username)
		self.is_guest = False

	@property
	def username(self):
		return self.raw_username

class MockGuestUserSession(MockUserSessionBase):
	def __init__(self, username):
		super(MockGuestUserSession, self).__init__(username)
		self.is_guest = True
		self.has_changed_username = False

	def change_username(self, username):
		self.raw_username = username
		self.has_changed_username = True

	@property
	def username(self):
		return "*%s*" % self.raw_username

class TestRoomController():
	@classmethod
	def setup_class(cls):
		threaded_reactor()

	def setup(self):
		database_create(k_database)
		database.connect(k_database)

		system = User(0)
		self.room_id = Room.create("Test Room", system)
		self.room_controller = RoomController(self.room_id)

	def teardown(self):
		database.close()
		os.unlink(k_database)

	def validate_video_queue(self, queue, selected_video):
		## Same room.
		user = MockUserSession("ValidationUser")
		self.room_controller.user_connect(user)

		expected_response = [{"command": "room_joined", "username": "ValidationUser"}
			, {"command": "initial_users", "users": ["TestUser1", "ValidationUser"]}
			, {"command": "set_moderator", "username": "TestUser1"}
			, {"command": "initial_queue", "queue": queue}]
		if len(queue) > 0:
			expected_response.append({"command": "change_video", "video": selected_video})

		assert_equal(expected_response, user.messages)
		user.messages = []

		self.room_controller.user_disconnect(user)

		## New room, reconstructed from model.
		new_room = RoomController(self.room_id)
		test_user = MockUserSession("NewValidationUser")
		new_room.user_connect(test_user)

		expected_response = [{"command": "room_joined", "username": "NewValidationUser"}
			, {"command": "initial_users", "users": ["NewValidationUser"]}
			, {"command": "set_moderator", "username": "NewValidationUser"}
			, {"command": "initial_queue", "queue": queue}]
		if len(queue) > 0:
			expected_response.append({"command": "change_video", "video": queue[0]})

		assert_equal(expected_response, test_user.messages)
		test_user.messages = []

	def test_basic(self):
		user1 = MockUserSession("TestUser1")
		user2 = MockUserSession("TestUser2")

		self.room_controller.user_connect(user1)
		assert_equal(
			[{"command": "room_joined", "username": "TestUser1"}
				, {"command": "initial_users", "users": ["TestUser1"]}
				 , {"command": "set_moderator", "username": "TestUser1"}
				 , {"command": "initial_queue", "queue": []}]
			, user1.messages)
		user1.messages = []

		self.room_controller.process_message(
			user1
			, {"command": "add_video", "url": k_video1["url"]})
		user1.wait_message_count(2)
		assert_equal(
			[{"command": "add_queue_video", "video": k_video1}
				, {"command": "change_video", "video": k_video1}]
			, user1.messages)
		user1.messages = []

		# Connect additional user.
		self.room_controller.user_connect(user2)
		assert_equal(
			[{"command": "user_connect", "username": "TestUser2"}]
			, user1.messages)
		assert_equal(
			[{"command": "room_joined", "username": "TestUser2"}
				, {"command": "initial_users", "users": ["TestUser1", "TestUser2"]}
				, {"command": "set_moderator", "username": "TestUser1"}
				, {"command": "initial_queue", "queue": [k_video1]}
				, {"command": "change_video", "video": k_video1}]
			, user2.messages)
		user1.messages = []
		user2.messages = []

	def test_guest(self):
		test_user = MockGuestUserSession("TestGuestUser")

		## Validate username decoration.
		self.room_controller.user_connect(test_user)
		assert_equal(
			[{"command": "room_joined", "username": "*TestGuestUser*"}
				, {"command": "initial_users", "users": ["*TestGuestUser*"]}
				, {"command": "set_moderator", "username": "*TestGuestUser*"}
				, {"command": "initial_queue", "queue": []}]
			, test_user.messages)

		## Validate username change.
		user1 = MockGuestUserSession("GuestUser")
		user2 = MockUserSession("RealUser")
		self.room_controller.user_connect(user1)
		self.room_controller.user_connect(user2)
		user1.messages = [] # Ignore initial state messages.
		user2.messages = []
		test_user.messages = []

		# Expected to fail, username is taken by a guest.
		self.room_controller.process_message(
			test_user
			, {"command": "guest_username"
				, "username": "GuestUser"})
		assert_equal(
			[{"command": "command_error"
				, "context": "guest_username"
				, "reason": "Username already in use."}]
			, test_user.messages)
		test_user.messages = []

		# Expected to fail, username is taken by a registered user.
		self.room_controller.process_message(
			test_user
			, {"command": "guest_username"
				, "username": "GuestUser"})
		assert_equal(
			[{"command": "command_error"
				, "context": "guest_username"
				, "reason": "Username already in use."}]
			, test_user.messages)
		test_user.messages = []

		# Expected to succeed.
		self.room_controller.process_message(
			test_user
			, {"command": "guest_username"
				, "username": "NewUsername"})
		expected_response = [
			{"command": "guest_username_changed"
				, "old_username": "*TestGuestUser*"
				, "username": "*NewUsername*"}]
		assert_equal(expected_response, test_user.messages)
		assert_equal(expected_response, user1.messages)
		assert_equal(expected_response, user2.messages)

	def test_moderator(self):
		## Selecting videos.
		user1 = MockUserSession("TestUser1")

		self.room_controller.user_connect(user1)
		assert_equal(
			[{"command": "room_joined", "username": "TestUser1"}
				, {"command": "initial_users", "users": ["TestUser1"]}
				 , {"command": "set_moderator", "username": "TestUser1"}
				 , {"command": "initial_queue", "queue": []}]
			, user1.messages)
		user1.messages = []

		# Add videos to queue.
		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video1["url"]})
		user1.wait_message_count(2)
		assert_equal(
			[{"command": "add_queue_video", "video": k_video1}
				, {"command": "change_video", "video": k_video1}]
			, user1.messages)
		user1.messages = []

		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video2["url"]})
		user1.wait_message_count(1)
		assert_equal([{"command": "add_queue_video", "video": k_video2}], user1.messages)
		user1.messages = []

		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video3["url"]})
		user1.wait_message_count(1)
		assert_equal([{"command": "add_queue_video", "video": k_video3}], user1.messages)
		user1.messages = []

		# Select videos.
		self.room_controller.process_message(user1, {"command": "select_video", "item_id": k_video1["item_id"]})
		assert_equal(
			[{"command": "change_video", "video": k_video1}]
			, user1.messages)
		user1.messages = []

		self.room_controller.process_message(user1, {"command": "select_video", "item_id": k_video3["item_id"]})
		assert_equal(
			[{"command": "change_video", "video": k_video3}]
			, user1.messages)
		user1.messages = []

		## Video status.
		user2 = MockGuestUserSession("TestGuestUser")
		self.room_controller.user_connect(user2)
		user1.messages = []
		user2.messages = []

		for i in xrange(0, k_video3["duration"]):
			if i == k_video3["duration"]:
				state = "paused"
			else:
				state = "playing"

			self.room_controller.process_message(
				user1
				, {"command": "update_video_state"
					, "position": i
					, "state": state})
			assert_equal(
				[]
				, user1.messages)
			assert_equal(
				[{"command": "video_state"
					, "position": i
					, "state": state}]
				, user2.messages)
			user2.messages = []

	def test_moderator_give(self):
		user1 = MockGuestUserSession("TestGuestUser")
		user2 = MockUserSession("RealUser")

		## Validate username decoration.
		self.room_controller.user_connect(user1)
		self.room_controller.user_connect(user2)
		user1.messages = [] # Ignore initial state messages.
		user2.messages = []

		self.room_controller.process_message(
			user1
			, {"command": "give_moderator"
				, "username": "RealUser"})
		expected_response = [
			{"command": "set_moderator"
				, "username": "RealUser"}]
		assert_equal(expected_response, user1.messages)
		assert_equal(expected_response, user2.messages)

	def test_moderator_queue(self):
		## Moving videos.
		user1 = MockUserSession("TestUser1")

		self.room_controller.user_connect(user1)
		assert_equal(
			[{"command": "room_joined", "username": "TestUser1"}
				, {"command": "initial_users", "users": ["TestUser1"]}
				 , {"command": "set_moderator", "username": "TestUser1"}
				 , {"command": "initial_queue", "queue": []}]
			, user1.messages)
		user1.messages = []

		# Add videos to queue.
		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video1["url"]})
		user1.wait_message_count(2)
		assert_equal(
			[{"command": "add_queue_video", "video": k_video1}
				, {"command": "change_video", "video": k_video1}]
			, user1.messages)
		user1.messages = []

		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video2["url"]})
		user1.wait_message_count(1)
		assert_equal([{"command": "add_queue_video", "video": k_video2}], user1.messages)
		user1.messages = []

		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video3["url"]})
		user1.wait_message_count(1)
		assert_equal([{"command": "add_queue_video", "video": k_video3}], user1.messages)
		user1.messages = []

		# Move video1 to the end.
		self.room_controller.process_message(
			user1
			, {"command": "move_video"
				, "item_id": k_video1["item_id"]
				, "index": 2})
		assert_equal(
			[{"command": "move_queue_video"
				, "item_id": k_video1["item_id"]
				, "index": 2}]
			, user1.messages)
		self.validate_video_queue([k_video2, k_video3, k_video1], k_video1)
		user1.messages = []

		# Move video3 to the beginning.
		self.room_controller.process_message(
			user1
			, {"command": "move_video"
				, "item_id": k_video3["item_id"]
				, "index": 0})
		assert_equal(
			[{"command": "move_queue_video"
				, "item_id": k_video3["item_id"]
				, "index": 0}]
			, user1.messages)
		self.validate_video_queue([k_video3, k_video2, k_video1], k_video1)
		user1.messages = []

		# Try moving video out of range.
		self.room_controller.process_message(
			user1
			, {"command": "move_video"
				, "item_id": k_video3["item_id"]
				, "index": 3})
		assert_equal(
			[{"command": "command_error"
				, "context": "move_video"
				, "reason": "Index out of range."}]
			, user1.messages)
		user1.messages = []

		# Move video3 from start to the center.
		self.room_controller.process_message(
			user1
			, {"command": "move_video"
				, "item_id": k_video3["item_id"]
				, "index": 1})
		assert_equal(
			[{"command": "move_queue_video"
				, "item_id": k_video3["item_id"]
				, "index": 1}]
			, user1.messages)
		self.validate_video_queue([k_video2, k_video3, k_video1], k_video1)
		user1.messages = []

		# Move video1 from end to the center.
		self.room_controller.process_message(
			user1
			, {"command": "move_video"
				, "item_id": k_video1["item_id"]
				, "index": 1})
		assert_equal(
			[{"command": "move_queue_video"
				, "item_id": k_video1["item_id"]
				, "index": 1}]
			, user1.messages)
		self.validate_video_queue([k_video2, k_video1, k_video3], k_video1)
		user1.messages = []

		## Removing videos.
		# Remove video1.
		self.room_controller.process_message(
			user1
			, {"command": "remove_video"
				, "item_id": k_video1["item_id"]})
		assert_equal(
			[{"command": "remove_queue_video"
				, "item_id": k_video1["item_id"]}
			, {"command": "change_video"
				, "video": k_video3}]
			, user1.messages)
		self.validate_video_queue([k_video2, k_video3], k_video3)
		user1.messages = []

		# Remove a video that is no longer present, expect error.
		self.room_controller.process_message(
			user1
			, {"command": "remove_video"
				, "item_id": k_video1["item_id"]})
		assert_equal(
			[{"command": "command_error"
				, "context": "remove_video"
				, "reason": "Video not found."}]
			, user1.messages)
		user1.messages = []

		# Remove video2.
		self.room_controller.process_message(
			user1
			, {"command": "remove_video"
				, "item_id": k_video2["item_id"]})
		assert_equal(
			[{"command": "remove_queue_video"
				, "item_id": k_video2["item_id"]}]
			, user1.messages)
		self.validate_video_queue([k_video3], k_video3)
		user1.messages = []

		# Remove video3.
		self.room_controller.process_message(
			user1
			, {"command": "remove_video"
				, "item_id": k_video3["item_id"]})
		assert_equal(
			[{"command": "remove_queue_video"
				, "item_id": k_video3["item_id"]}]
			, user1.messages)
		self.validate_video_queue([], None)
		user1.messages = []

	def test_advance_video(self):
		## Advancing videos.
		user1 = MockUserSession("TestUser1")

		self.room_controller.user_connect(user1)
		assert_equal(
			[{"command": "room_joined", "username": "TestUser1"}
				, {"command": "initial_users", "users": ["TestUser1"]}
				 , {"command": "set_moderator", "username": "TestUser1"}
				 , {"command": "initial_queue", "queue": []}]
			, user1.messages)
		user1.messages = []

		# Add videos to queue.
		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video1["url"]})
		user1.wait_message_count(2)
		assert_equal(
			[{"command": "add_queue_video", "video": k_video1}
				, {"command": "change_video", "video": k_video1}]
			, user1.messages)
		user1.messages = []

		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video2["url"]})
		user1.wait_message_count(1)
		assert_equal([{"command": "add_queue_video", "video": k_video2}], user1.messages)
		user1.messages = []

		self.room_controller.process_message(user1, {"command": "add_video", "url": k_video3["url"]})
		user1.wait_message_count(1)
		assert_equal([{"command": "add_queue_video", "video": k_video3}], user1.messages)
		user1.messages = []

		# Issue advance commands (internal API).
		self.room_controller.advance_video()
		user1.wait_message_count(1)
		assert_equal([{"command": "change_video", "video": k_video2}], user1.messages)
		user1.messages = []

		self.room_controller.advance_video()
		user1.wait_message_count(1)
		assert_equal([{"command": "change_video", "video": k_video3}], user1.messages)
		user1.messages = []

		# Wrap back to start.
		self.room_controller.advance_video()
		user1.wait_message_count(1)
		assert_equal([{"command": "change_video", "video": k_video1}], user1.messages)
		user1.messages = []
