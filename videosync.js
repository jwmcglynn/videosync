String.prototype.format = function() {
    var s = this;
    var i = arguments.length;

    while (i--) {
        s = s.replace(new RegExp('\\{' + i + '\\}', 'gm'), arguments[i]);
    }
    return s;
};

(function() {
	var videosync = this;
	
	var videoStates = {
		UNSTARTED: 0,
		PLAYING: 1,
		PAUSED: 2,
		BUFFERING: 3,
		ENDED: 4
	}
	
	function htmlEncode(text) {
		return $("<div/>").text(text).html();
	}

	function debugPrint(text) {
		var debugBox = $("#debugPrintout");
		var isAtBottom = (debugBox.prop("scrollHeight") - debugBox.scrollTop() == debugBox.height());
		debugBox.append(htmlEncode(text) + "<br>");
		if (isAtBottom) {
			debugBox.scrollTop(debugBox.prop("scrollHeight"));
		}
	}

	function handleError(error) {
	
	}
	
	function handleMessage(messageStr) {
		debugPrint("Got message: " + messageStr);
		message = JSON.parse(messageStr);

		if (message.command) {
			if (message.command == "initialState") {
				// TODO - Handle queuing of instructions
				// message contains video, videoState, position
			} else if (message.command == "updateControl") {
				controller.setHasControl(message.control);
			} else if (message.command == "changeVideo") {
				controller.changeVideo(message.video);
			} else if (message.command == "videoState" && !controller.hasControl) {
				if (message.videoState == videoStates.PLAYING) {
					controller.play();
				} else if (message.videoState == videoStates.PAUSED) {
					controller.pause();
				}
			} else if (message.command == "reportPlaybackPosition" && !controller.hasControl) {
				controller.syncWithTime(message.position);
			}
		}
	}

	var controller = {
		hasControl: false,
		videoService: null,

		setHasControl: function(value) {
			controller.hasControl = value;
			if (controller.hasControl) {
				$("#takeControl").attr('disabled', 'disabled');
			} else {
				$("#takeControl").attr('disabled', '');
			}
		},

		changeVideo: function(url) {
			// TODO: Determine video and load appropriate player.
			controller.videoService = "youtube";
			youtube.loadPlayer();
		},

		play: function() {
			debugPrint("controller.play()");
			youtube.play();
		},

		pause: function() {
			debugPrint("controller.pause()");
			youtube.pause();
		},

		syncWithTime: function(seconds) {
			youtube.syncWithTime(seconds);
		}
	};
	
	var youtube = {
		APIReady: false,
		player: null,
		playerReady: false,
		defaultQuality: null,
		haveControl: false,
		progressReporter: null,
		
		onPlayerReady: function(event) {
			youtube.playerReady = true;
		},
		
		onPlayerPlaybackQualityChange: function(event) {
			youtube.defaultQuality = event.data;
		},
		
		onPlayerStateChange: function(event) {
			if(!controller.hasControl || controller.videoService != "youtube") {
				debugPrint("Don't have control!");
				return;
			}
			/*
				YT.PlayerState.UNSTARTED
				YT.PlayerState.ENDED
				YT.PlayerState.PLAYING
				YT.PlayerState.PAUSED
				YT.PlayerState.BUFFERING
				YT.PlayerState.CUED
			*/
			if (event.data == YT.PlayerState.PLAYING) {
				// TODO: Report time here as well.
				socket.send({command: "videoState", videoState: videoStates.PLAYING});
			} else if (event.data == YT.PlayerState.PAUSED) {
				// TODO: Report time here as well.
				socket.send({command: "videoState", videoState: videoStates.PAUSED});
			} else if (event.data == YT.PlayerState.BUFFERING) {
				socket.send({command: "reportPlaybackPosition", position: youtube.getCurrentTime()});
			} else if (event.data == YT.PlayerState.ENDED) {
				socket.send({command: "videoState", videoState: videoStates.ENDED});
			}
		},
		
		onPlayerError: function(event) {
			
		},
		
		loadPlayer: function() {
			$('<div/>', { id: 'player' }).appendTo('#playerContainer');
			youtube.player = new YT.Player('player', {
				height: '390',
				width: '640',
				videoId: 'zSfqhDnPTiI',
				//playerVars: { 'autoplay': 1 },
				events: {
					'onReady': youtube.onPlayerReady,
					'onPlaybackQualityChange': youtube.onPlayerPlaybackQualityChange,
					'onStateChange': youtube.onPlayerStateChange,
					'onError': youtube.onPlayerError
				}
			});

			clearInterval(youtube.progressReporter);
			youtube.progressReproter = setInterval(function() {
				if (controller.hasControl) {
					socket.send({command: "reportPlaybackPosition", position: youtube.getCurrentTime()});
				}
			}, 500);
		},
		
		loadVideo: function(videoID) {
			var options = {videoId: videoID};
			if(defaultQuality != null)
				options.suggestedQuality = defaultQuality;
			youtube.player.loadVideoById(options);	
		},
		
		play: function() {
			if(youtube.player)
				youtube.player.playVideo()
		},
		
		pause: function() {
			if(youtube.player)
				youtube.player.pauseVideo();
		},
		
		seek: function(seconds) {
			if(youtube.player)
				youtube.player.seekTo(seconds, true);
		},

		syncWithTime: function(seconds) {
			var localTime = youtube.getCurrentTime();
			if (Math.abs(localTime - seconds) > 2.0) {
				debugPrint("Seeking to " + seconds);
				youtube.seek(seconds);
			}
		},
		
		getCurrentTime: function() {
			if(youtube.player)
				return youtube.player.getCurrentTime();
			return 0;
		},
		
		getTotalTime: function() {
			if(youtube.player)
				return youtube.player.getDuration();
			return 0;
		}
	}
	
	window.onYouTubeIframeAPIReady = function() {
		youtube.APIReady = true;
	}

	// Load Youtube Iframe API
	var tag = document.createElement('script');

	tag.src = "https://www.youtube.com/iframe_api";
	var firstScriptTag = document.getElementsByTagName('script')[0];
	firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
	
	// Get WebSocket object
	var websock = null;
	if("WebSocket" in window) {
		websock = WebSocket;
	} else if("MozWebSocket" in window) {
		websock = MozWebSocket;
	} else {
		// Error -- Browser does not support websockets
	}
	
	var socket = {
		sock: null,
		connected: false,
		
		connect: function() {
			if (websock != null && socket.sock == null) { // If websocket is supported and socket not already open
				var websockuri = "ws://" + window.location.hostname + ":9000";
				var newSocket = new websock(websockuri);
		
				if (newSocket) {
					newSocket.onopen = function() {
						socket.sock = newSocket;
						socket.connected = true;
						debugPrint("Socket connected");
					}
					
					newSocket.onerror = function(event) {
						// Error -- Something went wrong with the websocket
						debugPrint("Socket error");
					}
			
					newSocket.onclose = function(event) {
						if (socket.sock == newSocket) {
							socket.sock = null;
							socket.connected = false;
							debugPrint("Socket closed");
						}
						// event.wasClean, event.code, event.reason
					}
			
					newSocket.onmessage = function(event) {
						handleMessage(event.data);
					}
				}
			}
		},
		
		send: function(message) {
			if (socket.connected) {
				var messageStr = JSON.stringify(message);
				debugPrint("Sending: " + messageStr);

				socket.sock.send(messageStr);
			} else {
				debugPrint("Error: Could not send message, not connected to server.");
			}
		}
	}
	
	$(document).ready(function() {
		socket.connect();
		
		// Hook up UI.
		$("#takeControl").click(function() {
			socket.send({command: "takeControl"});
		});
		$("#loadVideo").click(function() {
			if (!controller.hasControl) {
				debugPrint("Don't have control!");
			} else {
				socket.send({command: "changeVideo", video: "http://example.com"});
			}
		});
	});
})();
