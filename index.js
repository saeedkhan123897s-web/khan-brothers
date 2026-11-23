'use strict';

const express = require('express');
const { createApp } = require('./backend/server');

module.exports = createApp(process.env, undefined, express());
