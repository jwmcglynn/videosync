from models.video import Video, NoSuchVideoException
from database_create import database_create
import database
import os

from nose.tools import *

k_database = "test_db.sqlitedb"

class TestVideo:
	@classmethod
	def setup_class(cls):
		database_create(k_database)
		database.connect(k_database)

	@classmethod
	def teardown_class(cls):
		database.close()
		os.unlink(k_database)

	@raises(NoSuchVideoException)
	def test_invalid_video(self):
		invalid = Video(1337)

	def create_internal(self, room_id, rank, service, url, title, duration, start_time):
		video_id = Video.create(room_id, rank, service, url, title, duration, start_time)

		recreated_video = Video(video_id)
		assert_equals(room_id, recreated_video.room_id) 
		assert_equals(rank, recreated_video.rank) 
		assert_equals(service, recreated_video.service) 
		assert_equals(url, recreated_video.url) 
		assert_equals(title, recreated_video.title) 
		assert_equals(duration, recreated_video.duration) 
		assert_equals(start_time, recreated_video.start_time) 

		return recreated_video

	def test_basic(self):
		self.create_internal(
			0
			, 0.0
			, "youtube"
			, "http://www.youtube.com/watch?v=Qqd9S06lvH0"
			, "screaming creepers"
			, 28
			, 0)

		self.create_internal(
			0
			, 1.0
			, "youtube"
			, "http://www.youtube.com/watch?v=Wl8AK5Ht65Y"
			, "Oh Bother..."
			, 5
			, 0)

	@raises(NoSuchVideoException)
	def test_removal(self):
		video = self.create_internal(
			0
			, 1.0
			, "youtube"
			, "http://www.youtube.com/watch?v=Wl8AK5Ht65Y"
			, "Oh Bother..."
			, 5
			, 0)

		video.remove()
		removed_video = Video(video.item_id) # Object is a zombie, but the video is gone from the DB.


	# TODO: Video reordering.
