VideoSync Protocol
==================

Core Protocol
-------------

The protocol is implemented by passing JSON messages between the client and server.  Every message has at least a `command` entry followed by command-specific entries.

For example, for the `set_moderator` command `username` is provided as metadata.

```json
{"command": "set_moderator", "username": "ExampleUser"}
```

Shared Data Types
-----------------

When users or videos are referenced by the protocol they are always represented in the same format.

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

Videos are represented by a JSON object with the following entries:

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

Server-to-client messages
-------------------------

Client connection handshake
---------------------------

