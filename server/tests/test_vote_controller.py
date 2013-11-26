from vote_controller import VoteSkipController, VoteMutinyController
from room_controller import EventSource

from nose.tools import *

class MockUserSession(object):
	def __init__(self, username):
		self.username = username
		self.messages = []

	def __eq__(self, other):
		return self is other

	def send(self, message):
		print "%s got message: %s" % (self.username, message)
		self.messages.append(message)

class TestHookTimer(object):
	def __init__(self, time_remaining):
		self.time_remaining = time_remaining
		self.canceled = False

	def cancel(self):
		self.canceled = True

	def getTime(self):
		return self.time_remaining

class MockRoomController(object):
	def __init__(self):
		self.messages = []

		self.vote_skip = None
		self.vote_mutiny = None
		self.video_advanced = False
		self.changed_moderator = None
		self.active_users = []

		self.event_user_connect = EventSource()
		self.event_user_disconnect = EventSource()
		self.event_video_changed = EventSource()
		self.event_moderator_changed = EventSource()
	
	def broadcast(self, message):
		print "Broadcast message: %s" % message
		self.messages.append(message)

	## Vote success conditions.
	def advance_video(self):
		assert_false(self.video_advanced)
		self.video_advanced = True

	def update_moderator(self, user_session):
		assert_is_none(self.changed_moderator)
		self.changed_moderator = user_session

	## Voting.
	def vote_skip_create(self):
		self.vote_skip = VoteSkipController(self)

	def vote_skip_remove(self):
		assert_not_equal(self.vote_skip, None)
		self.vote_skip = None

	def vote_mutiny_create(self):
		self.timer = TestHookTimer(30.0)
		self.vote_mutiny = VoteMutinyController(self, test_hook_timer=self.timer)

	def vote_mutiny_remove(self):
		assert_not_equal(self.vote_mutiny, None)
		self.vote_mutiny = None

