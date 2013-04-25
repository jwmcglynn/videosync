import database
from passlib.apps import custom_app_context as pwd_context

class NoSuchUserException(Exception):
	pass

class User:
	def __init__(self, user_id):
		c = database.cursor()

		# Load room.
		c.execute('''
			SELECT name
			FROM users
			WHERE user_id = ?
			LIMIT 1'''
			, (user_id,))
		result_user = c.fetchone()

		if result_user is None:
			raise NoSuchUserException

		self.__user_id = user_id
		self.__name = result_user[0]

	def __eq__(self, other):
		return self.__user_id == other.__user_id

	@property
	def user_id(self):
		return self.__user_id

	@property
	def name(self):
		return self.__name

	@staticmethod
	def create(name, password):
		password_hashed = pwd_context.encrypt(password)
		c = database.cursor()

		c.execute('''
			INSERT INTO users (
				name
				, password)
			VALUES(?, ?)'''
			, (name, password_hashed))

		user_id = c.lastrowid
		database.commit()

		return user_id

	@staticmethod
	def authenticate(user_id, password):
		c = database.cursor()

		# Load room.
		c.execute('''
			SELECT password
			FROM users
			WHERE user_id = ?
			LIMIT 1'''
			, (user_id,))
		result_user = c.fetchone()

		if result_user is None:
			return False

		return pwd_context.verify(password, result_user[0])

