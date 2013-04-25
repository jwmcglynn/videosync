from models.room import Room
from models.video import Video
import video_resolver

class RoomController:
	def __init__(self, room_id):
		self.__room = Room(room_id)
		self.__active_users = []
		self.__queue = self.__room.video_queue()
		self.__moderator = None
		self.__current_video_index = 0
		self.__current_video_time = 0.0
		self.__video_playing = False

	def process_message(self, user_session, message):
		try:
			if message["command"] == "add_video":
				video_resolver.resolve(
					message["url"]
					, self.on_video_resolved)

		except KeyError:
			# TODO: Log error
			pass

	#### Broadcasting.
	def broadcast(self, message):
		for session in self.__active_users:
			session.send(message)

	def broadcast_all_but_one(self, excluded_session, message):
		for session in self.__active_users:
			if session != excluded_session:
				session.send(message)

	#### Users.
	def user_connect(self, user_session):
		self.broadcast(
			{"command": "user_connect"
				, "username": user_session.username})
		self.__active_users.append(user_session)

		# If this is the only user make them moderator.
		if self.__moderator is None:
			self.update_moderator(user_session)

		self.send_initial_state(user_session)

	def user_disconnect(self, user_session):
		self.__active_users.remove(user_session)

		self.broadcast(
			{"command": "user_disconnect"
				, "username": user_session.username})

		if self.__moderator == user_session:
			# Pick a new moderator.
			if len(self.__active_users) != 0:
				self.update_moderator(self.__active_users[0])
			else:
				self.__moderator = None

	def update_moderator(self, user_session):
		if self.__moderator:
			self.__moderator.set_moderator(False)

		self.__moderator = user_session
		self.__moderator.set_moderator(True)

		self.broadcast_all_but_one(
			user_session
			, {"command": "set_moderator"
				, "username": user_session.username})

	def send_initial_state(self, user_session):
		user_session.send(
			{"command": "initial_users"
				, "users": map(lambda x: x.username, self.__active_users)})
		user_session.send(
			{"command": "set_moderator"
				, "username": self.__moderator.username})

		user_session.send(
			{"command": "initial_queue"
				, "queue": map(lambda x: self.serialize_video(x), self.__queue)})
		if len(self.__queue) > 0:
			user_session.send(
				{"command": "change_video"
					, "video": self.serialize_video(self.__queue[self.__current_video_index])})

		if self.__video_playing:
			user_session.send(
				{"command": "video_state"
					, "playing": self.__video_playing
					, "time": self.__current_video_time})

	def serialize_video(self, video):
		return {
			"item_id": video.item_id
			, "service": video.service
			, "url": video.url
			, "title": video.title
			, "duration": video.duration
			, "start_time": video.start_time
		}

	#### Video resolution.
	def on_video_resolved(self, video_info):
		video = self.__room.add_video(
			video_info.service
			, video_info.url
			, video_info.title
			, video_info.duration
			, video_info.start_time)
		self.__queue.append(video)

		self.broadcast(
			{"command": "add_queue_video"
				, "video": self.serialize_video(video)})

