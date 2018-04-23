#!/usr/bin/env node
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

const path      = require('path');
const cmd_args  = require('command-line-args');
const chalk     = require('chalk');
const less      = require('less');
const util      = require('./util');

const option_descriptions = [
	{name: "help",             alias: "h", type: Boolean,        description: "Show this help."},
	{name: "verbose",          alias: "v", type: Boolean,        description: "Show verbose output."},
	{name: "silent",           alias: "s", type: Boolean,        description: "Do not show warning from the less compiler."},
	{name: "include-dir",      alias: 'I', value_name: 'FOLDER', description: "Add an include path for the less compiler. May be specified multiple times.", lazyMultiple: true},
	{name: "no-css",                       type: Boolean,        description: "Do not write the compiled CSS."},
]

const source_map_option_descriptions = [
	{name: "source-map",                   value_name: 'PATH',   description: "Generate a source map file."},
	{name: "source-map-inline",            type: Boolean,        description: "Generate an in-line source map.",},
	{name: "source-map-include-source",    type: Boolean,        description: "Include the sources in the source map."},
	{name: "source-map-root",              value_name: 'PATH',   description: "Root path of the less sources, relative to the location of the source map (calculated automatically if not specified)."},
	{name: "source-map-base",              value_name: 'PATH',   description: "Base path to use when forming relative paths to the source map in generated CSS output (defaults to the CSS output directory)."},
	{name: "source-map-url",               value_name: 'URL',    description: "URL or path where the source map can be retrieved, relative to the output CSS."},
]

const depends_option_descriptions = [
	{name: "depends",          alias: "d", value_name: 'PATH',   description: "Write dependency information to the given file. If the path is omitted, it will be created next to the output CSS file."},
	{name: "depends-phony",    alias: "p", type: Boolean,        description: "Add a phony target for each dependency to prevent errors if the dependency is deleted."},
	{name: "depends-target",   alias: "t", value_name: 'TARGET', description: "Manually specify the target for the generated dependencies. Needed if CSS output is written to stdout."},
]

function parseOptions() {
	const all_options = option_descriptions
		.concat(source_map_option_descriptions)
		.concat(depends_option_descriptions);
	return cmd_args(all_options, {partial: true});
}

/// Check if a value represents a path and not a standard IO object.
function isPath(value) {
	return typeof value == 'string';
}

function normalizeSourceMapOptions(options) {
	options.source_map_inline         = options.source_map_inline         || false;
	options.source_map_include_source = options.source_map_include_source || false;

	// Can't write source map both to a file and inline in the CSS.
	if (options.source_map && options.source_map_inline) throw Error('The options --source-map and --source-map-inline are mutually exclusive.');

	// Deduce source map file from CSS destination if not specified.
	if (options.source_map == '-') options.source_map = process.stdout;
	if (options.source_map === null) {
		if (isPath(options.dest)) options.source_map = options.dest + '.map';
		else throw Error('No file name given to --source-map and no destination CSS file given, can not deduce a source map file name. Either use --source-map-inline or specify a path.');
	}

	const source_dir = !isPath(options.source) ? null : path.dirname(path.resolve(options.source));
	const dest_abs   = !isPath(options.dest)   ? null : path.resolve(options.dest);
	const dest_dir   = !isPath(dest_abs)       ? null : path.dirname(dest_abs);

	// Determine the output path of the source map.
	let map_abs = null;
	if (isPath(options.source_map)) {
		map_abs = path.resolve(options.source_map);
	} else if (options.source_map_inline) {
		map_abs = dest_abs;
	}
	const map_dir = !isPath(map_abs) ? null : path.dirname(map_abs);

	// Try to deduce source_map_base.
	if (!options.source_map_base) {
		if (!dest_dir) throw Error("Can not deduce a value for --source-map-base: CSS output is being written to standard output.");
		options.source_map_base = path.resolve(dest_dir);
	}

	// Try to deduce source_map_root.
	if (!options.source_map_root) {
		if (!source_dir) throw Error("Can not deduce a value for --source-map-root: less source is being read from standard input.");
		if (!map_dir)    throw Error("Can not deduce a value for --source-map-root: source map is being written to standard output.");
		options.source_map_root = path.relative(map_dir, source_dir);
	}

	// If no source file is specified, --source-map-root is required for source maps.
	if (options.source_map) {
		if (options.source_map_inline) throw Error('Options --source-map and --source-map-inline are mutually exclusive.');
		if (!isPath(options.source)     && !options.source_map_root) throw Error('No source file given and no --source-map-root specified');
		if (!isPath(options.source_map) && !options.source_map_root) throw Error('No source map file given and no --source-map-root specified.');
	}

	return options;
}

function normalizeDependsOptions(options) {
	// Deduce dependency file from CSS destination if not specified.
	if (options.depends == '-') options.depends = process.stdout;
	if (options.depends === null) {
		if (!options.dest) throw Error('No file name given to --depends and no destination CSS file given. Please specify a path.');
		options.depends = options.dest + '.d';
	}

	// Check or deduce depends_target.
	if (options.depends_target === null) throw Error('Option --depends-target must have a value.');
	if (options.depends && !options.depends_target) {
		if (!options.dest) throw Error('Dependency tracking is enabled but no --depends-target and no destination CSS given.');
		options.depends_target = options.dest;
	}

	return options;
}

