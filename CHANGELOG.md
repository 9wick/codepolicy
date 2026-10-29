# Changelog

## [1.0.0](https://github.com/9wick/codepolicy/compare/codepolicy-v0.2.2...codepolicy-v1.0.0) (2026-10-29)


### ⚠ BREAKING CHANGES

* rule config `threshold` is replaced by `borderline` (error | warn | off, default warn) controlling how borderline verdicts are reported. Custom rule API changes: `RuleMeta.threshold` is removed and evaluators now return `RuleVerdict` instead of `{score, reason}`. Old cache entries fail validation and are re-evaluated automatically.

### Features

* add Jev PoC rules with separate infra contract tests ([2e4047b](https://github.com/9wick/codepolicy/commit/2e4047b753f97fc6ec8083ba9db617f112697888))
* add TypeSafe Jev semantic lint PoC ([f267745](https://github.com/9wick/codepolicy/commit/f267745ea789067aa8c393155c221f429b618232))
* classify implicit fallback with Jev Choice ([4441d3e](https://github.com/9wick/codepolicy/commit/4441d3ebc06c153c175736b2aa43877aa069e59f))
* replace score/threshold scoring with evidence-based verdict pipeline ([1c0bd43](https://github.com/9wick/codepolicy/commit/1c0bd43f53bd4a2fefc15d6f2c28d2bcbdd05d02))


### Bug Fixes

* distinguish interface defaults from invented fallback values ([6f3b4de](https://github.com/9wick/codepolicy/commit/6f3b4deee42bfd54b954323070faa77977019db7))
* distinguish interface defaults from invented fallback values ([63f5387](https://github.com/9wick/codepolicy/commit/63f538708f8d9d3f2db607111f5b54339de7b6d0))
* evaluate fallback causes independently ([2a5225f](https://github.com/9wick/codepolicy/commit/2a5225f705f33bb4a94a7dae835240815e500f52))
* restore Jev semantic checks and cumulative regression fixtures ([08c2f82](https://github.com/9wick/codepolicy/commit/08c2f8240061e5a84dda86835c43a6a91a0014f0))
* share evaluation cache across Jev and rule run ([7c740d0](https://github.com/9wick/codepolicy/commit/7c740d0f67ef33352e061f52c5904bd3a33daf98))

## [0.2.2](https://github.com/9wick/codepolicy/compare/codepolicy-v0.2.1...codepolicy-v0.2.2) (2026-05-07)


### Bug Fixes

* **ci:** exclude LLM integration tests from prepublishOnly ([f08678e](https://github.com/9wick/codepolicy/commit/f08678e2614448b8cfd1bb37672e021d608259dd))
* **ci:** exclude LLM integration tests from prepublishOnly ([3c611de](https://github.com/9wick/codepolicy/commit/3c611de9c83df57ebf7c576c2cb7c128833a6d8e))

## [0.2.1](https://github.com/9wick/codepolicy/compare/codepolicy-v0.2.0...codepolicy-v0.2.1) (2026-05-07)


### Bug Fixes

* **ci:** use Node 24 for native npm OIDC support ([4559328](https://github.com/9wick/codepolicy/commit/4559328d98e5e5b76f06618e64d4463f8badd6fb))
* **ci:** use Node 24 for native npm OIDC support ([c28b65c](https://github.com/9wick/codepolicy/commit/c28b65ce37052168dcad61e025569383fcb92677))

## [0.2.0](https://github.com/9wick/codepolicy/compare/codepolicy-v0.1.0...codepolicy-v0.2.0) (2026-05-07)


### Features

* **ci:** switch to release-please with npm trusted publishing ([a7b7470](https://github.com/9wick/codepolicy/commit/a7b7470d347f92a78de929c716ec91a8d34fc9c8))
* **ci:** switch to release-please with npm trusted publishing ([77baf59](https://github.com/9wick/codepolicy/commit/77baf59d16e1d233552f4e92dc663bf6383d2633))
