import database
from models.video import Video
from models.user import User

class NoSuchRoomException(Exception):
	pass

class Room:
	def __init__(self, room_id):
		c = database.cursor()

		# Load room.
		c.execute(
			'''SELECT name
				, owner
			FROM rooms
			WHERE room_id = ?
			LIMIT 1'''
			, (room_id,))
		result_room = c.fetchone()

		if result_room is None:
			raise NoSuchRoomException

		self.__room_id = room_id
		self.__name = result_room[0]
		self.__owner = result_room[1]
		self.__admins = []

		# Load admins.
		c.execute(
			'''SELECT admin_id
			FROM room_admins
			WHERE room_id = ?'''
			, (room_id,))
		result_admins = c.fetchall()
		for admin in result_admins:
			self.__admins.append(admin)

	def __eq__(self, other):
		return self.__room_id == other.__room_id

	@staticmethod
	def create(name, owner):
		c = database.cursor()

		c.execute('''
			INSERT INTO rooms (
				name
				, owner)
			VALUES(?, ?)'''
			, (name, owner.user_id))

		room_id = c.lastrowid
		database.commit()

		return room_id

	@property
	def room_id(self):
		return self.__room_id

	@property
	def name(self):
		return self.__name

	@property
	def owner(self):
		return User(self.__owner)

	@property
	def admins(self):
		return map(lambda x: User(x), self.__admins)

	def video_queue(self):
		c = database.cursor()
		c.execute('''
			SELECT item_id
			FROM room_queue
			WHERE room_id = ?
			ORDER BY rank ASC'''
			, (self.room_id,))
		result_videos = c.fetchall()

		return map(lambda x: Video(x[0]), result_videos)

	def add_video(self, service, url, title, duration, start_time):
		c = database.cursor()
		c.execute('''
			SELECT rank
			FROM room_queue
			WHERE room_id = ?
			ORDER BY rank DESC
			LIMIT 1'''
			, (self.room_id,))
		result_next_rank = c.fetchone()

		if result_next_rank:
			next_rank = result_next_rank[0] + 1.0
		else:
			next_rank = 0.0

		video_id = Video.create(
			self.room_id
			, next_rank
			, service
			, url
			, title
			, duration
			, start_time)

		return Video(video_id)

