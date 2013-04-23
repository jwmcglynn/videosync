import argparse
import sqlite3
import os, os.path

# Create a new database.  Hilariously destructive; deletes existing database without confirmation or mercy.
def database_create(database_file):
	if os.path.exists(database_file):
		os.unlink(database_file)

	with sqlite3.connect(database_file) as conn:
		c = conn.cursor()

		# List of rooms.
		c.execute('''
			CREATE TABLE rooms (
				room_id INTEGER PRIMARY KEY
				, name TEXT NOT NULL
				, owner INTEGER NOT NULL)''')
		c.execute('''
			INSERT INTO rooms (
				room_id
				, name
				, owner)
			VALUES(?, ?, ?)'''
			, (0, "Fireworks", 0))

		# List of users.
		c.execute('''
			CREATE TABLE users (
				user_id INTEGER PRIMARY KEY
				, name TEXT NOT NULL
				, password TEXT NOT NULL)''')
		c.execute('''
			INSERT INTO users (
				user_id
				, name
				, password)
			VALUES(?, ?, ?)'''
			, (0, "System", ""))

		# Admins for each room.
		c.execute('''
			CREATE TABLE room_admins (
				room_id INTEGER NOT NULL
				, admin_id INTEGER NOT NULL)''')
		c.execute('''
			CREATE INDEX room_admins_index
				ON room_admins (room_id)''')

		# Queue for each room.  Since we want to allow reordering the list just store it as a JSON blob.
		c.execute('''
			CREATE TABLE room_queue (
				item_id INTEGER PRIMARY KEY
				, room_id INTEGER NOT NULL
				, rank REAL NOT NULL
				, service TEXT NOT NULL
				, url TEXT NOT NULL
				, title TEXT NOT NULL
				, duration INTEGER NOT NULL
				, start_time INTEGER NOT NULL)''')
		c.execute('''
			CREATE INDEX room_queue_rank
				ON room_queue (
					room_id
					, rank ASC)''')

		conn.commit()

if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("-y", "--yes", help="Confirm creating databases", action="store_true")
	args = parser.parse_args()
	
	if args.yes:
		database_create("videosync.sqlitedb")
	else:
		print "WARNING: This will wipe the database.  To confirm please pass the '-y' option."