from nose.twistedtools import threaded_reactor, deferred
from nose.tools import *
from room_controller import EventSource

received_callback = False
received_args = None

def callback(*args):
	global received_callback
	global received_args

	received_callback = True
	received_args = args

def callback_reset():
	global received_callback
	global received_args

	received_callback = False
	received_args = None

class TestEvent:
	def test_event_source(self):
		source = EventSource()
		assert_equal(len(source), 0)

		callback_reset()
		assert_equal(received_callback, False)
		assert_equal(received_args, None)

		# Validate add_callback.
		source.add_callback(callback)
		assert_equal(len(source), 1)

		source.invoke(self)
		assert_equal(received_callback, True)
		assert_equal(received_args, (self,))

		callback_reset()
		source.invoke(self, "test")
		assert_equal(received_callback, True)
		assert_equal(received_args, (self, "test"))

		# Validate that remove_callback works.
		callback_reset()
		source.remove_callback(callback)
		assert_equal(len(source), 0)

		source.invoke(self)
		assert_equal(received_callback, False)
		assert_equal(received_args, None)
