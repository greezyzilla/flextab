# Changelog

## [0.1.3](https://github.com/greezyzilla/flextab/compare/v0.1.2...v0.1.3) (2026-11-28)


### Bug Fixes

* **auth:** a refreshed token in another context is not a sign-in ([f03704d](https://github.com/greezyzilla/flextab/commit/f03704daba2d1b802a0579e5dba15324083bcd39))
* **auth:** refresh the session only in the background worker ([40a4ecf](https://github.com/greezyzilla/flextab/commit/40a4ecff2e86bae97c4aa87a68fa6f9c3575328f))
* clear the AMO validator warnings that come from our own code ([3f27d50](https://github.com/greezyzilla/flextab/commit/3f27d50f232fb3f8514ce22ffef4be1b3222f5b7))
* **release:** send the license AMO requires with every listed version ([918a403](https://github.com/greezyzilla/flextab/commit/918a403ecf9b34fba77629c8fee7496775ebb2e5))
* say a new password signs out only the other devices ([d307623](https://github.com/greezyzilla/flextab/commit/d307623b74e6df12fda0b6a9a40a026849227464))
* stop shipping the whole package.json inside the new tab page ([34baa8c](https://github.com/greezyzilla/flextab/commit/34baa8c7888594861a68cf37a24d84b4682e8cda))
* **sync:** keep saves made in other contexts while a sync result is applied ([7571003](https://github.com/greezyzilla/flextab/commit/757100317dccc1d2c12861071bbc61b9c21a3016))
* **sync:** keep the upload gate open when a page starts or stops ([f29bed9](https://github.com/greezyzilla/flextab/commit/f29bed9b0ceebb5afe967f108501569ecd73f333))
* **sync:** show "Sync error" only when an upload failed ([2250617](https://github.com/greezyzilla/flextab/commit/2250617ad5b9174fb44310b783b97028cc05184a))
* **sync:** stop treating an untouched item as changed on the server ([c485376](https://github.com/greezyzilla/flextab/commit/c4853769dcd8133e97b958fb2bfb2dbb3c402060))

## [0.1.2](https://github.com/greezyzilla/flextab/compare/v0.1.1...v0.1.2) (2026-11-24)


### Tests

* **contrast:** give the hue sweeps 60 s instead of the default 15 s ([2e1a1a4](https://github.com/greezyzilla/flextab/commit/2e1a1a42dc81b8c1ffc4f935abf7ebb16d0b216f))

## [0.1.1](https://github.com/greezyzilla/flextab/compare/v0.1.0...v0.1.1) (2026-11-24)


### Bug Fixes

* **toolbar:** fetch the toolbar icon files by a path Firefox resolves ([ec45df7](https://github.com/greezyzilla/flextab/commit/ec45df738f854e776fb1a3df785b73c3d16905aa))
