
'use strict';

var buffers = require('chronic-buffers'),
    nextTick = require('./nextTick');

function Dispatcher() {
  this.tasks = buffers.ring(32);
  this.running = false;
  this.queued = false;
  this.messageChannel = null;

  if (typeof MessageChannel !== 'undefined') {
    this.messageChannel = new MessageChannel();
    this.messageChannel.port1.onmessage = function(msg) {
      this.processMessages();
    }.bind(this);
  }
}

Dispatcher.Dispatcher = Dispatcher;

Dispatcher.TASK_BATCH_SIZE = 1024;

Dispatcher.prototype = {

  processMessages: function processMessages() {
    this.running = true;
    this.queued = false;

    for (var count = 0; count < Dispatcher.TASK_BATCH_SIZE; count += 1) {
      var m = this.tasks.pop();
      if (m == null) {
        break;
      }
      m();
    }

    this.running = false;
    if (this.tasks.length > 0) {
      this.queue();
    }
  },

  queue: function queue() {
    if (this.queued || this.running) {
      return;
    }
    this.queued = true;

    if (this.messageChannel) {
      this.messageChannel.port2.postMessage(0);
    }
    else {
      nextTick(this.processMessages.bind(this));
    }
  },

  queueDelay: function queueDelay(f, delay) {
    setTimeout(f, delay);
  },

  run: function run(f) {
    this.tasks.unboundedUnshift(f);
    this.queue();
  }
};

module.exports = new Dispatcher();
