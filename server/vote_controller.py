import math
from twisted.internet import reactor
from twisted.internet.error import AlreadyCalled, AlreadyCancelled

class VoteController(object):
	def __init__(self, room_controller):
		self._user_count = len(room_controller.active_users)
		self._votes = []
		self._votes_required = 0
		self.threshold_percent = 0.51
		room_controller.event_user_connect.add_callback(self.on_user_connect)
		room_controller.event_user_disconnect.add_callback(self.on_user_disconnect)

		self.calculate_thresholds()

	def unregister(self, room_controller):
		room_controller.event_user_connect.remove_callback(self.on_user_connect)
		room_controller.event_user_disconnect.remove_callback(self.on_user_disconnect)

	def calculate_thresholds(self):
		self._votes_required = math.ceil(self._user_count * self.threshold_percent)

	def on_user_connect(self, room_controller, user_session):
		self._user_count += 1
		self.calculate_thresholds()
		self.send_update(room_controller)

	def on_user_disconnect(self, room_controller, user_session):
		if user_session in self._votes:
			self._votes.remove(user_session)
		self._user_count -= 1

		# Check to see if the user leaving makes the vote pass.
		self.calculate_thresholds()
		self.evaluate_vote(room_controller)

	def vote(self, room_controller, user_session):
		if user_session in self._votes:
			# Users cannot vote twice.
			return

		self._votes.append(user_session)
		self.evaluate_vote(room_controller)

	def evaluate_vote(self, room_controller):
		if len(self._votes) >= self._votes_required:
			self.vote_complete(room_controller)
		else:
			self.send_update(room_controller)

	# To be implemented by derived classes.
	def vote_complete(self, room_controller):
		raise NotImplementedError()

	def send_update(self, room_controller):
		raise NotImplementedError()

class VoteSkipController(VoteController):
	def __init__(self, room_controller):
		super(VoteSkipController, self).__init__(room_controller)
		room_controller.event_video_changed.add_callback(self.on_video_changed)

	def unregister(self, room_controller):
		room_controller.event_video_changed.remove_callback(self.on_video_changed)
		super(VoteSkipController, self).unregister(room_controller)

	def on_video_changed(self, room_controller, video):
		room_controller.vote_skip_remove()
		room_controller.broadcast(
			{"command": "vote_skip_complete"})

	def vote_complete(self, room_controller):
		room_controller.vote_skip_remove()
		room_controller.broadcast(
			{"command": "vote_skip_complete"})
		room_controller.advance_video()

	def send_update(self, room_controller):
		for session in room_controller.active_users:
			has_voted = session in self._votes
			session.send(
				{"command": "vote_skip_status"
					, "votes": len(self._votes)
					, "votes_required": self._votes_required
					, "has_voted": has_voted})

class VoteMutinyController(VoteController):
	def __init__(self, room_controller, time_limit=30.0, test_hook_timer=None):
		super(VoteMutinyController, self).__init__(room_controller)
		room_controller.event_moderator_changed.add_callback(self.on_moderator_changed)
		self.__time_limit = time_limit
		
		if test_hook_timer is None:
			self.timer = reactor.callLater(self.__time_limit, self.on_time_limit, room_controller)
			self.test_hook_timer = False
		else:
			self.timer = test_hook_timer
			self.test_hook_timer = True

	def unregister(self, room_controller):
		room_controller.event_moderator_changed.add_callback(self.on_moderator_changed)
		super(VoteMutinyController, self).unregister(room_controller)
		assert(self.timer is None)

	def on_moderator_changed(self, room_controller, user_session):
		self.moderator_cancel(room_controller)

	def calculate_thresholds(self):
		if self._user_count > 1:
			self._votes_required = math.ceil((self._user_count - 1) * self.threshold_percent)
		else:
			self._votes_required = 1

	def timer_cancel(self):
		success = True

		if not self.timer:
			success = False
		else:
			try:
				self.timer.cancel()
			except (AlreadyCalled, AlreadyCancelled):
				success = False

			self.timer = None

		return success

	def timer_time_remaining(self):
		if self.timer is not None:
			if self.test_hook_timer:
				remaining = self.timer.getTime()
			else:
				remaining = self.timer.getTime() - reactor.seconds()

			if remaining < 0:
				remaining = 0
			remaining = round(remaining)
			return remaining
		else:
			return 0

	def on_time_limit(self, room_controller):
		self.timer = None
		room_controller.vote_mutiny_remove()
		if len(self._votes) > 0 and len(self._votes) >= self._votes_required:
			room_controller.update_moderator(self._votes[0])

			room_controller.broadcast(
				{"command": "vote_mutiny_complete"
					, "status": "passed"})
		else:
			room_controller.broadcast(
				{"command": "vote_mutiny_complete"
					, "status": "failed"})

	def moderator_cancel(self, room_controller):
		# The moderator has canceled the vote.
		if self.timer_cancel():
			room_controller.vote_mutiny_remove()
			room_controller.broadcast(
				{"command": "vote_mutiny_complete"
					, "status": "failed"})

	def vote_complete(self, room_controller):
		# The vote will be successful, but we have to wait for the timeout.
		self.send_update(room_controller)

	def send_update(self, room_controller):
		if len(self._votes) == 0:
			new_leader = None
		else:
			new_leader = self._votes[0].username
		time_remaining = self.timer_time_remaining()

		for session in room_controller.active_users:
			has_voted = session in self._votes
			session.send(
				{"command": "vote_mutiny_status"
					, "new_leader": new_leader
					, "time_remaining": time_remaining
					, "votes": len(self._votes)
					, "votes_required": self._votes_required
					, "has_voted": has_voted})