function normalizeOptions(options) {
	// Replace dashes with underscores in the key names.
	for (const old_key in options) {
		if (!options.hasOwnProperty(old_key)) continue;
		const new_key = old_key.replace(/-/g, '_');
		if (new_key == old_key) continue;
		options[new_key] = options[old_key];
		delete options[old_key];
	}

	// Make sure none of the unknown options look like flags.
	options._unknown = options._unknown || [];
	for (const option of options._unknown) {
		if (option != '-' && option[0] == '-') throw Error("unknown option: " + option);
	}

	// Make sure that SOURCE and DEST are set, if required.
	if (options._unknown.length < 1)                    throw Error('missing required parameter: SOURCE');
	if (!options.no_css && options._unknown.length < 2) throw Error('missing required parameter: DEST (or alternatively --no-css)');

	// Set options.source and options.dest
	options.source = options._unknown[0];
	options.dest   = options['no-css'] ? null : options._unknown[1];
	if (options.source == '-') options.source = process.stdin;
	if (options.dest   == '-') options.dest   = process.stdout;

	// Make sure include_dir is an array.
	options.include_dir = options.include_dir || [];

	options = normalizeSourceMapOptions(options);
	options = normalizeDependsOptions(options);

	// Check for conflicts on stdout.
	if ((options.dest === process.stdout) + (options.source_map === process.stdout) + (options.depends === process.stdout) > 1) {
		throw Error('You tried to used standard output for more than one type of output (CSS output, source map and/or depencency file). This is not supported.');
	}

	return options;
}

function sourceMapResolvedPath(options) {
	if (options.source_map)        return !isPath(options.source_map) ? "/dev/stdout" : path.resolve(options.source_map);
	if (options.source_map_inline) return !isPath(options.dest)       ? "/dev/stdout" : path.resolve(options.dest);
	throw Error("Invalid configuration, couldn't determine source map file name.");
}

function makeSourceMapOptions(options) {
	// If no source map is requested, return false.
	if (!options.source_map && !options.source_map_inline) return false;

	return {
		sourceMapFileInline:     options.source_map_inline,
		outputSourceFiles:       options.source_map_include_source,
		sourceMapBasepath:       path.resolve(options.source_map_base),
		sourceMapRootpath:       options.source_map_root,
		sourceMapOutputFilename: isPath(options.dest) ? path.basename(options.dest) : '/dev/stdout',
		sourceMapFilename:       sourceMapResolvedPath(options),
		sourceMapURL:            options.source_map_url,
	};
}

function makeLessOptions(options) {
	// Set general options.
	const result = {}
	if (options.source) {
		result.filename = options.source;
		result.paths    = [path.dirname(options.source)].concat(options.include_dir);
	} else {
		result.filename = '/dev/stdin';
		result.paths    = options.include_dir;
	}

	// Set source map options.
	result.sourceMap = makeSourceMapOptions(options);

	return result;
}

// Read the input source and run the less compiler with the right options.
function renderLess(options) {
	return util.readFile(options.source).then(data => less.render(data, makeLessOptions(options)));
}

function generateDepends(less_result, target, phony) {
	// Add the dependencies themselves.
	let result = target + ': ' + less_result.imports.join(' ') + '\n';

	// Add phony targets if requested.
	if (phony) result += less_result.imports.join(':\n') + ':\n';

	return result;
}

function renderAndWriteLess(options) {
	renderLess(options).then(result => {
		const promises = [];

		// Write the compiled CSS.
		if (!options.no_css) {
			promises.push(util.writeFile(options.dest, result.css + '\n'));
		}

		// Write the source map.
		if (options.source_map) {
			const map = result.map ? result.map + '\n' : '';
			promises.push(util.writeFile(options.source_map, map));
		}

		// Write the dependency file.
		if (options.depends) {
			const dependencies = generateDepends(result, options.depends_target, options.depends_phony);
			promises.push(util.writeFile(options.depends, dependencies));
		}

		return Promise.all(promises);
	});
}

function format_option_usage(arg) {
	let result = '--' + arg.name;
	if (arg.alias)            result += ', -' + arg.alias;
	if (arg.type !== Boolean) result += ' ' + (arg.value_name || 'VALUE');
	return result;
}

function format_options(option_descriptions) {
	let usage = option_descriptions.map(x => [format_option_usage(x), x.description || '']);
	const max_width = Math.max(...usage.map(x => x[0].length));
	return usage.map(x => x[0].padEnd(max_width + 5) + x[1]);
}

function usage(options) {
	process.stderr.write("Compile .less into .css with dependency tracking for Make.\n\n");
	process.stderr.write(chalk.bold('Usage:') + ' lessc-make [options] source dest\n');
	process.stderr.write(           '      '  + ' lessc-make [options] --no-css source\n');
	process.stderr.write('\n' + chalk.bold('Options:') + '\n');
	format_options(option_descriptions).map(x => process.stderr.write('  ' + x + '\n'));
	process.stderr.write('\n' + chalk.bold('Source map generation:') + '\n');
	format_options(source_map_option_descriptions).map(x => process.stderr.write('  ' + x + '\n'));
	process.stderr.write('\n' + chalk.bold('Dependency tracking:') + '\n');
	format_options(depends_option_descriptions).map(x => process.stderr.write('  ' + x + '\n'));
}

function main() {
	let options = parseOptions()
	if (options.help) {
		usage();
		return;
	}

	try {
		options = normalizeOptions(options)
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}

	if (options.verbose) less.logger.addListener('info', (msg) => { process.stderr.write(msg + '\n') });
	if (!options.silent) less.logger.addListener('warn', (msg) => { process.stderr.write(msg + '\n') });
	less.logger.addListener('error', (msg) => { process.stderr.write(msg + '\n') });

	renderAndWriteLess(options);
}

process.on("unhandledRejection", function(err) {
	console.error(err);
	process.exit(1);
});

main()
