class VideoInfo:
	def __init__(self, service, url, title, duration, start_time):
		self.service = service
		self.url = url
		self.title = title
		self.duration = duration
		self.start_time = start_time

def resolve(url, callback):
	# TODO: A proper implementation of resolve.
	video_info = VideoInfo(
		"youtube"
		, "http://www.youtube.com/watch?v=Qqd9S06lvH0"
		, "screaming creepers"
		, 28
		, 0)
	callback(video_info)