(function() {
	var videosync = this;
	
	var videoStates = {
		UNSTARTED: 0,
		PLAYING: 1,
		PAUSED: 2,
		BUFFERING: 3,
		ENDED: 4
	}
	
	
	function handleError(error) {
	
	}
	
	function handleMessage(message) {
		
	}
	
	var youtube = {
		APIReady = false,
		player = null,
		playerReady = false,
		defaultQuality = null,
		
		onPlayerReady: function(event) {
			youtube.playerReady = true;
		},
		
		onPlayerPlaybackQualityChange: function(event) {
			youtube.defaultQuality = event.data;
		},
		
		onPlayerStateChange: function(event) {
			if(!state.haveControl || state.videoService != "youtube") {
				return
			}
			/*
				YT.PlayerState.UNSTARTED
				YT.PlayerState.ENDED
				YT.PlayerState.PLAYING
				YT.PlayerState.PAUSED
				YT.PlayerState.BUFFERING
				YT.PlayerState.CUED
			*/
			if(event.data == YT.PlayerState.PLAYING) {
				socket.send({videoState: videoStates.PLAYING});
			} else if(event.data == YT.PlayerState.PAUSED) {
				socket.send({videoState: videoStates.PAUSED});
			} else if(event.data == YT.PlayerState.BUFFERING) {
				
			} else if(event.data == YT.PlayerState.ENDED) {
				socket.send({videoState: videoStates.ENDED});
			}
		},
		
		onPlayerError: function(event) {
			
		}
		
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
		},
		
		loadVideo: function(videoID) {
			var options = {videoId: videoID};
			if(defaultQuality != null)
				options.suggestedQuality = defaultQuality;
			youtube.player.loadVideoById(options);	
		},
		
		play: function() {
			if(player)
				player.playVideo()
		},
		
		pause: function() {
			if(player)
				player.pauseVideo();
		},
		
		seek: function(seconds) {
			if(player)
				player.seekTo(seconds, true);
		},
		
		getCurrentTime: function() {
			if(player)
				return player.getCurrentTime();
			return 0;
		},
		
		getTotalTime: function() {
			if(player)
				return player.getDuration();
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
			if(websock != null && socket.sock == null) { // If websocket is supported and socket not already open
				var sock = null,
					websockuri;
		
				websockuri = "ws://" + window.location.hostname + ":9000";
		
				sock = new websock(websockuri);
		
				if(sock) {
					sock.onopen = function() {
						socket.sock = sock;
						socket.connected = true;
					}
					
					sock.onerror = function(event) {
						// Error -- Something went wrong with the websocket
					}
			
					sock.onclose = function(event) {
						if(socket.sock == sock) {
							socket.sock = null;
							socket.connected = false;
						}
						// event.wasClean, event.code, event.reason
					}
			
					sock.onmessage = function(event) {
						handleMessage(JSON.parse(event.data));
					}
				}
			}
		},
		
		send: function(message) {
			if(socket.connected) {
				socket.sock.send(JSON.stringify(message));
			}
		}
	}
	
	$(document).ready(function() {
		socket.connect();
		
		$("takeControl").click(function() {
			socket.send({command: "takeControl"});
		});
	});
})();
