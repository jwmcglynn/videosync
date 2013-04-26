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

| Name    | Type   | Details |
|--------:|:------:|:--------|
| item_id | int    | Unique id used to reference videos when performing operations with them. |
| service | string | Service that is hosting the video.  Either `youtube` or `vimeo`. |
| url     | string | User-facing URL for the video.  Ex: http://www.youtube.com/watch?v=Wl8AK5Ht65Y |
| title   | string | Title of the video. |
| duration | real | Duration of the video in seconds. |
| start_time | real | Start time offset, in seconds. |

Example:

```json
{"command": "add_queue_video", "video":
	{"item_id": 1
    , "service": "youtube"
    , "url": "http://www.youtube.com/watch?v=Qqd9S06lvH0"
    , "title": "screaming creepers"
    , "start_time": 0
    , "duration": 28}}
```

Client-to-server messages
-------------------------

### Initial state

#### `login`

Upon success, advances to the **connected** state.

Possible responses: `command_error`, `logged_in`.

| Name     | Type   | Details |
|---------:|:------:|:--------|
| username | string | Unique username string. |
| password | string | Unencrypted password. (FIXME) |

#### `login_guest`

Upon receipt, advances to the **connected** state.

Possible responses: `logged_in`.

*No additional fields.*

### Connected state

#### `join_room`

Upon success, advances to the **room** state.

Possible responses: `command_error`, `room_joined`.

| Name    | Type   | Details |
|--------:|:------:|:--------|
| room_id | int    | Unique id used to reference videos when performing operations with them. |

### Room state

#### `guest_username`

Changes the display name of a guest.  Can only be issued once.

| Name     | Type   | Details |
|---------:|:------:|:--------|
| username | string | New username, without the asterisk decoration. |

#### `add_video`

Add a video to the queue.

| Name | Type   | Details |
|-----:|:------:|:--------|
| url  | string | URL identifying the video. |

### Room moderator state

#### `video_state`

As moderator report the current video position and playback state.  Moderators should send these messages whenever video *position* or *state* changes.

| Name     | Type   | Details |
|---------:|:------:|:--------|
| position | real   | Current video position in seconds. |
| state    | string | Either **playing** or **paused**. |

#### `select_video`

Select a video in the queue to play as the current video.

Possible responses: `command_error`, `change_video`.

| Name    | Type | Details |
|--------:|:----:|:--------|
| item_id | int  | Video unique id. |

#### `move_video`

Move a video's position in the queue.

| Name    | Type | Details |
|--------:|:----:|:--------|
| item_id | int  | Video unique id. |
| index   | int  | new location of the video, as a zero-based index in the queue list. |

Server-to-client messages
-------------------------

#### `logged_in`

#### `room_joined`

#### `guest_usernamed_changed`

#### `user_connect`

#### `user_disconnect`

#### `set_moderator`

#### `assume_direct_control`

#### `remove_control`

#### `initial_users`

#### `initial_queue`

#### `change_video`

#### `video_state`

#### `add_queue_video`

### `move_queue_video`

### `command_error`



Client connection handshake
---------------------------

