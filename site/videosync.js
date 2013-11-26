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

$.getScript("jquery.scrollintoview.js");

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
	var error_timeout = null;
	var mutiny_timer = null;
	var mutiny_last_message = null;
	
	function html_encode(text) {
		return $("<div/>").text(text).html();
	}

	function debug_print(text) {
		var debugBox = $("#debug");
		if (debugBox.is(":visible")) {
			var isAtBottom = (debugBox.prop("scrollHeight") - debugBox.scrollTop() == debugBox.height());
			debugBox.append(html_encode(text) + "<br>");
			if (isAtBottom) {
				debugBox.scrollTop(debugBox.prop("scrollHeight"));
			}
		}
	}

	function show_error(message, warning) {
		if (error_timeout) {
			clearInterval(error_timeout);
		}

		var $error = $("#error");

		var effect = function() {
			$error.css({opacity: 1.0, height: "40px"});
			if (warning) {
				$error.addClass("warning");
			} else {
				$error.removeClass("warning");
			}
			$("#error_message").text(message);
			$error.slideDown(200, function() {
				error_timeout = setInterval(function() {
					$error.fadeOut(300);
				}, 4000);
			});
		};

		if ($error.css("display") == "none") {
			$("#error").stop(true);
			effect();
		} else {
			$("#error").stop(true).fadeOut(200, effect);
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

	function update_mutiny_status() {
		$("#vote_mutiny_status").text(
			"({0} of {1}, {2}s remaining)".format(
				mutiny_last_message.votes
				, mutiny_last_message.votes_required
				, Math.round(mutiny_last_message.time_remaining)));
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
				var seconds = parseFloat(message.position);
				if (message.state == "playing") {
					controller.play(seconds);
				} else if (message.state == "paused") {
					controller.pause(seconds);
				}
			} else if (message.command == "add_queue_video") {
				queue.add(message.video);
			} else if (message.command == "move_queue_video" && !controller.is_moderator) {
				queue.move(message.item_id, message.index);
			} else if (message.command == "remove_queue_video" && !controller.is_moderator) {
				queue.remove(message.item_id);

			// Voting.
			} else if (message.command == "vote_skip_status") {
				var status = $("#vote_skip_status");
				status.text("({0} of {1})".format(message.votes, message.votes_required));
				if (message.has_voted) {
					$("#vote_skip").attr("disabled", "disabled");
				}
				status.show();

			} else if (message.command == "vote_skip_complete") {
				$("#vote_skip_status").hide();
				$("#vote_skip").removeAttr("disabled");

			} else if (message.command == "vote_mutiny_status") {
				if (message.has_voted) {
					$("#vote_mutiny").attr("disabled", "disabled");
				}

				if (controller.is_moderator && !mutiny_last_message) {
					$("#vote_mutiny_cancel").show();
					show_error("A mutiny has begun. Quick, smite them!", true);
				}
				
				mutiny_last_message = message;
				clearInterval(mutiny_timer)
				mutiny_timer = setInterval(function() {
					mutiny_last_message.time_remaining -= 1.0;
					if (mutiny_last_message.time_remaining < 0.0) {
						mutiny_last_message.time_remaining = 0.0;
					}
					update_mutiny_status();
				}, 1000);
				update_mutiny_status();
				$("#vote_mutiny_status").show();


			} else if (message.command == "vote_mutiny_complete") {
				$("#vote_mutiny_status").hide();
				$("#vote_mutiny_cancel").hide();
				$("#vote_mutiny").removeAttr("disabled");
				clearInterval(mutiny_timer);
				mutiny_last_message = null;

			} else if (message.command == "command_error") {
				debug_print("Command error {0}: {1}".format(message.context, message.reason));
				show_error(message.reason);

				if (message.context == "guest_username") {
					$("#guest_name_change").show();
				}
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
				queue.current.scrollintoview({
					duration: 800
				});
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

				if (controller.is_moderator) {
					$("#vote_mutiny").hide();
				} else {
					$("#vote_mutiny").show();
				}
			}
		},

		change_video: function(video) {
			var new_player = null;

			if (video.service == "youtube") {
				new_player = youtube;
			} else if (video.service == "vimeo") {
				new_player = vimeo;
			} else {
				new_player = null;
				debug_print("Invalid video service {0}".format(video.service));
			}

			if (controller.current_player) {
				var autoplay = controller.current_player.last_video_state == videoStates.PLAYING;
				
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
			if (controller.current_player) {
				controller.current_player.play(seconds);
			}
		},

		pause: function(seconds) {
			if (controller.current_player) {
				controller.current_player.pause(seconds);
			}
		},

		sync_with_time: function(seconds) {
			if (controller.current_player) {
				controller.current_player.sync_with_time(seconds);
			}
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

			// Resize sidebar.
			$("#queue_container").height($(window).height() - $("#controls_container").outerHeight());
		}
	};
	
	var youtube = {
		APIReady: false,
		player: null,
		player_ready: false,
		default_quality: null,
		progress_reporter: null,
		last_playback_position: NaN,
		last_video_state: videoStates.UNSTARTED,
		is_autoplay: false,
		start_time: 0.0,
		
		on_player_ready: function(event) {
			youtube.player_ready = true;

			if (youtube.is_autoplay) {
				if (youtube.start_time != 0) {
					youtube.seek(youtube.start_time);
				}

				youtube.player.playVideo();
			}
		},
		
		on_playback_quality_change: function(event) {
			youtube.default_quality = event.data;
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
			var time = youtube.get_current_time();
			if (event.data == YT.PlayerState.PLAYING) {
				state = videoStates.PLAYING;
			} else if (event.data == YT.PlayerState.PAUSED) {
				if (youtube.get_current_time() + SYNC_THRESHOLD >= youtube.get_total_time()) {
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

			if (state != youtube.last_video_state
					|| time != youtube.last_playback_position) {
				if (controller.is_moderator) {
					socket.send(
						{command: "update_video_state"
						, position: time
						, "state": (state == videoStates.PLAYING ? "playing" : "paused")});
					youtube.last_playback_position = time;
				}
				youtube.last_video_state = state;
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

			clearInterval(youtube.progress_reporter);
			youtube.progress_reporter = setInterval(function() {
				var time = youtube.get_current_time();
				if (controller.is_moderator && youtube.last_playback_position != time) {
					socket.send(
						{command: "update_video_state"
						, position: time
						, "state": (youtube.last_video_state == videoStates.PLAYING ? "playing" : "paused")});
					youtube.last_playback_position = time;
				}
			}, 500);
		},

		unload: function() {
			clearInterval(youtube.progress_reporter);
			youtube.player = null;
			youtube.player_ready = false;
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
			if (youtube.player_ready) {
				if (youtube.last_video_state == videoStates.PLAYING) {
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
			if (youtube.player_ready) {
				youtube.seek(seconds);
				youtube.player.pauseVideo();
			}
		},
		
		seek: function(seconds) {
			if (youtube.player_ready) {
				youtube.player.seekTo(seconds, true);
			}
		},

		sync_with_time: function(seconds) {
			var local_time = youtube.get_current_time();
			if (Math.abs(local_time - seconds) > SYNC_THRESHOLD) {
				debug_print("Seeking to " + seconds);
				youtube.seek(seconds);
			}
		},
		
		get_current_time: function() {
			if (youtube.player_ready && youtube.player.getCurrentTime) {
				return youtube.player.getCurrentTime();
			}
			return 0;
		},
		
		get_total_time: function() {
			if (youtube.player_ready && youtube.player.getDuration) {
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

	var vimeo = {
		player: null,
		player_ready: false,
		last_playback_position: NaN,
		last_video_state: videoStates.UNSTARTED,

		// Cache video data since calls to the vimeo api are asynchronus
		current_time: NaN,
		duration: NaN,

		on_player_ready: function() {
			vimeo.player_ready = true;

			vimeo.player.addEvent("play", vimeo.on_play);
			vimeo.player.addEvent("pause", vimeo.on_pause);
			vimeo.player.addEvent("finish", vimeo.on_finish);
			vimeo.player.addEvent("playProgress", vimeo.on_play_progress);
			vimeo.player.addEvent("seek", vimeo.on_seek);

			vimeo.player.api("getDuration", function(duration) {
				vimeo.duration = parseFloat(duration);
			})

			//vimeo.seek(vimeo.start_time);
		},

		on_play: function() {
			if (videoStates.PLAYING != vimeo.last_video_state) {
				if (controller.is_moderator) {
					socket.send(
						{command: "update_video_state"
						, position: vimeo.current_time
						, state: "playing"});
					vimeo.last_playback_position = vimeo.current_time;
				}
				vimeo.last_video_state = videoStates.PLAYING;
			}
		},

		on_pause: function() {
			if (videoStates.PAUSED != vimeo.last_video_state) {
				if ((vimeo.get_current_time() + SYNC_THRESHOLD) >= vimeo.get_total_time()) {
					// At the end of video we get a PAUSED->ENDED.  Ignore the PAUSED is we're close to the end.
					// TODO: Better handling.
					return;
				}
				if (controller.is_moderator) {
					socket.send(
						{command: "update_video_state"
						, position: vimeo.current_time
						, state: "paused"});
					vimeo.last_playback_position = vimeo.current_time;
				}
				vimeo.last_video_state = videoStates.PAUSED;
			}
		},

		on_finish: function() {
			if (controller.is_moderator) {
				socket.send(
					{command: "select_video"
					, item_id: queue.next_video_id()});
			}
		},

		on_play_progress: function(data) {
			new_time = parseFloat(data.seconds);
			if(new_time != vimeo.current_time) {
				if (controller.is_moderator && Math.abs(new_time - vimeo.last_playback_position) > 0.5) {
					socket.send(
						{command: "update_video_state"
						, position: new_time
						, state: (vimeo.last_video_state == videoStates.PLAYING ? "playing" : "paused")});
					vimeo.last_playback_position = new_time;
				}
				vimeo.current_time = new_time;
			}
		},

		on_seek: function(data) {
			vimeo.on_play_progress(data);
		},

		load: function(video, autoplay) {
			vimeo.current_time = vimeo.last_playback_position = 0;
			vimeo.duration = parseFloat(video.duration);
			vimeo.start_time = video.start_time;

			$container = $("#player_container");

			query = {
				api: 1
				, color: "339933"
				, player_id: "player"
			};

			if(autoplay) {
				query.autoplay = 1;
			}

			path_parts = video.url.split("?")[0].split("/");
			video_id = path_parts[path_parts.length - 1];

			url = "http://player.vimeo.com/video/" + video_id + "?" + $.param(query)

			$iframe = $("<iframe>", {
				id: "player"
				, src: url
				, height: $container.height()
				, width: $container.height() * ASPECT_RATIO
				, frameborder: 0
				, webkitAllowFullScreen: ""
				, mozallowfullscreen: ""
				, allowFullScreen: ""
			});
			$container.append($iframe);
			vimeo.player = $f($iframe[0]);

			vimeo.player.addEvent("ready", vimeo.on_player_ready);
		},

		unload: function() {
			vimeo.player = null;
			vimeo.player_ready = false;
			$("#player_container").html("");
		},

		resize: function(width, height) {
			var video = $("#player_container iframe");
			video.width(width).height(height);
		},
		
		switch_video: function(video, autoplay) {
			vimeo.unload();
			vimeo.load(video, autoplay);
		},

		play: function(seconds) {
			if (vimeo.player_ready) {
				if (vimeo.last_video_state == videoStates.PLAYING) {
					vimeo.sync_with_time(seconds);
				} else {
					if (seconds != 0) {
						vimeo.seek(seconds);
					}

					vimeo.player.api("play")
				}
			}
		},
		
		pause: function(seconds) {
			if (vimeo.player_ready) {
				vimeo.seek(seconds);
				vimeo.player.api("pause");
			}
		},
		
		seek: function(seconds) {
			if (vimeo.player_ready) {
				vimeo.player.api("seekTo", seconds);
			}
		},

		sync_with_time: function(seconds) {
			var local_time = vimeo.current_time;
			if (Math.abs(local_time - seconds) > SYNC_THRESHOLD) {
				debug_print("Seeking to " + seconds);
				vimeo.seek(seconds);
			}
		},
		
		get_current_time: function() {
			if (vimeo.player_ready) {
				return vimeo.current_time;
			}
			return 0;
		},
		
		get_total_time: function() {
			if (vimeo.player_ready) {
				return vimeo.duration;
			}
			return 0;
		}
	}

	// Load vimeo postMessage API
	$.getScript("http://a.vimeocdn.com/js/froogaloop2.min.js");

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
		};
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
			$("#guest_name_change").hide();
		};
		$("#change_name").click(change_username);
		$("#username").keydown(function(e) {
			if (e.keyCode == 13) {
				e.preventDefault();
				change_username();
			}
		});

		var vote_skip = function() {
			socket.send({command: "vote_skip"});
		};
		$("#vote_skip").click(vote_skip);

		var vote_mutiny = function() {
			socket.send({command: "vote_mutiny"});
		};
		$("#vote_mutiny").click(vote_mutiny);

		var vote_mutiny_cancel = function() {
			socket.send({command: "vote_mutiny_cancel"});
		};
		$("#vote_mutiny_cancel").click(vote_mutiny_cancel);
	});

	$(window).smartresize(function() {
		controller.resize_video();
	});
})();
