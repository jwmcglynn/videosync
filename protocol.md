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
{"command": "add_queue_video", "video":
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

Client-to-server messages
-------------------------

### Initial state

#### `login`

Upon success, advances to the **connected** state.

Possible responses: `command_error`, `logged_in`.

| Name     | Type     | Details |
|---------:|:--------:|:--------|
| username | `string` | Unique username string. |
| password | `string` | Unencrypted password. (FIXME) |

#### `login_guest`

Upon receipt, advances to the **connected** state.

Possible responses: `logged_in`.

*No additional properties.*

### Connected state

#### `join_room`

Upon success, advances to the **room** state.

Possible responses: `command_error`, `room_joined`.

| Name    | Type   | Details |
|--------:|:------:|:--------|
| room_id | `int`  | Unique id used to reference videos when performing operations with them. |

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

Server-to-client messages
-------------------------

#### `logged_in`

Confirmation that the session has transitioned to the **connected** state.

| Name     | Type            | Details |
|---------:|:---------------:|:--------|
| username | `username_type` | Current session's username. |

#### `room_joined`

Confirmation that the session has transitioned to the **room** state.

*No additional properties.*

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

#### `guest_usernamed_changed`

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
| queue  | `video_type` | Video information. |

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

#### `command_error`

Response from the server when the previous command errors out.

| Name    | Type     | Details |
|--------:|:--------:|:--------|
| context | `string` | Command that resulted in this error. |
| reason  | `string` | User-readable error message. |
