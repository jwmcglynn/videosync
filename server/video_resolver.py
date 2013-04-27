k_video1 = {"url": u"http://www.youtube.com/watch?v=Qqd9S06lvH0"
				, "title": u"screaming creepers"
				, "duration": 28}
k_video2 = {"url": u"http://www.youtube.com/watch?v=Wl8AK5Ht65Y"
				, "title": u"Oh Bother..."
				, "duration": 5}
k_video3 = {"url": u"http://www.youtube.com/watch?v=3b4nFj7MhK0"
				, "title": u"Dinosaur Telephone Call"
				, "duration": 94}

class VideoInfo:
	def __init__(self, service, url, title, duration, start_time):
		self.service = service
		self.url = url
		self.title = title
		self.duration = duration
		self.start_time = start_time

def resolve(url, callback):
	# TODO: A proper implementation of resolve.
	if url == k_video1["url"]:
		video_info = VideoInfo(
			"youtube"
			, url
			, k_video1["title"]
			, k_video1["duration"]
			, 0)
	elif url == k_video2["url"]:
		video_info = VideoInfo(
			"youtube"
			, url
			, k_video2["title"]
			, k_video2["duration"]
			, 0)
	elif url == k_video3["url"]:
		video_info = VideoInfo(
			"youtube"
			, url
			, k_video3["title"]
			, k_video3["duration"]
			, 0)
	callback(video_info)