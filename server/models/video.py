import database

class NoSuchVideoException(Exception):
	pass

class Video:
	def __init__(self, item_id):
		c = database.cursor()

		# Load video.
		c.execute(
			'''
			SELECT room_id
				, rank
				, service
				, url
				, title
				, duration
				, start_time
			FROM room_queue
			WHERE item_id = ?
			LIMIT 1'''
			, (item_id,))
		result_video = c.fetchone()

		if result_video is None:
			raise NoSuchVideoException

		self.__item_id = item_id
		self.__room_id = result_video[0]
		self.__rank = result_video[1]
		self.__service = result_video[2]
		self.__url = result_video[3]
		self.__title = result_video[4]
		self.__duration = result_video[5]
		self.__start_time = result_video[6]

	def __eq__(self, other):
		return self.__item_id == other.__item_id

	@staticmethod
	def create(room_id, rank, service, url, title, duration, start_time):
		c = database.cursor()
		c.execute('''
			INSERT INTO room_queue (
				room_id
				, rank
				, service
				, url
				, title
				, duration
				, start_time)
			VALUES(?, ?, ?, ?, ?, ?, ?)'''
			, (room_id, rank, service, url, title, duration, start_time))

		item_id = c.lastrowid
		database.commit()

		return item_id

	def remove(self):
		c = database.cursor()

		c.execute('''
			DELETE FROM room_queue
			WHERE item_id = ?'''
			, (self.item_id,))

		database.commit()

	def update_rank(self, rank):
		self.__rank = rank

		c = database.cursor()
		c.execute('''
			UPDATE room_queue
			SET rank = ?
			WHERE item_id = ?'''
			, (rank, self.item_id))

		database.commit()

	@property
	def item_id(self):
		return self.__item_id

	@property
	def room_id(self):
		return self.__room_id

	@property
	def rank(self):
		return self.__rank

	@property
	def service(self):
		return self.__service

	@property
	def url(self):
		return self.__url

	@property
	def title(self):
		return self.__title

	@property
	def duration(self):
		return self.__duration

	@property
	def start_time(self):
		return self.__start_time


