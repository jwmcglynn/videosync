VideoSync
=========

![Screenshot](http://i.imgur.com/yBRf0KL.png)

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
`pip install pyopenssl`

If that fails to install, as it does on Windows when this was written, install them manually from these locations:

* pyWin32: http://www.lfd.uci.edu/~gohlke/pythonlibs/#pywin32
* pyOpenSSL: https://pypi.python.org/pypi/pyOpenSSL

### Create the database

**WARNING: This will delete the previous database.**    
`python database_create.py -y`

### Setup API keys

1. Copy `site/videosync.cfg.EXAMPLE` to `site/videosync.cfg`
2. Edit it and add your API keys:
	* YouTube v3: https://code.google.com/apis/console

Run Tests
---------

From the "server" directory:    
`nosetests tests`


Start Server for Development
----------------------------

`python videosync.py --webserver`

This starts a webserver on port 8080.  To access the server open a web browser and navigate to [http://localhost:8080/videosync.html](http://localhost:8080/videosync.html).


Start Server for Production
---------------------------

1. Put contents of site/ directory on public webserver.
2. Start videosync as a daemon:    
	`python videosync.py`
