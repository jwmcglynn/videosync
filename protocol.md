VideoSync Protocol
==================

Core Protocol
-------------

The protocol is implemented by passing JSON messages between the client and server.  Each message is a JSON object with, a `command` property followed by any number of additional properties relevant to that command.

For example, for the `set_moderator` command `username` is provided as metadata.

```json
{"command": "set_moderator", "username": "ExampleUser"}
```

Shared Data Types
-----------------

Shared data types are, such as videos or users, are always represented in the same format and will be abbreviated later in the document.

### Users

Usernames will be referenced with *`username_type`* 

Users are presented by unique username strings.  There are two types of users, guests and registered users.  Guest usernames are differentiated from registered users by decorating the string with asterisks.

Registered user names are undecorated:

```json
{..., "username": "RegisteredUser"}
```

Guest usernames have an asterisk decoration at the beginning and end:

```json
{..., "username": "*GuestUser*"}
```

### Videos

Videos, which will be represented with *`video_type`* later in the document, are conveyed as a JSON object with the following properties:

| Name       | Type     | Details |
|-----------:|:--------:|:--------|
| item_id    | `int`    | Unique id used to reference videos when performing operations with them. |
| service    | `string` | Service that is hosting the video.  Either `youtube` or `vimeo`. |
| url        | `string` | User-facing URL for the video.  Ex: http://www.youtube.com/watch?v=Wl8AK5Ht65Y |
| title      | `string` | Title of the video. |
| duration   | `real`   | Duration of the video in seconds. |
| start_time | `real`   | Start time offset, in seconds. |

Example:

```json
{"command": "add_queue_video"
	, "video":
		{"item_id": 1
			, "service": "youtube"
			, "url": "http://www.youtube.com/watch?v=Qqd9S06lvH0"
			, "title": "screaming creepers"
			, "start_time": 0
			, "duration": 28}}
```

Protocol states
---------------

