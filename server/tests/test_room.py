from models.room import Room, NoSuchRoomException
from models.user import User
from database_create import database_create
import database
import os

from nose.tools import *

k_database = "test_db.sqlitedb"

class TestRoom:
	@classmethod
	def setup_class(cls):
		database_create(k_database)
		database.connect(k_database)

	@classmethod
	def teardown_class(cls):
		database.close()
		os.unlink(k_database)

	@raises(NoSuchRoomException)
	def test_invalid_room(self):
		invalid = Room(1337)

	def create_internal(self, name, owner):
		room_id = Room.create(name, owner)

		recreated_room = Room(room_id)
		assert_equals(room_id, recreated_room.room_id)
		assert_equals(name, recreated_room.name)
		assert_equals(owner, recreated_room.owner)

		return recreated_room

	def test_basic(self):
		system = User(0)

		self.create_internal(
			"Test Room"
			, system)

	def test_queue(self):
		default_room = Room(0)
		assert_equal(default_room.video_queue(), [])

		video1 = default_room.add_video(
			"youtube"
			, "http://www.youtube.com/watch?v=Qqd9S06lvH0"
			, "screaming creepers"
			, 28
			, 0)
		video2 = default_room.add_video(
			"youtube"
			, "http://www.youtube.com/watch?v=Wl8AK5Ht65Y"
			, "Oh Bother..."
			, 5
			, 0)

		assert_equal(default_room.video_queue(), [video1, video2])
		video1.remove()
		assert_equal(default_room.video_queue(), [video2])
		video2.remove()
		assert_equal(default_room.video_queue(), [])


	# TODO: Video reordering.
