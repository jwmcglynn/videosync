String.prototype.format = function() {
	var s = this;
	var i = arguments.length;

	while (i--) {
		s = s.replace(new RegExp("\\{" + i + "\\}", "gm"), arguments[i]);
	}
	return s;
};

(function($, sr) {
	// debouncing function from John Hann
	// http://unscriptable.com/index.php/2009/03/20/debouncing-javascript-methods/
	var debounce = function(func, threshold, execAsap) {
		var timeout;

		return function debounced() {
				var obj = this, args = arguments;
				function delayed() {
						if (!execAsap)
								func.apply(obj, args);
						timeout = null;
				};

				if (timeout)
						clearTimeout(timeout);
				else if (execAsap)
						func.apply(obj, args);

				timeout = setTimeout(delayed, threshold || 100);
		};
	}

	// smartresize 
	jQuery.fn[sr] = function(fn) { return fn ? this.bind("resize", debounce(fn)) : this.trigger(sr); };
})(jQuery, "smartresize");

(function() {
	var videosync = this;
	
	var videoStates = {
		UNSTARTED: 0,
		PLAYING: 1,
		PAUSED: 2,
		BUFFERING: 3,
		ENDED: 4
	}

	var SYNC_THRESHOLD = 1.0;
	var ASPECT_RATIO = 640.0 / 390.0;
	var MINIMUM_QUEUE_HEIGHT = 200.0;
	var MINIMUM_WIDTH = 320;
	
	function html_encode(text) {
		return $("<div/>").text(text).html();
	}

	function debug_print(text) {
		var debugBox = $("#debug");
		var isAtBottom = (debugBox.prop("scrollHeight") - debugBox.scrollTop() == debugBox.height());
		debugBox.append(html_encode(text) + "<br>");
		if (isAtBottom) {
			debugBox.scrollTop(debugBox.prop("scrollHeight"));
		}
	}

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

	function handle_error(error) {
	
	}
	
	function handle_message(messageStr) {
		debug_print("Got message: " + messageStr);
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
				debug_print("Command error {0}: {1}".format(message.context, message.reason));
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
				debug_print("Error: Could not find user to remove.");
			}

			users.update_ui();
		},

		rename_user: function(old_username, username) {
			var index = users.data.indexOf(old_username);
			if (index != -1) {
				users.data[index] = username;
			} else {
				debug_print("Error: Could not find user to rename.");
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
		current_index: -1,
		html_entities: [],

		initialize: function(initial_queue) {
			for (var i = 0; i < initial_queue.length; ++i) {
				queue.add(initial_queue[i]);
			}
		},

		update_moderator: function() {
			var $queue = $("#queue");

			if (controller.is_moderator) {
				$queue.addClass("moderator");
				$queue.sortable({
					update: function(e, ui) {
						socket.send(
							{command: "move_video"
							, item_id: ui.item.attr("item_id")
							, index: ui.item.index()});
					}
				});
				$queue.disableSelection();
			} else {
				$queue.removeClass("moderator");
				$queue.sortable("cancel");
				$queue.find(".show_on_hover").hide();
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

			if (queue.current_index != -1 && queue.html_entities[queue.current_index]) {
				queue.html_entities[queue.current_index].switchClass("highlighted", "", 200);
			}

			if (index != -1) {
				queue.current_index = index;
				queue.html_entities[index].switchClass("", "highlighted", 200);
			} else {
				debug_print("Error: Could not find video to select.");
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
			var $play_button = $("<span class='play moderator_controls'>").html("<img src='play.svg' width='20' height='20'>").css("opacity", 0);
			$entity.append($play_button);
			$entity.append($("<span class='title'>").append($("<a>").text(video.title).attr({href: video.url, target: "_blank"})));
			$entity.append($("<span class='time'>").text(format_time(video.duration)));
			var $remove_button = $("<span class='remove moderator_controls'>").html("<img src='delete.svg' width='20' height='20'>").hide();
			$entity.append($remove_button);

			$entity.hover(
				function() {
					if (controller.is_moderator) {
						$(this).switchClass("", "hover", 200);
						$(this).find(".moderator_controls").fadeTo(200, 1);
					}
				},
				function () {
					$(this).switchClass("hover", "", 200);
					$(this).find(".moderator_controls").fadeTo(200, 0);
				});

			$play_button.click(
				function() {
					if (controller.is_moderator) {
						socket.send(
								{command: "select_video"
								, item_id: video.item_id});
					}
				});

			$remove_button.click(
				function() {
					if (controller.is_moderator) {
						$entity.slideUp({
							done: function() {
								queue.remove(video.item_id);
							}});
					
						socket.send(
								{command: "remove_video"
								, item_id: video.item_id});
					}
				});

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
				debug_print("Error: Could not find video to remove.");
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
				debug_print("Error: Could not find video to move.");
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

			if (was_moderator != controller.is_moderator) {
				queue.update_moderator();
			}
		},

		change_video: function(video) {
			var autoplay = false;
			if (controller.current_player) {
				autoplay = controller.current_player.lastVideoState == videoStates.PLAYING;
				controller.current_player.unload();
			}

			if (video.service == "youtube") {
				controller.current_player = youtube;
			} else {
				controller.current_player = null;
				debug_print("Invalid video service {0}".format(video.service));
			}


			if (controller.current_player) {
				controller.current_player.load(video, autoplay);
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
		},

		resize_video: function() {
			var $queue = $("#queue_container");
			var $controls = $("#controls_container");

			var width = $(window).width() - $("#sidebar").outerWidth();
			if (width <= MINIMUM_WIDTH) {
				width = MINIMUM_WIDTH;
			}

			var height = width / ASPECT_RATIO;
			if ($(window).height() - height < MINIMUM_QUEUE_HEIGHT + $controls.outerHeight()) {
				height = $(window).height() - MINIMUM_QUEUE_HEIGHT - $controls.outerHeight();
				width = height * ASPECT_RATIO;
			}

			$queue.height($(window).height() - height - $controls.outerHeight());
			$("#player_container").height(height);

			if (controller.current_player) {
				controller.current_player.resize(width, height);
			}
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
		is_autoplay: false,
		start_time: 0.0,
		
		on_player_ready: function(event) {
			youtube.playerReady = true;

			if (youtube.is_autoplay) {
				if (youtube.start_time != 0) {
					youtube.seek(youtube.start_time);
				}

				youtube.player.playVideo();
			}
		},
		
		on_playback_quality_change: function(event) {
			youtube.defaultQuality = event.data;
		},
		
		on_player_state_change: function(event) {
			if (controller.current_player != youtube) {
				debug_print("Youtube not playing!");
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
				if (youtube.getCurrentTime() + SYNC_THRESHOLD >= youtube.getTotalTime()) {
					// At the end of video we get a PAUSED->ENDED.  Ignore the PAUSED is we're close to the end.
					// TODO: Better handling.
					return;
				}
				state = videoStates.PAUSED;
			} else if (event.data == YT.PlayerState.BUFFERING) {
				state = videoStates.PLAYING;
			} else if (event.data == YT.PlayerState.ENDED) {
				state = videoStates.PLAYING;

				if (controller.is_moderator) {
					socket.send(
						{command: "select_video"
						, item_id: queue.next_video_id()});
				}
			} else if (event.data == YT.PlayerState.UNSTARTED) {
				state = youtube.is_autoplay ? videoStates.PLAYING : videoStates.PAUSED;
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
		
		load: function(video, autoplay) {
			youtube.is_autoplay = autoplay;
			youtube.start_time = video.start_time;

			$container = $("#player_container");
			$container.append($("<div>", {id: "player"}));
			youtube.player = new YT.Player("player", {
				height: $container.height(),
				width: $container.height() * ASPECT_RATIO,
				videoId: query_variable(video.url, "v"),
				events: {
					"onReady": youtube.on_player_ready,
					"onPlaybackQualityChange": youtube.on_playback_quality_change,
					"onStateChange": youtube.on_player_state_change,
					"onError": youtube.on_player_error
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
			$("#player_container").html("");
		},

		resize: function(width, height) {
			var video = $("#player_container iframe");
			video.width(width).height(height);
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
			if (Math.abs(localTime - seconds) > SYNC_THRESHOLD) {
				debug_print("Seeking to " + seconds);
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
	$.getScript("https://www.youtube.com/iframe_api");

	// Get WebSocket object
	var websock = null;
	if ("WebSocket" in window) {
		websock = WebSocket;
	} else if ("MozWebSocket" in window) {
		websock = MozWebSocket;
	} else {
		debug_print("Browser does not support websockets.");
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
						debug_print("Socket connected");
					}
					
					newSocket.onerror = function(event) {
						// Error -- Something went wrong with the websocket
						debug_print("Socket error");
					}
			
					newSocket.onclose = function(event) {
						if (socket.sock == newSocket) {
							socket.sock = null;
							socket.connected = false;
							debug_print("Socket closed");
						}
						// event.wasClean, event.code, event.reason
					}
			
					newSocket.onmessage = function(event) {
						handle_message(event.data);
					}
				}
			}
		},
		
		send: function(message) {
			if (socket.connected) {
				var messageStr = JSON.stringify(message);
				debug_print("Sending: " + messageStr);

				socket.sock.send(messageStr);
			} else {
				debug_print("Error: Could not send message, not connected to server.");
			}
		}
	}

	$(document).ready(function() {
		controller.resize_video();
	});
	
	$(window).load(function() {
		socket.connect();
		
		// Hook up UI.
		$("#add_video").click(function() {
			var url_input = $("#video_url");
			socket.send({command: "add_video", url: url_input.val()});
			url_input.val("");
		});
	});

	$(window).smartresize(function() {
		controller.resize_video();
	});
})();
