"use strict";
require('dotenv').config({ silent: true });
const express = require("express");
const app = express();
const http = require('http').Server(app);

const bodyParser = require('body-parser');
const cors = require('cors');

app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));

const PORT = process.env.npm_package_config_port || '3233';

const socketIO = require('socket.io');

let socketConnection = socketIO(http, {
  origins: 'localhost:*',
  path: '/faucet/socket.io'
});

const faucet = require('./lib/faucet')();

app.use(bodyParser.json());
app.set('trust proxy', 1);

faucet.init();

faucet.subscribeToPendingTransactionsUpdates((data) => {
  socketConnection.emit('pendingUpdate', data)
});

faucet.subscribeToCompletedTransactionsUpdate(data => {
  socketConnection.emit('completedUpdate', data);
})

app.get('/donate/:id', (req, res) => {
  
  faucet.donate(req.params.id).then(response => {
    res.json(response);
  })
});

app.get('/status', async (req, res) => {
  
  let status = await faucet.status();
  
  res.send(status);
  
});

app.use('/public', express.static('public'));


http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