class TestVoteController():
	def validate_skip_votes(self, room, who_voted, votes_required):
		for session in room.active_users:
			assert_equal(
				[{"command": "vote_skip_status"
						, "votes": len(who_voted)
						, "votes_required": votes_required
						, "has_voted": (session in who_voted)}]
				, session.messages)
			session.messages = []

	def validate_mutiny_votes(self, room, new_leader, who_voted, votes_required):
		if new_leader is None:
			leader_username = None
		else:
			leader_username = new_leader.username

		for session in room.active_users:
			assert_equal(
				[{"command": "vote_mutiny_status"
						, "new_leader": leader_username
						, "time_remaining": room.timer.getTime()
						, "votes": len(who_voted)
						, "votes_required": votes_required
						, "has_voted": (session in who_voted)}]
				, session.messages)
			session.messages = []

	#### Skip tests.
	def test_vote_skip_single_user(self):
		# Confirm that casting a vote as a single user immediately advances the video.
		room = MockRoomController()
		user1 = MockUserSession("User1")
		room.active_users.append(user1)

		room.vote_skip_create()
		room.vote_skip.vote(room, user1)

		assert_true(room.video_advanced)
		assert_equal(
			[{"command": "vote_skip_complete"}]
			, room.messages)
		assert_is_none(room.vote_skip)

	def test_vote_skip_pass(self):
		# Test a basic pass vote.
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)

		room.vote_skip_create()
		room.vote_skip.vote(room, user1)
		assert_false(room.video_advanced)

		self.validate_skip_votes(
			room
			, who_voted=[user1]
			, votes_required=2)

		room.vote_skip.vote(room, user2)
		assert_true(room.video_advanced)
		assert_equal(
			[{"command": "vote_skip_complete"}]
			, room.messages)
		assert_is_none(room.vote_skip)

	def test_vote_skip_user_join(self):
		# Confirm that a user joining sends an update and refreshes the votes required.
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		user4 = MockUserSession("User4")
		room.active_users.append(user1)
		room.active_users.append(user2)

		room.vote_skip_create()
		room.vote_skip.vote(room, user1)
		assert_false(room.video_advanced)
		self.validate_skip_votes(
			room
			, who_voted=[user1]
			, votes_required=2)

		# Confirm that a status update was sent.
		room.active_users.append(user3)
		room.event_user_connect.invoke(room, user3)
		self.validate_skip_votes(
			room
			, who_voted=[user1]
			, votes_required=2)

		# Connect the last user, the votes_required should change.
		room.active_users.append(user4)
		room.event_user_connect.invoke(room, user4)
		self.validate_skip_votes(
			room
			, who_voted=[user1]
			, votes_required=3)

	def test_vote_skip_abort(self):
		# Test a basic pass vote.
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		room.active_users.append(user1)
		room.active_users.append(user2)

		room.vote_skip_create()
		room.vote_skip.vote(room, user1)
		assert_false(room.video_advanced)

		self.validate_skip_votes(
			room
			, who_voted=[user1]
			, votes_required=2)

		room.event_video_changed.invoke(room, None)
		assert_equal(
			[{"command": "vote_skip_complete"}]
			, room.messages)
		assert_false(room.video_advanced) # Vote did not change the video, something else did.
		assert_is_none(room.vote_skip)


	def test_vote_skip_win_by_disconnect(self):
		# Confirm that a user joining sends an update and refreshes the votes required.
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		user4 = MockUserSession("User4")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)
		room.active_users.append(user4)

		room.vote_skip_create()
		room.vote_skip.vote(room, user1)
		assert_false(room.video_advanced)
		self.validate_skip_votes(
			room
			, who_voted=[user1]
			, votes_required=3)

		room.vote_skip.vote(room, user2)
		assert_false(room.video_advanced)
		self.validate_skip_votes(
			room
			, who_voted=[user1, user2]
			, votes_required=3)

		# Confirm that if user4 leaves the vote will immediately pass.
		room.active_users.remove(user4)
		room.event_user_disconnect.invoke(room, user4)

		assert_true(room.video_advanced)
		assert_equal(
			[{"command": "vote_skip_complete"}]
			, room.messages)
		assert_is_none(room.vote_skip)

	#### Mutiny tests.
	def mutiny_finish(self, room):
		# Set the mutiny timer to complete and evaluate the vote.
		room.timer.time_remaining = 0.0
		room.vote_mutiny.on_time_limit(room)
		assert_is_none(room.vote_mutiny)
		assert_false(room.timer.canceled)

	def test_vote_mutiny_pass(self):
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)

		room.vote_mutiny_create()
		room.vote_mutiny.vote(room, user1)
		self.validate_mutiny_votes(
			room
			, new_leader=user1
			, who_voted=[user1]
			, votes_required=2)

		room.vote_mutiny.vote(room, user2)
		self.mutiny_finish(room)

		assert_equal(user1, room.changed_moderator)
		assert_equal(
			[{"command": "vote_mutiny_complete"
				, "status": "passed"}]
			, room.messages)

	def test_vote_mutiny_moderator_cancel(self):
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)

		room.vote_mutiny_create()
		room.vote_mutiny.vote(room, user2)
		self.validate_mutiny_votes(
			room
			, new_leader=user2
			, who_voted=[user2]
			, votes_required=2)

		room.vote_mutiny.moderator_cancel(room)
		assert_is_none(room.changed_moderator)
		assert_equal(
			[{"command": "vote_mutiny_complete"
				, "status": "failed"}]
			, room.messages)
		assert_is_none(room.vote_mutiny)
		assert_true(room.timer.canceled)

	def test_vote_mutiny_cancel_by_leadership_change(self):
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)

		room.vote_mutiny_create()
		room.vote_mutiny.vote(room, user2)
		self.validate_mutiny_votes(
			room
			, new_leader=user2
			, who_voted=[user2]
			, votes_required=2)

		room.event_moderator_changed.invoke(room, user2)
		assert_is_none(room.changed_moderator)
		assert_equal(
			[{"command": "vote_mutiny_complete"
				, "status": "failed"}]
			, room.messages)
		assert_is_none(room.vote_mutiny)
		assert_true(room.timer.canceled)

	def test_vote_mutiny_timeout(self):
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)

		room.vote_mutiny_create()
		room.vote_mutiny.vote(room, user1)
		self.validate_mutiny_votes(
			room
			, new_leader=user1
			, who_voted=[user1]
			, votes_required=2)
		self.mutiny_finish(room)

		assert_is_none(room.changed_moderator)
		assert_equal(
			[{"command": "vote_mutiny_complete"
				, "status": "failed"}]
			, room.messages)

	def test_vote_mutiny_leader_leaves_pass(self):
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		user4 = MockUserSession("User4")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)
		room.active_users.append(user4)

		room.vote_mutiny_create()
		room.vote_mutiny.vote(room, user1)
		self.validate_mutiny_votes(
			room
			, new_leader=user1
			, who_voted=[user1]
			, votes_required=2)

		# Make user1 leave.
		room.active_users.remove(user1)
		room.event_user_disconnect.invoke(room, user1)
		self.validate_mutiny_votes(
			room
			, new_leader=None
			, who_voted=[]
			, votes_required=2)

		# Mutiny is still on, next person to vote becomes leader.
		room.vote_mutiny.vote(room, user2)
		self.validate_mutiny_votes(
			room
			, new_leader=user2
			, who_voted=[user2]
			, votes_required=2)

		room.vote_mutiny.vote(room, user3)
		self.mutiny_finish(room)
		assert_equal(user2, room.changed_moderator)
		assert_equal(
			[{"command": "vote_mutiny_complete"
				, "status": "passed"}]
			, room.messages)

	def vote_mutiny_room_empties(self):
		room = MockRoomController()
		user1 = MockUserSession("User1")
		user2 = MockUserSession("User2")
		user3 = MockUserSession("User3")
		room.active_users.append(user1)
		room.active_users.append(user2)
		room.active_users.append(user3)

		room.vote_mutiny_create()
		room.vote_mutiny.vote(room, user1)
		self.validate_mutiny_votes(
			room
			, new_leader=user1
			, who_voted=[user1]
			, votes_required=2)

		# Make user1 leave.
		room.active_users.remove(user1)
		room.event_user_disconnect.invoke(room, user1)
		self.validate_mutiny_votes(
			room
			, new_leader=None
			, who_voted=[]
			, votes_required=2)

		# Mutiny is still on, next person to vote becomes leader.
		room.vote_mutiny.vote(room, user2)
		self.validate_mutiny_votes(
			room
			, new_leader=user2
			, who_voted=[user2]
			, votes_required=2)

		room.vote_mutiny.vote(room, user3)
		self.mutiny_finish(room)
		assert_equal(user2, room.changed_moderator)
		assert_equal(
			[{"command": "vote_mutiny_complete"
				, "status": "passed"}]
			, room.messages)

