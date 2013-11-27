import models.room as room_model
import video_resolver
import vote_controller
import itertools
import unicodedata

from services.common import UrlError
from services.youtube import VideoError

active_rooms = dict()
NoSuchRoomException = room_model.NoSuchRoomException

def filter_non_printable(s):
	# Strip unwanted characters: http://en.wikipedia.org/wiki/Mapping_of_Unicode_characters
	PRINTABLE = set(("Lu", "Ll", "Nd", "Pc", "Zs"))
	result = filter(lambda x: unicodedata.category(x) in PRINTABLE, unicode(s))
	return u"".join(result).strip()

class CaseInsensitiveDict(dict):
	def __setitem__(self, key, value):
		super(CaseInsensitiveDict, self).__setitem__(key.lower(), value)

	def __getitem__(self, key):
		return super(CaseInsensitiveDict, self).__getitem__(key.lower())

	def __delitem__(self, key):
		return super(CaseInsensitiveDict, self).__delitem__(key.lower())

	def __contains__(self, key):
		return super(CaseInsensitiveDict, self).__contains__(key.lower())

class EventSource(object):
	def __init__(self):
		self.__callbacks = []

	def add_callback(self, callback):
		self.__callbacks.append(callback)

	def remove_callback(self, callback):
		self.__callbacks.remove(callback)

	def invoke(self, source, *args):
		for callback in self.__callbacks:
			callback(source, *args)

	def __len__(self):
		return len(self.__callbacks)


def get_instance(room_id):
	if room_id in active_rooms:
		return active_rooms[room_id]
	else:
		room = RoomController(room_id)
		active_rooms[room_id] = room
		return room

class CommandError(Exception):
	def __init__(self, message):
		self.message = message

