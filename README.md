# lessc-make

`lessc-make` is a front-end to `less-js` with some extra options for easier usage with Makefiles.

It does not yet include all options that the original `lessc` supports.

```
$ lessc-make --help
Compile .less into .css with dependency tracking for Make.

Usage: lessc-make [options] source dest
       lessc-make [options] --no-css source

Options:
  --help, -h                   Show this help.
  --verbose, -v                Show verbose output.
  --silent, -s                 Do not show warning from the less compiler.
  --include-dir, -I FOLDER     Add an include path for the less compiler. May be specified multiple times.
  --no-css                     Do not write the compiled CSS.

Source map generation:
  --source-map PATH               Generate a source map file.
  --source-map-inline             Generate an in-line source map.
  --source-map-include-source     Include the sources in the source map.
  --source-map-root PATH          Root path of the less sources, relative to the location of the source map (calculated automatically if not specified).
  --source-map-base PATH          Base path to use when forming relative paths to the source map in generated CSS output (defaults to the CSS output directory).
  --source-map-url URL            URL or path where the source map can be retrieved, relative to the output CSS.

Dependency tracking:
  --depends, -d PATH              Write dependency information to the given file. If the path is omitted, it will be created next to the output CSS file.
  --depends-phony, -p             Add a phony target for each dependency to prevent errors if the dependency is deleted.
  --depends-target, -t TARGET     Manually specify the target for the generated dependencies. Needed if CSS output is written to stdout.
```
