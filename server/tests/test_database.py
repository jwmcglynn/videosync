from database_create import database_create
import database
import os, os.path

k_database = "test_db.sqlitedb"

class TestDatabase:
	def teardown(self):
		database.close()

		if os.path.exists(k_database):
			os.unlink(k_database)

	def test_create(self):
		database_create(k_database)
		database.connect(k_database)

		assert os.path.exists(k_database)

	def test_database_overwrite(self):
		# Create empty file
		with open(k_database, 'w'):
			pass

		database_create(k_database)
		database.connect(k_database)

		assert os.path.exists(k_database)