class RoomController:
	def __init__(self, room_id):
		self.__room = room_model.Room(room_id)
		self.__active_users = []
		self.__user_lookup = CaseInsensitiveDict()
		self.__queue = self.__room.video_queue()
		self.__moderator = None
		self.__current_video = None
		self.__current_video_time = 0.0
		self.__video_playing = False
		self.__event_user_connect = EventSource()
		self.__event_user_disconnect = EventSource()
		self.__event_video_changed = EventSource()
		self.__event_moderator_changed = EventSource()
		self.__vote_skip = None
		self.__vote_mutiny = None

		if len(self.__queue):
			self.__current_video = self.__queue[0]

	@property
	def event_user_connect(self):
		return self.__event_user_connect

	@property
	def event_user_disconnect(self):
		return self.__event_user_disconnect

	@property
	def event_video_changed(self):
		return self.__event_video_changed

	@property
	def event_moderator_changed(self):
		return self.__event_moderator_changed

	def process_message(self, user_session, message):
		try:
			try:
				if message["command"] == "guest_username":
					self.process_guest_username(user_session, message)
				elif message["command"] == "add_video":
					self.process_add_video(user_session, message)
				elif message["command"] == "vote_skip":
					self.process_vote_skip(user_session, message)
				elif message["command"] == "vote_mutiny" and user_session != self.__moderator:
					self.process_vote_mutiny(user_session, message)
				elif user_session == self.__moderator:
					# Moderator-level commands.
					if message["command"] == "give_moderator":
						self.process_give_moderator(user_session, message)
					elif message["command"] == "update_video_state":
						self.process_update_video_state(user_session, message)
					elif message["command"] == "select_video":
						self.process_select_video(user_session, message)
					elif message["command"] == "move_video":
						self.process_move_video(user_session, message)
					elif message["command"] == "remove_video":
						self.process_remove_video(user_session, message)
					elif message["command"] == "vote_mutiny_cancel":
						self.process_vote_mutiny_cancel(user_session, message)
					else:
						raise CommandError("Unknown command.")
				else:
					raise CommandError("Unknown command.")
			except KeyError:
				raise CommandError("Protocol error.")
		except (CommandError, UrlError), error:
			if "command" in message:
				context = message["command"]
			else:
				context = "unknown"

			user_session.send(
				{"command": "command_error"
					, "context": context
					, "reason": error.message})

	def process_guest_username(self, user_session, message):
		if not user_session.is_guest or user_session.has_changed_username:
			raise CommandError("Cannot change username.")

		username = filter_non_printable(message["username"])
		if "*" in username:
			raise CommandError("Usernames cannot contain asterisks.")
		elif len(username) == 0:
			if len(message["username"]) == 0:
				raise CommandError("Username too short.")
			else:
				raise CommandError("Username doesn't contain any printable characters!")
		elif len(username) > 30:
			raise CommandError("Username too long.  The maximum length is 30 characters.")
		
		# Check to see if there any duplicate usernames.
		guest_username = "*%s*" % username
		if username in self.__user_lookup or guest_username in self.__user_lookup:
			raise CommandError("Username already in use.")

		old_username = user_session.username
		user_session.change_username(username)

		del self.__user_lookup[old_username]
		self.__user_lookup[user_session.username] = user_session

		self.broadcast(
			{"command": "guest_username_changed"
				, "old_username": old_username
				, "username": user_session.username})

	def process_add_video(self, user_session, message):
		def on_video_resolve_error(error):
			if type(error.value) == VideoError:
				user_session.send(
						{"command": "command_error"
							, "context": "add_video"
							, "reason": error.value.message})

		d = video_resolver.resolve(message["url"])

		d.addCallbacks(self.on_video_resolved, on_video_resolve_error)


	def process_vote_skip(self, user_session, message):
		if not self.__vote_skip:
			self.__vote_skip = vote_controller.VoteSkipController(self)

		self.__vote_skip.vote(self, user_session)

	def process_vote_mutiny(self, user_session, message):
		if not self.__vote_mutiny:
			self.__vote_mutiny = vote_controller.VoteMutinyController(self)

		self.__vote_mutiny.vote(self, user_session)

	def process_give_moderator(self, user_session, message):
		new_moderator = self.lookup_user(message["username"])
		if new_moderator is None:
			raise CommandError("Username not found.")

		self.update_moderator(new_moderator)

	def process_update_video_state(self, user_session, message):
		self.__video_playing = message["state"] == "playing"
		self.__current_video_time = float(message["position"])

		self.broadcast_all_but_one(
			user_session
			, {"command": "video_state"
				, "position": self.__current_video_time
				, "state": message["state"]})

	def process_select_video(self, user_session, message):
		video = self.lookup_video(int(message["item_id"]))
		if video is None:
			raise CommandError("Video not found.")

		self.__current_video = video
		self.__current_video_time = 0.0

		self.broadcast(
			{"command": "change_video"
				, "video": self.serialize_video(video)})
		self.event_video_changed.invoke(self, video)

	def process_move_video(self, user_session, message):
		video = self.lookup_video(int(message["item_id"]))
		if video is None:
			raise CommandError("Video not found.")

		target_index = message["index"]
		if target_index != int(target_index):
			raise CommandError("Invalid index.")

		if target_index < 0 or target_index >= len(self.__queue):
			raise CommandError("Index out of range.")

		if len(self.__queue) == 1:
			return

		def list_queue():
			return map(lambda x: x.item_id, self.__queue)

		self.__queue.remove(video)
		self.__queue.insert(target_index, video)

		# Update rank.
		if target_index == 0:
			video.update_rank(self.__queue[1].rank - 1.0)
		elif target_index == len(self.__queue) - 1:
			video.update_rank(self.__queue[target_index - 1].rank + 1.0)
		else:
			assert len(self.__queue) >= 3
			video.update_rank((self.__queue[target_index - 1].rank + self.__queue[target_index + 1].rank) * 0.5)

		self.broadcast(
			{"command": "move_queue_video"
				, "item_id": message["item_id"]
				, "index": message["index"]})

	def process_remove_video(self, user_session, message):
		video = self.lookup_video(int(message["item_id"]))
		if video is None:
			raise CommandError("Video not found.")

		removed_index = self.__queue.index(video)
		self.__queue.remove(video)
		video.remove()

		self.broadcast(
			{"command": "remove_queue_video"
				, "item_id": message["item_id"]})

		if video.item_id == self.__current_video.item_id:
			if len(self.__queue) > 0:
				new_index = removed_index
				if new_index == len(self.__queue):
					new_index -= 1
				self.__current_video = self.__queue[new_index]

				self.broadcast(
					{"command": "change_video"
						, "video": self.serialize_video(self.__current_video)})
			else:
				self.__current_video = None
			self.__current_video_time = 0.0
			self.event_video_changed.invoke(self, self.__current_video)

	def process_vote_mutiny_cancel(self, user_session, message):
		if self.__vote_mutiny is not None:
			self.__vote_mutiny.moderator_cancel(self)

	#### Broadcasting.
	def broadcast(self, message):
		for session in self.__active_users:
			session.send(message)

	def broadcast_all_but_one(self, excluded_session, message):
		for session in self.__active_users:
			if session != excluded_session:
				session.send(message)

	#### Users.
	@property
	def active_users(self):
		return self.__active_users

	def next_guest_username(self):
		def username_generator():
			for i in itertools.count():
				yield "unnamed %d" % i

		for username in username_generator():
			guest_username = "*%s*" % username
			if guest_username not in self.__user_lookup:
				return username

	def user_connect(self, user_session):
		user_session.send(
			{"command": "room_joined"
				, "username": user_session.username})
		self.broadcast(
			{"command": "user_connect"
				, "username": user_session.username})
		self.__active_users.append(user_session)
		self.__user_lookup[user_session.username] = user_session

		self.event_user_connect.invoke(self, user_session)

		# If this is the only user make them moderator.
		if self.__moderator is None:
			# Only update variable, send_initial_state will send the set_moderator message.
			self.__moderator = user_session

		self.send_initial_state(user_session)

	def user_disconnect(self, user_session):
		self.__active_users.remove(user_session)
		del self.__user_lookup[user_session.username]

		self.event_user_disconnect.invoke(self, user_session)

		if len(self.__active_users) == 0:
			del active_rooms[self.__room.room_id]
		else:
			self.broadcast(
				{"command": "user_disconnect"
					, "username": user_session.username})

			if self.__moderator == user_session:
				# Pick the oldest connected user as the new moderator.
				self.update_moderator(self.__active_users[0])

	def update_moderator(self, user_session):
		self.__moderator = user_session
		self.broadcast(
			{"command": "set_moderator"
				, "username": user_session.username})
		self.event_moderator_changed.invoke(self, user_session)

	def lookup_user(self, username):
		for user in self.__active_users:
			if username == user.username:
				return user
		return None

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
		if self.__current_video is not None:
			user_session.send(
				{"command": "change_video"
					, "video": self.serialize_video(self.__current_video)})

		if self.__video_playing or self.__current_video_time > 0.0:
			user_session.send(
				{"command": "video_state"
					, "state": "playing" if self.__video_playing else "paused"
					, "time": self.__current_video_time})

	#### Videos.
	def lookup_video(self, item_id):
		for video in self.__queue:
			if item_id == video.item_id:
				return video
		return None

	def serialize_video(self, video):
		return {
			"item_id": video.item_id
			, "service": video.service
			, "url": video.url
			, "title": video.title
			, "duration": video.duration
			, "start_time": video.start_time
		}

	def advance_video(self):
		if self.__current_video is not None and len(self.__queue) > 1:
			index = self.__queue.index(self.__current_video)

			index += 1
			if index == len(self.__queue):
				index = 0

			video = self.__queue[index]
			self.broadcast(
				{"command": "change_video"
					, "video": self.serialize_video(video)})
			self.__current_video = video
			self.__current_video_time = 0.0

			self.event_video_changed.invoke(self, video)

	def on_video_resolved(self, video_info):
		for video in self.__queue:
			if video_info.url == video.url:
				return

		video = self.__room.add_video(
			video_info.service
			, video_info.url
			, video_info.title
			, video_info.duration
			, video_info.start_time)
		self.__queue.append(video)

		serialized_video = self.serialize_video(video)
		self.broadcast(
			{"command": "add_queue_video"
				, "video": serialized_video})

		if len(self.__queue) == 1:
			self.broadcast(
				{"command": "change_video"
					, "video": serialized_video})
			self.__current_video = video
			self.__current_video_time = 0.0

			self.event_video_changed.invoke(self, video)

	#### Voting.
	def vote_skip_remove(self):
		assert(self.__vote_skip)

		self.__vote_skip.unregister(self)
		self.__vote_skip = None

	def vote_mutiny_remove(self):
		assert(self.__vote_mutiny)

		self.__vote_mutiny.unregister(self)
		self.__vote_mutiny = None
