'use strict';

const fs        = require('fs');
const path      = require('path');
const cmd_args  = require('command-line-args');
const chalk     = require('chalk');
const less      = require('less');

const option_descriptions = [
	{name: "help",             alias: "h", description: "Show this help.",     type: Boolean},
	{name: "verbose",          alias: "v", description: "Show verbose output", type: Boolean},
	{name: "include-dir",      alias: 'I', description: "Add include paths for the less compiler.", lazyMultiple: true},
	{name: "source-map-file",  alias: "m", description: "Generate a source map file."},
	{name: "source-map-url",               description: "URL where the source map can be retrieved."},
	{name: "source-map-inline",            description: "Generate an in-line source map.", type: Boolean},
	{name: "no-css",                       description: "Do not write the compiled CSS.",  type: Boolean},
	{name: "depends",        alias: "d", value_name: 'FILE',   description: "Write a dependency information to the given file."},
	{name: "depends-phony",  alias: "p", value_name: 'FILE',   description: "Add a phony target for each dependency to prevent errors for deleted dependencies."},
	{name: "depends-target", alias: "t", value_name: 'TARGET', description: "Manually specify the target for the generated dependencies."},
]

function parseOptionsRaw() {
	let options = cmd_args(option_descriptions, {partial: true});

	if (options.help) return options;

	// Handle the unknown options.
	if (!options._unknown) options._unknown = []
	if (!options['no-css'] && options._unknown.length != 2) {
		throw Error('expected exactly 2 non-option arguments: source and dest, got ' + options._unknown.length + ' argument');
	} else if (options['no-css'] && options._unknown.length != 1) {
		throw Error('expected exactly 1 non-option arguments: source, got ' + options._unknown.length + ' argument');
	}

	// Make sure the unknown options don't look like flags.
	for (const option of options._unknown) {
		if (option[0] == '-') throw Error("unknown option: " + option);
	}

	// Set options.source and options.dest
	options.source = options._unknown[0];
	options.dest   = options['no-css'] ? null : options._unknown[1];

	// Check for conflicts.
	if (options.dest === '-' && options.depends === '-') {
		throw Error('Both CSS output and dependency output would be written to standard output. This is not supported.')
	}

	return options;
}

function parseOptions() {
	try {
		const options = parseOptionsRaw();
		if (options.help) {
			usage();
			process.exit(0);
		}
		return options;
	} catch (error) {
		usage();
		process.stderr.write('\n' + error.message + '\n');
		process.exit(1);
	}
}

function format_option_usage(arg) {
	let result = '--' + arg.name;
	if (arg.alias)            result += ', -' + arg.alias;
	if (arg.type !== Boolean) result += ' ' + (arg.value_name || 'VALUE');
	return result;
}

function format_options() {
	let usage = option_descriptions.map(x => [format_option_usage(x), x.description || '']);
	const max_width = Math.max(...usage.map(x => x[0].length));
	return usage.map(x => x[0].padEnd(max_width + 5) + x[1]);
}

function usage(options) {
	process.stderr.write("Compile .less into .css with dependency tracking for Make.\n\n");
	process.stderr.write(chalk.bold('Usage:') + ' lessc-make [options] source dest\n');
	process.stderr.write(           '      '  + ' lessc-make [options] --no-css source\n\n');
	process.stderr.write(chalk.bold('Options:') + '\n');
	format_options(option_descriptions).map(x => process.stderr.write('  ' + x + '\n'));
}

function renderLess(options) {
	console.log(options);
	// Set general options.
	const less_options = {}
	if (options.source != '-') {
		less_options.filename = options.source;
		less_options.paths    = [path.dirname(options.source)].concat(options.include_paths);
	} else {
		less_options.paths    = options.include_paths;
	}

	// Set source map options.
	if (options['source-map-file'] !== undefined || options['source-map-inline']) {
		const source_abs = path.resolve(process.cwd(), options.source);
		const dest_abs   = path.resolve(process.cwd(), options.dest);
		const map_abs    = path.resolve(process.cwd(), options['source-map-file'] || options.dest + '.map');
		const source_dir = path.dirname(source_abs);
		const dest_dir   = path.dirname(dest_abs);
		const map_dir    = path.dirname(map_abs);
		less_options.sourceMap = {
			sourceMapFileInline:     options['source-map-inline'] || false,
			sourceMapBasepath:       source_dir,
			sourceMapRootpath:       path.relative(map_dir, source_dir),
			sourceMapOutputFilename: path.relative(map_dir, dest_abs),
			sourceMapFilename:       path.basename(map_abs),
		};
		if (options['source-map-url']) less_options.sourceMap.sourceMapURL = options['source-map-url'];
	}

	// Read data.
	let data = options.source == '-' ? process.stdin.read() : fs.readFileSync(options.source);
	if (Buffer.isBuffer(data)) data = data.toString();

	console.log(less_options);
	return less.render(data, less_options);
}

function renderAndWriteLess(options) {
	renderLess(options).then(result => {
		console.log(result);
	});
}

function main() {
	//const plugin_manager = new less.PluginManager();
	const file_manager   = new less.FileManager();
	const plugins        = [];
	const options        = parseOptions()

	renderAndWriteLess(options);
}

process.on("unhandledRejection", function(err) {
	console.error(err);
	process.exit(1);
});

main()
