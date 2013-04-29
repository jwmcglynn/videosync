var k_sync_threshold = 1.0;

String.prototype.format = function() {
	var s = this;
	var i = arguments.length;

	while (i--) {
		s = s.replace(new RegExp('\\{' + i + '\\}', 'gm'), arguments[i]);
	}
	return s;
};

function query_variable(url, name) {
	var parser = document.createElement("a");
	parser.href = url;

	var query = parser.search.substring(1);
	var vars = query.split("&");
	for (var i = 0; i < vars.length; i++) {
		var pair = vars[i].split("=");
		if (decodeURIComponent(pair[0]) == name) {
			return decodeURIComponent(pair[1]);
		}
	}

	return null;
}

function format_time(seconds) {
	var hours = Math.floor(seconds / 3600);
	seconds -= hours * 3600;
	var minutes = Math.floor(seconds / 60);
	seconds -= minutes * 60;

	function prefix(num) {
		if (num < 10) return "0" + num;
		else return num;
	}

	if (hours) {
		return "{0}:{1}:{2}".format(hours, prefix(minutes), prefix(seconds));
	} else {
		return "{0}:{1}".format(minutes, prefix(seconds));
	}
}

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
			if (message.command == "room_joined") {
				controller.connected = true;
				controller.username = message.username;
			} else if (message.command == "initial_users") {
				users.initialize(message.users);
			} else if (message.command == "initial_queue") {
				queue.initialize(message.queue);
			} else if (message.command == "guest_username_changed") {
				users.rename(message.old_username, message.username);
			} else if (message.command == "user_connect") {
				users.add(message.username);
			} else if (message.command == "user_disconnect") {
				users.remove(message.username);
			} else if (message.command == "set_moderator") {
				users.set_moderator_name(message.username);
				controller.set_moderator(controller.username == message.username);
			} else if (message.command == "change_video") {
				queue.active_video(message.video);
				controller.change_video(message.video);
			} else if (message.command == "video_state" && !controller.is_moderator) {
				if (message.state == "playing") {
					controller.play(message.position);
				} else if (message.state == "paused") {
					controller.pause(message.position);
				}
			} else if (message.command == "add_queue_video") {
				queue.add(message.video);
			} else if (message.command == "move_queue_video" && !controller.is_moderator) {
				queue.move(message.item_id, message.index);
			} else if (message.command == "remove_queue_video" && !controller.is_moderator) {
				queue.remove(message.item_id);
			} else if (message.command == "command_error") {
				// TODO
				debugPrint("Command error {0}: {1}".format(message.context, message.reason));
			}
		}
	}

	var users = {
		data: [],
		moderator: null,

		initialize: function(initial_users) {
			// TODO: Update UI.
			users.data = initial_users;
			users.update_ui();
		},

		add: function(username) {
			users.data.push(username);
			users.update_ui();
		},

		remove: function(username) {
			var index = users.data.indexOf(username);
			if (index != -1) {
				users.data.splice(index, 1);
			} else {
				debugPrint("Error: Could not find user to remove.");
			}

			users.update_ui();
		},

		rename_user: function(old_username, username) {
			var index = users.data.indexOf(old_username);
			if (index != -1) {
				users.data[index] = username;
			} else {
				debugPrint("Error: Could not find user to rename.");
			}

			users.update_ui();
		},

		set_moderator_name: function(username) {
			users.moderator = username;
		},

		update_ui: function() {
			// TODO: Better UI.
			$("#users").text("Users: " + users.data.join(", "));
		}
	};

	var queue = {
		data: [],
		current_index: [],
		html_entities: [],

		initialize: function(initial_queue) {
			for (var i = 0; i < initial_queue.length; ++i) {
				queue.add(initial_queue[i]);
			}
		},

		update_moderator: function() {
			if (controller.is_moderator) {
				$("#queue").sortable({
					update: function(e, ui) {
						socket.send(
							{command: "move_video"
							, item_id: ui.item.attr("item_id")
							, index: ui.item.index()});
					}
				});
				$("#queue").disableSelection();
			} else {
				$("#queue").sortable("cancel");
			}
		},

		active_video: function(video) {
			var index = -1;
			for (var i = 0; i < queue.data.length; ++i) {
				if (queue.data[i].item_id == video.item_id) {
					index = i;
					break;
				}
			}

			if (index != -1) {
				queue.current_index = index;
			} else {
				debugPrint("Error: Could not find video to select.");
			}
		},

		next_video_id: function() {
			var next_index = queue.current_index + 1;
			if (next_index >= queue.data.length) {
				next_index = 0;
			}

			return queue.data[next_index].item_id;
		},

		add: function(video) {
			queue.data.push(video);

			var $entity = $("<li class='ui-state-default'>");
			$entity.attr("item_id", video.item_id);
			$entity.append($("<span class='title'>").text(video.title));
			$entity.append($("<span class='time'>").text(format_time(video.duration)));
			// TODO: Remove button.

			queue.html_entities.push($entity);
			$("#queue").append($entity);
			if (controller.is_moderator) {
				$("#queue").sortable("refresh");
			}
		},

		remove: function(item_id) {
			var index = -1;
			for (var i = 0; i < queue.data.length; ++i) {
				if (queue.data[i].item_id == item_id) {
					index = i;
					break;
				}
			}

			if (index != -1) {
				queue.data.splice(index, 1);
				$video = queue.html_entities.splice(index, 1)[0];
				$video.remove();
				if (controller.is_moderator) {
					$("#queue").sortable("refresh");
				}
			} else {
				debugPrint("Error: Could not find video to remove.");
			}
		},

		move: function(item_id, index) {
			var old_index = -1;
			for (var i = 0; i < queue.data.length; ++i) {
				if (queue.data[i].item_id == item_id) {
					old_index = i;
					break;
				}
			}

			if (old_index != -1) {
				var video = queue.data.splice(old_index, 1)[0];
				queue.data.splice(index, 0, video);

				var $video = queue.html_entities.splice(old_index, 1)[0];
				queue.html_entities.splice(index, 0, $video);
				$video.remove();

				if (index == 0) {
					$("#queue").prepend($video);
				} else {
					queue.html_entities[index - 1].after($video);
				}

				if (controller.is_moderator) {
					$("#queue").sortable("refresh");
				}
			} else {
				debugPrint("Error: Could not find video to move.");
			}
		}
	};

	var controller = {
		connected: false,
		is_moderator: false,
		username: null,

		current_player: null,

		set_moderator: function(value) {
			var was_moderator = controller.is_moderator;
			controller.is_moderator = value;
			if (controller.is_moderator) {
				$("#nextVideo").removeAttr("disabled");
			} else {
				$("#nextVideo").attr("disabled", "disabled");
			}

			if (was_moderator != controller.is_moderator) {
				queue.update_moderator();
			}
		},

		change_video: function(video) {
			if (controller.current_player) {
				controller.current_player.unload();
			}

			if (video.service == "youtube") {
				controller.current_player = youtube;
			} else {
				controller.current_player = null;
				debugPrint("Invalid video service {0}".format(video.service));
			}

			if (controller.current_player) {
				controller.current_player.load(video);
			}
		},

		play: function(seconds) {
			youtube.play(seconds);
		},

		pause: function(seconds) {
			youtube.pause(seconds);
		},

		sync_with_time: function(seconds) {
			youtube.sync_with_time(seconds);
		}
	};
	
	var youtube = {
		APIReady: false,
		player: null,
		playerReady: false,
		defaultQuality: null,
		haveControl: false,
		progressReporter: null,
		lastPlaybackPosition: NaN,
		lastVideoState: videoStates.UNSTARTED,
		
		on_player_ready: function(event) {
			youtube.playerReady = true;
		},
		
		on_playback_quality_change: function(event) {
			youtube.defaultQuality = event.data;
		},
		
		on_player_state_change: function(event) {
			if (controller.current_player != youtube) {
				debugPrint("Youtube not playing!");
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
			var state = videoStates.UNSTARTED;
			var time = youtube.getCurrentTime();
			if (event.data == YT.PlayerState.PLAYING) {
				state = videoStates.PLAYING;
			} else if (event.data == YT.PlayerState.PAUSED) {
				if (youtube.getCurrentTime() + k_sync_threshold >= youtube.getTotalTime()) {
					// At the end of video we get a PAUSED->ENDED.  Ignore the PAUSED is we're close to the end.
					// TODO: Better handling.
					return;
				}
				state = videoStates.PAUSED;
			} else if (event.data == YT.PlayerState.BUFFERING) {
				state = videoStates.PLAYING;
			} else if (event.data == YT.PlayerState.ENDED) {
				state = videoStates.PLAYING;
			}

			if (state != youtube.lastVideoState
					|| time != youtube.lastPlaybackPosition) {
				if (controller.is_moderator) {
					socket.send(
						{command: "update_video_state"
						, position: time
						, "state": (state == videoStates.PLAYING ? "playing" : "paused")});
					youtube.lastPlaybackPosition = time;
				}
				youtube.lastVideoState = state;
			}
		},
		
		on_player_error: function(event) {
			
		},
		
		load: function(video) {
			$('<div/>', { id: 'player' }).appendTo('#playerContainer');
			youtube.player = new YT.Player('player', {
				height: '390',
				width: '640',
				videoId: query_variable(video.url, "v"),
				//playerVars: { 'autoplay': 1 },
				events: {
					'onReady': youtube.on_player_ready,
					'onPlaybackQualityChange': youtube.on_playback_quality_change,
					'onStateChange': youtube.on_player_state_change,
					'onError': youtube.on_player_error
				}
			});

			clearInterval(youtube.progressReporter);
			youtube.progressReporter = setInterval(function() {
				var time = youtube.getCurrentTime();
				if (controller.is_moderator && youtube.lastPlaybackPosition != time) {
					socket.send(
						{command: "update_video_state"
						, position: time
						, "state": (youtube.lastVideoState == videoStates.PLAYING ? "playing" : "paused")});
					youtube.lastPlaybackPosition = time;
				}
			}, 500);
		},

		unload: function() {
			clearInterval(youtube.progressReporter);
			youtube.player = null;
			youtube.playerReady = false;
			$("#playerContainer").html("");
		},
		
		loadVideo: function(videoID) {
			var options = {videoId: videoID};
			if(defaultQuality != null) {
				options.suggestedQuality = defaultQuality;
			}
			youtube.player.loadVideoById(options);	
		},
		
		play: function(seconds) {
			if (youtube.playerReady) {
				if (youtube.lastVideoState == videoStates.PLAYING) {
					youtube.sync_with_time(seconds);
				} else {
					if (seconds != 0) {
						youtube.seek(seconds);
					}

					if (youtube.player.playVideo) {
						youtube.player.playVideo();
					}
				}
			}
		},
		
		pause: function(seconds) {
			if (youtube.playerReady) {
				youtube.player.pauseVideo();
				youtube.seek(seconds);
			}
		},
		
		seek: function(seconds) {
			if (youtube.playerReady) {
				youtube.player.seekTo(seconds, true);
			}
		},

		sync_with_time: function(seconds) {
			var localTime = youtube.getCurrentTime();
			if (Math.abs(localTime - seconds) > k_sync_threshold) {
				debugPrint("Seeking to " + seconds);
				youtube.seek(seconds);
			}
		},
		
		getCurrentTime: function() {
			if (youtube.playerReady && youtube.player.getCurrentTime) {
				return youtube.player.getCurrentTime();
			}
			return 0;
		},
		
		getTotalTime: function() {
			if (youtube.playerReady && youtube.player.getDuration) {
				return youtube.player.getDuration();
			}
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
				var websockuri = "ws://" + window.location.hostname + ":9000/room/0";
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
		$("#nextVideo").click(function() {
			socket.send({command: "select_video", item_id: queue.next_video_id()});
		});
		$("#addVideo").click(function() {
			var urlField = $("#videoURL");
			socket.send({command: "add_video", url: urlField.val()});
			urlField.val("");
		});
	});
})();
