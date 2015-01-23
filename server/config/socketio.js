/**
 * Socket.io configuration
 */

'use strict';

var config = require('./environment');
var uuid = require('node-uuid');
var _ = require('lodash');

// When the user disconnects.. perform this
function onDisconnect(socket) {
}

// When the user connects.. perform this
function onConnect(socket) {
  // Insert sockets below
}

//var rooms = { users:[], votes: []};
var rooms = {};

module.exports = function (socketio) {
  // We can authenticate socket.io users and access their token through socket.handshake.decoded_token
  // 1. You will need to send the token in `client/components/socket/socket.service.js`
  // 2. Require authentication here:
  // socketio.use(require('socketio-jwt').authorize({
  //   secret: config.secrets.session,
  //   handshake: true
  // }));

  socketio.on('connection', function (socket) {
    socket.address = socket.handshake.address !== null ?
            socket.handshake.address.address + ':' + socket.handshake.address.port :
            process.env.DOMAIN;

    socket.connectedAt = new Date();

    socket.on('updateDescription', function (data) {
      rooms[data.id].description = data.description;
      socket.broadcast.to(data.id).emit('descriptionUpdated', data.description);
    });

    socket.on('newSession', function () {
      var roomid = uuid.v1();
      rooms[roomid] = {users: [], votes: {}};
      socket.emit('sessionCreated', roomid);
    });

    socket.on('joinSession', function (data) {
      if(rooms[data.id]){
      socket.join(data.id);
      rooms[data.id].users.push({username: data.username, socketId: socket.id});
      socket.emit('joinedSession', {id: socket.id, description: rooms[data.id].description});

      socketio.to(data.id).emit('hideVotes');
      socketio.to(data.id).emit('updateUsers', {users: rooms[data.id].users});
      }else{
        socket.emit('errorMsg', {message: "Session does not exist"});
      }
    });

    socket.on('vote', function (data) {
      var user = _.findWhere(rooms[data.id].users, {socketId: data.userId});
      user.voted = true;
      rooms[data.id].votes[data.userId] = data.vote;

      var numVotes = _.groupBy(rooms[data.id].users, 'voted').true.length;

      if(numVotes ==  rooms[data.id].users.length){
        rooms[data.id].revealed = true;
      }else{
        rooms[data.id].revealed = false;
      }

      if(rooms[data.id].revealed){
        socketio.to(data.id).emit('updateVotes', rooms[data.id].votes);
      }

      socket.broadcast.to(data.id).emit('updateUsers', {users: rooms[data.id].users, id: socket.id});
    });

    socket.on('revealVotes', function (data) {
      var votes = rooms[data.id].votes;
      rooms[data.id].revealed = true;
      socketio.to(data.id).emit('updateVotes', votes);
    });

    socket.on('clearSession', function (data) {
      rooms[data.id].users = _.map(rooms[data.id].users, function(u){ u.voted = false; return u;});
      rooms[data.id].votes = {};
      rooms[data.id].revealed = false;
      socket.broadcast.to(data.id).emit('clearVotes');
    });

    socket.on('leaveSession', function () {
      var roomId = _.findKey(rooms, function(room){
        return _.findWhere(room.users, {socketId: socket.id});
      });

      if(roomId){
        rooms[roomId].users = _.reject(rooms[roomId].users, {socketId: socket.id});
        delete rooms[roomId].votes[socket.id];
        socket.broadcast.to(roomId).emit('updateUsers', {users: rooms[roomId].users, id: socket.id});
        socket.broadcast.to(roomId).emit('updateVotes', rooms[roomId].votes);
      }
    });

    // Call onDisconnect.
    socket.on('disconnect', function () {
      var roomId = _.findKey(rooms, function(room){
        return _.findWhere(room.users, {socketId: socket.id});
      });

      if(roomId){
        rooms[roomId].users = _.reject(rooms[roomId].users, {socketId: socket.id});
        delete rooms[roomId].votes[socket.id];
        socket.broadcast.to(roomId).emit('updateUsers', {users: rooms[roomId].users, id: socket.id});
        socket.broadcast.to(roomId).emit('updateVotes', rooms[roomId].votes);
      }
      onDisconnect(socket);
    });

    // Call onConnect.
    onConnect(socket);
  });
};
