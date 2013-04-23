from models.user import User, NoSuchUserException
from database_create import database_create
import database
import os

from nose.tools import *

k_database = "test_db.sqlitedb"

class TestUser:
	@classmethod
	def setup_class(cls):
		database_create(k_database)
		database.connect(k_database)

	@classmethod
	def teardown_class(cls):
		database.close()
		os.unlink(k_database)

	@raises(NoSuchUserException)
	def test_invalid_user(self):
		invalid = User(1337)

	def create_internal(self, user, password):
		user_id = User.create(user, password)

		assert User.authenticate(user_id, password)
		assert not User.authenticate(user_id, "otherpassword")
		assert not User.authenticate(user_id, user)

		recreated_user = User(user_id)
		assert_equals(user_id, recreated_user.user_id)
		assert_equals(user, recreated_user.name)

	def test_basic(self):
		self.create_internal("testuser", "passw0rd")
		self.create_internal("MEDIBOT", "TOBIDEM")
		self.create_internal("Quacker", "quackquackspiders")

	def test_builtin_account(self):
		system = User(0)

		assert_equals(0, system.user_id)
		assert_equals("System", system.name)