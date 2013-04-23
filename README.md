VideoSync
=========

Setup
-----

`pip install autobahn`
`pip install passlib`
`pip install nose`

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
