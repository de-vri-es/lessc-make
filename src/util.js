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
