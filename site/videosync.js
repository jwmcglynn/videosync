String.prototype.format = function() {
	var s = this;
	var i = arguments.length;

	while (i--) {
		s = s.replace(new RegExp("\\{" + i + "\\}", "gm"), arguments[i]);
	}
	return s;
};

function lnb() {
	$("body").css("font-family", "'Comic Sans MS', cursive");
}

function debug() {
	$("#debug").show();
}

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

	var SYNC_THRESHOLD = 2.0;
	var ASPECT_RATIO = 640.0 / 390.0;
	var MINIMUM_BOTTOM_HEIGHT = 200.0;
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
				controller.room_joined(message.username);
			} else if (message.command == "initial_users") {
				users.initialize(message.users);
			} else if (message.command == "initial_queue") {
				queue.initialize(message.queue);
			} else if (message.command == "guest_username_changed") {
				users.rename(message.old_username, message.username);
				if (controller.username == message.old_username) {
					controller.username = message.username;
				}
			} else if (message.command == "user_connect") {
				users.add(message.username);
			} else if (message.command == "user_disconnect") {
				users.remove(message.username);
			} else if (message.command == "set_moderator") {
				controller.set_moderator(controller.username == message.username);
				users.set_moderator_name(message.username);
			} else if (message.command == "change_video") {
				queue.select_video(message.video);
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
		moderator: null,

		initialize: function(initial_users) {
			for (var i = 0; i < initial_users.length; ++i) {
				users.add(initial_users[i]);
			}
		},

		from_username: function(username) {
			var $result = $("#users").find("[data-username='{0}']".format(username));
			if ($result.length) return $($result[0]);
			else return null;
		},

		add: function(username) {
			var $entity = $("<li class='ui-state-default'>");
			$entity.attr("data-username", username);

			var $moderator_tag = $("<span class='moderator_tag'>").html("<img src='moderator.svg' width='20' height='20'>");
			$entity.append($moderator_tag);

			$username = $("<span class='username'>");
			users.format_username($username, username);
			$entity.append($username);

			var $make_moderator = $("<span class='make_moderator moderator_controls'>").html("<img src='make_moderator.svg' width='20' height='20'>").hide();
			$entity.append($make_moderator);

			if (controller.username == username) {
				$entity.addClass("self");
			}

			$entity.hover(
				function() {
					if (controller.is_moderator) {
						$(this).switchClass("", "hover", 200);
						$(this).find(".moderator_controls").fadeTo(200, 1);
					}
				},
				function() {
					$(this).switchClass("hover", "", 200);
					$(this).find(".moderator_controls").fadeTo(200, 0);
				});
			$make_moderator.click(
				function() {
					if (controller.is_moderator) {
						socket.send(
								{command: "give_moderator"
								, username: $entity.attr("data-username")});
					}
				});

			$("#users").append($entity);
		},

		remove: function(username) {
			var $entity = users.from_username(username);
			if ($entity) {
				$entity.remove();
			} else {
				debug_print("Error: Could not find user to remove.");
			}
		},

		rename: function(old_username, username) {
			var $entity = users.from_username(old_username);
			if ($entity) {
				$entity.attr("data-username", username);
				users.format_username($entity.find(".username"), username);
			} else {
				debug_print("Error: Could not find user to rename.");
			}
		},

		format_username: function($entity, username) {
			if (username.length > 2 && username[0] == "*") {
				$entity.text(username.substring(1, username.length - 1));
				$entity.addClass("guest");
			} else {
				$entity.text(username);
			}
		},

		set_moderator_name: function(username) {
			var $users = $("#users");
			if (controller.is_moderator) {
				$users.addClass("moderator");
			} else {
				$users.removeClass("moderator");
			}

			if (users.moderator) {
				users.moderator.removeClass("moderator");
			}

			users.moderator = users.from_username(username);
			if (users.moderator) {
				users.moderator.addClass("moderator");
			}
		}
	};

	var queue = {
		current: null,

		initialize: function(initial_queue) {
			for (var i = 0; i < initial_queue.length; ++i) {
				queue.add(initial_queue[i]);
			}
		},

		current_index: function() {
			if (queue.current) {
				return queue.current.index();
			} else {
				return 0;
			}
		},

		from_item_id: function(item_id) {
			var $result = $("#queue").find("[data-item_id='{0}']".format(item_id));
			if ($result.length) return $($result[0]);
			else return null;
		},

		update_moderator: function() {
			var $queue = $("#queue");

			if (controller.is_moderator) {
				$queue.removeClass("not_moderator");
				$queue.addClass("moderator");
				$queue.sortable({
					update: function(e, ui) {
						socket.send(
							{command: "move_video"
							, item_id: ui.item.attr("data-item_id")
							, index: ui.item.index()});
					}
				});
				$queue.disableSelection();
			} else {
				$queue.removeClass("moderator");
				$queue.addClass("not_moderator");
				$queue.sortable("cancel");
				$queue.find(".show_on_hover").hide();
			}
		},

		select_video: function(video) {
			if (queue.current) {
				queue.current.switchClass("highlighted", "", 200);
			}

			queue.current = queue.from_item_id(video.item_id);
			if (queue.current) {
				queue.current.switchClass("", "highlighted", 200);
			} else {
				debug_print("Error: Could not find video to select.");
			}
		},

		next_video_id: function() {
			var $children = $("#queue").children();
			var next_index = queue.current_index() + 1;
			if (next_index >= $children.length) {
				next_index = 0;
			}

			return $children.eq(next_index).attr("data-item_id");
		},

		add: function(video) {
			var $entity = $("<li class='ui-state-default'>");
			var $div = $("<div>");
			$entity.append($div);
			$entity.attr("data-item_id", video.item_id);
			var $play_button = $("<div class='play moderator_controls'>").html("<img src='play.svg' width='20' height='20'>").css("opacity", 0);
			$div.append($play_button);
			$div.append($("<div class='title'>").append($("<a>").text(video.title).attr({href: video.url, target: "_blank", title: video.title})));
			var $remove_button = $("<div class='remove moderator_controls'>").html("<img src='delete.svg' width='20' height='20'>").hide();
			$div.append($remove_button);
			$div.append($("<div class='time'>").text(format_time(video.duration)));

			$entity.hover(
				function() {
					if (controller.is_moderator) {
						$(this).switchClass("", "hover", 200);
						$(this).find(".play").fadeTo(200, 1);
						$(this).find(".remove").fadeIn(200);
					}
				},
				function() {
					$(this).switchClass("hover", "", 200);
					$(this).find(".play").fadeTo(200, 0);
					$(this).find(".remove").fadeOut(200);
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

			$("#queue").append($entity);
			if (controller.is_moderator) {
				$("#queue").sortable("refresh");
			}
		},

		remove: function(item_id) {
			var $element = queue.from_item_id(item_id);
			if ($element) {
				$element.remove();
				if (controller.is_moderator) {
					$("#queue").sortable("refresh");
				}
			} else {
				debug_print("Error: Could not find video to remove.");
			}
		},

		move: function(item_id, index) {
			var $element = queue.from_item_id(item_id);
			if ($element) {
				$element.remove();

				if (index == 0) {
					$("#queue").prepend($element);
				} else {
					$("#queue").children().eq(index - 1).after($element);
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

		room_joined: function(username) {
			controller.connected = true;
			controller.username = username;

			if (username.length && username[0] == "*") {
				$("#guest_name_change").show();
			}
		},

		set_moderator: function(value) {
			var was_moderator = controller.is_moderator;
			controller.is_moderator = value;

			if (was_moderator != controller.is_moderator) {
				queue.update_moderator();
			}
		},

		change_video: function(video) {
			var new_player = null;

			if (video.service == "youtube") {
				new_player = youtube;
			} else {
				new_player = null;
				debug_print("Invalid video service {0}".format(video.service));
			}

			if (controller.current_player) {
				var autoplay = controller.current_player.lastVideoState == videoStates.PLAYING;
				
				if (controller.current_player == new_player) {
					controller.current_player.switch_video(video, autoplay);
				} else {
					controller.current_player.unload();
					controller.current_player = new_player;
					controller.current_player.load(video, autoplay);
				}
			} else {
				controller.current_player = new_player;
				controller.current_player.load(video, false);
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
			var $bottom = $("#bottom");

			var width = $(window).width() - $("#sidebar").outerWidth();
			if (width <= MINIMUM_WIDTH) {
				width = MINIMUM_WIDTH;
			}

			var height = width / ASPECT_RATIO;
			if ($(window).height() - height < MINIMUM_BOTTOM_HEIGHT) {
				height = $(window).height() - MINIMUM_BOTTOM_HEIGHT;
				width = height * ASPECT_RATIO;
			}

			$bottom.height($(window).height() - height);
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
				playerVars: {rel: 0},
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
		
		switch_video: function(video, autoplay) {
			var options = {
				videoId: query_variable(video.url, "v")
				, startSeconds: video.start_time};
			youtube.player.loadVideoById(options);
			if (!autoplay) {
				youtube.player.pauseVideo();
			}
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
				youtube.seek(seconds);
				youtube.player.pauseVideo();
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
		var add_video = function() {
			var input = $("#video_url");
			socket.send({command: "add_video", url: input.val()});
			input.val("");
		}
		
		$("#add_video").click(add_video);
		$("#video_url").keydown(function(e) {
			if (e.keyCode == 13) {
				e.preventDefault();
				add_video();
			}
		});

		var change_username = function() {
			var input = $("#username");
			socket.send({command: "guest_username", username: input.val()});
			input.val("");
			$("#guest_name_change").hide()
		}

		$("#change_name").click(change_username);
		$("#username").keydown(function(e) {
			if (e.keyCode == 13) {
				e.preventDefault();
				change_username();
			}
		});
	});

	$(window).smartresize(function() {
		controller.resize_video();
	});
})();
