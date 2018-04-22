/*
 * Copyright 2017-2018 Maarten de Vries <maarten@de-vri.es>
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
 * ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const util = module.exports;

/// Promified interface to fs.stat.
util.stat = function stat(path) {
	return new Promise((accept, reject) => {
		fs.stat(path, (err, stat) => {
			if (err) reject(err);
			else accept(stat);
		});
	});
}

/// Promified interface to fs.mkdir.
util.mkdir = function mkdir(dir, mode) {
	return new Promise((accept, reject) => {
		fs.mkdir(dir, mode, err => {
			if (err) reject(err);
			else accept();
		});
	});
}

/// Recursively create a folder hierarchy.
util.mkdirp = function mkdirp(dir, mode) {
	return util.mkdir(dir, mode).catch(err => {
		if (err.code == 'ENOENT') {
			return util.mkdirp(path.dirname(path.resolve(dir)), mode)
				.then(() => mkdir(path, mode));
		} else {
			return util.stat(dir).then(stat => {
				if (stat.isDirectory()) return Promise.resolve();
				else return Promise.reject(err);
			})
		}
	})
}

/// Read the full contents of a stream.
/**
 * \return A promise for the read data as string.
 */
util.readEntireStream = function readEntireStream(stream) {
	return new Promise((accept, reject) => {
		let buffer = '';
		stream.on('data',  chunk => { buffer += chunk.toString() });
		stream.on('error', error => { reject(error);  });
		stream.on('end',   ()    => { accept(buffer); });
	});
}

/// Read the full contents of a file or stdin.
/**
 * \return A promise for the read data as string.
 */
util.readFile = function readFile(file) {
	if (file === process.stdin) return util.readEntireStream(file);
	return util.readEntireStream(fs.createReadStream(file));
}

/// Write data to a stream and close it.
/**
 * \return A promise that completes when the data is written.
 */
util.writeStream = function writeStream(stream, data, encoding) {
	return new Promise((accept, reject) => {
		stream.on('error',  error => { reject(error) });
		stream.on('finish', ()    => { accept() });
		stream.end(data, encoding || 'utf8');
	})
}

/// Write data to a file or stdout.
/**
 * Tries to create the parent folders if needed.
 *
 * \return A promise that completes when the data is written.
 */
util.writeFile = function writeFileOrStdout(file, data, encoding) {
	if (file === process.stdout) return util.writeStream(file, data, encoding);
	if (file === process.stderr) return util.writeStream(file, data, encoding);
	return util.mkdirp(path.dirname(file)).then(() => util.writeStream(fs.createWriteStream(file), data, encoding));
}

/// Escape a string for usage in a shell command.
util.escapeShell = function escapeShell(str) {
	return "'" + str.replace(/'/g, "'\''") + "'";
}
