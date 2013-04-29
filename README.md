VideoSync
=========

Setup
-----

### Install packages (all platforms)

`pip install autobahn`    
`pip install passlib`    
`pip install nose`    
`pip install google-api-python-client`
`pip install isodate`

### Install additional packages for Windows

`pip install pywin32`

If that fails, as it does at the time of this writing due to poor 64-bit python support, install pywin32 from here: http://www.lfd.uci.edu/~gohlke/pythonlibs/#pywin32

### Create the database

**WARNING: This will delete the previous database.**    
`python database_create.py -y`


Run Tests
---------

From the "server" directory:    
`nosetests tests`


Start Server for Development
----------------------------

`python videosync.py --webserver`


Start Server for Production
---------------------------

1. Put contents of site/ directory on public webserver.

2. Start videosync as a daemon:    
	`python videosync.py`