![Protocol states diagram](https://github.com/jwmcglynn/videosync/raw/master/protocol_states.png)

Socket handshake
----------------

VideoSync is provided as a websocket server.  The service is available as a URL in the following format:

	ws://<domain>:9000/room/<room_id>?login_token=<token>

Unauthenticated users may still connect, but should omit the login_token query string:

	ws://<domain>:9000/room/<room_id>
	
| Name        | Type     | Details |
|------------:|:--------:|:--------|
| domain      | `string` | The HTTP server's domain. |
| room_id     | `string` | Base-32 encoded room ID (Crockford format). |
| login_token | `string` | Session identifier for authenticated users. |

Client-to-server messages
-------------------------

### Room state

#### `guest_username`

Changes the display name of a guest.  Can only be issued once.

| Name     | Type     | Details |
|---------:|:--------:|:--------|
| username | `string` | New username, without the asterisk decoration. |

#### `add_video`

Add a video to the queue.

| Name | Type     | Details |
|-----:|:--------:|:--------|
| url  | `string` | URL identifying the video. |

#### `vote_skip`

Vote to skip the current video.

#### `vote_mutiny`

Vote to overthrow the current moderator.  The first person to initiate the vote becomes the new leader.

#### `chat_message`

| Name      | Type            | Details |
|----------:|:---------------:|:--------|
| message   | `string`        | Message content. |

### Room moderator state

#### `give_moderator`

Transfer moderator to another user.

Possible responses: `command_error`, `set_moderator`.

| Name     | Type     | Details |
|---------:|:--------:|:--------|
| username | `string` | Username of the new moderator. |

#### `update_video_state`

As moderator report the current video position and playback state.  Moderators should send these messages whenever video *position* or *state* changes.

| Name     | Type     | Details |
|---------:|:--------:|:--------|
| position | `real`   | Current video position in seconds. |
| state    | `string` | Either **playing** or **paused**. |

#### `select_video`

Select a video in the queue to play as the current video.

Possible responses: `command_error`, `change_video`.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| item_id | `int` | Video unique id. |

#### `move_video`

Move a video's position in the queue.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| item_id | `int` | Video unique id. |
| index   | `int` | new location of the video, as a zero-based index in the queue list. |

#### `remove_video`

Remove a video from the queue.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| item_id | `int` | Video unique id. |

#### `vote_mutiny_cancel`

Cancel the current mutiny vote.

Server-to-client messages
-------------------------

#### `room_joined`

Confirmation that the session has successfully been established and has transitioned to the **room** state.

| Name         | Type            | Details |
|-------------:|:---------------:|:--------|
| username     | `username_type` | Username, either generated username for guests or registered username. |

#### `initial_users`

Initial username list for the room.  Sent as soon as the session transitions to the **room** state.

| Name   | Type                   | Details |
|-------:|:----------------------:|:--------|
| users  | array of `username_type` | List of active users for the room. |

#### `initial_queue`

Initial video queue for the room.  Sent as soon as the session transitions to the **room** state.

| Name   | Type                  | Details |
|-------:|:---------------------:|:--------|
| queue  | array of `video_type` | Video queue for the room. |

#### `guest_username_changed`

Sent when a guest user changes their temporary name.

| Name         | Type            | Details |
|-------------:|:---------------:|:--------|
| old_username | `username_type` | User's previous name. |
| username     | `username_type` | User's new name. |

#### `user_connect`

Sent when a user joins the current room.

| Name         | Type            | Details |
|-------------:|:---------------:|:--------|
| username     | `username_type` | User's new name. |

#### `user_disconnect`

Sent when a user disconnects from the current room.

| Name         | Type            | Details |
|-------------:|:---------------:|:--------|
| username     | `username_type` | User's new name. |

#### `set_moderator`

Sent when the moderator changes.

| Name         | Type            | Details |
|-------------:|:---------------:|:--------|
| username     | `username_type` | User's new name. |

#### `change_video`

Sent when the current video changes to inform the client to load a new video in the player.

| Name   | Type         | Details |
|-------:|:------------:|:--------|
| video  | `video_type` | Video information. |

#### `video_state`

Reports a change to the current video, either when the playback position or state changes.

| Name     | Type     | Details |
|---------:|:--------:|:--------|
| position | `real`   | Current video position in seconds. |
| state    | `string` | Either **playing** or **paused**. |

#### `add_queue_video`

Reports a new video added to the end of the queue.

| Name   | Type         | Details |
|-------:|:------------:|:--------|
| video  | `video_type` | Video information. |

#### `move_queue_video`

Report a video move to a new position in the queue.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| item_id | `int` | Video unique id. |
| index   | `int` | new location of the video, as a zero-based index in the queue list. |

#### `remove_queue_video`

Remove a video from the queue.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| item_id | `int` | Video unique id. |

#### `vote_skip_status`

Reports status on the current skip vote.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| votes | `int` | Current number of votes. |
| votes_required | `int` | Number of votes required for vote to pass. |
| has_voted | `bool` | Has the current user voted? |

#### `vote_mutiny_status`

Reports status on the current mutiny vote.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| new_leader | `username_type` | First person to initiate the mutiny vote. |
| time_remaining | `real` | Time remaining for the vote, in seconds. |
| votes | `int` | Current number of votes. |
| votes_required | `int` | Number of votes required for vote to pass. |
| has_voted | `bool` | Has the current user voted? |

#### `vote_skip_complete`

Notifies that the skip vote is complete; either the video changed by the moderator or the vote passed which changed the video.

#### `vote_mutiny_complete`

Notifies that the mutiny vote is complete and has either passed or failed.

| Name    | Type  | Details |
|--------:|:-----:|:--------|
| status | `string` | Either **passed** or **failed**. |

#### `chat_message`

| Name      | Type            | Details |
|----------:|:---------------:|:--------|
| username  | `username_type` | Username of the author. |
| message   | `string`        | Message content. |

#### `command_error`

Response from the server when the previous command errors out.

| Name    | Type     | Details |
|--------:|:--------:|:--------|
| context | `string` | Command that resulted in this error. |
| reason  | `string` | User-readable error message. |
