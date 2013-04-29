import sqlite3

__connection = None

def connect(database_file):
	global __connection
	if __connection is not None:
		__connection.close()

	__connection = sqlite3.connect(database_file, check_same_thread=False)

def close():
	global __connection
	if __connection is not None:
		__connection.close()

	__connection = None

def cursor():
	global __connection
	return __connection.cursor()

def commit():
	global __connection
	return __connection.commit()
