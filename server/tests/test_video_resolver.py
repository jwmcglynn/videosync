from nose.twistedtools import threaded_reactor, deferred

from video_resolver import resolve
from services.common import VideoInfo

from nose.tools import *

k_video1 = {"service": u"youtube"
			, "url": u"http://youtube.com/watch?v=Qqd9S06lvH0"
			, "uid": "Qqd9S06lvH0"
			, "title": u"screaming creepers"
			, "duration": 28
			, "start_time": 0}

k_video2 = {"service": u"youtube"
			, "url": u"http://youtube.com/watch?v=Wl8AK5Ht65Y#t=2s"
			, "uid": "Wl8AK5Ht65Y"
			, "title": u"Oh Bother..."
			, "duration": 5
			, "start_time": 2}

k_url3 = u"http://youtu.be/3b4nFj7MhK0"

k_video3 = {"service": u"youtube"
			, "url": u"http://youtube.com/watch?v=3b4nFj7MhK0"
			, "uid": "3b4nFj7MhK0"
			, "title": u"Dinosaur Telephone Call"
			, "duration": 94
			, "start_time": 0}

class TestVideoResolver:
	def setup(self):
		threaded_reactor()

	def convert_video_info(self, video_info):
		return {
			"service": video_info.service
			, "url": video_info.url
			, "uid": video_info.uid
			, "title": video_info.title
			, "duration": video_info.duration
			, "start_time": video_info.start_time
		}

	@deferred(timeout=5.0)
	def test_youtube(self):
		def check_video(video_info):
			assert_equal(k_video1, self.convert_video_info(video_info))

		d = resolve(k_video1["url"])

		d.addCallback(check_video)

		return d

	@deferred(timeout=5.0)
	def test_youtube_start_time(self):
		def check_video(video_info):
			assert_equal(k_video2, self.convert_video_info(video_info))

		d = resolve(k_video2["url"])

		d.addCallback(check_video)

		return d

	@deferred(timeout=5.0)
	def test_youtube_short_url(self):
		def check_video(video_info):
			assert_equal(k_video3, self.convert_video_info(video_info))

		d = resolve(k_url3)

		d.addCallback(check_video)

		return d
