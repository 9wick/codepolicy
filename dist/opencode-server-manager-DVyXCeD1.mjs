import { CreateLogger, LifecycleManager } from "./container-BlKlgD7g.mjs";
import { ResultAsync } from "neverthrow";
import { inject, injectable } from "@needle-di/core";
import _decorate from "@oxc-project/runtime/helpers/decorate";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk/v2";

//#region src/infrastructure/llm/opencode-server-manager.ts
const IDLE_CLOSE_DELAY_MS = 3e3;
const PROMPT_CACHE_KEY_PROVIDERS = [
	"copilot",
	"openai",
	"anthropic",
	"openrouter"
];
function buildProviderConfig() {
	const out = {};
	for (const id of PROMPT_CACHE_KEY_PROVIDERS) out[id] = { options: { setCacheKey: true } };
	return out;
}
function toError(cause) {
	return new Error(`OpenCode API request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
}
let OpenCodeServerManager = class OpenCodeServerManager$1 {
	cachedResult = null;
	refCount = 0;
	idleTimer = null;
	lifecycle = inject(LifecycleManager);
	log = inject(CreateLogger)("OpenCodeServerManager");
	constructor() {
		this.lifecycle.register(this);
	}
	acquire() {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		this.refCount++;
		if (!this.cachedResult) {
			this.log.info("starting new server");
			this.cachedResult = ResultAsync.fromPromise(createOpencodeServer({
				port: 0,
				config: {
					agent: { codepolicy: {
						steps: 1,
						tools: {}
					} },
					provider: buildProviderConfig()
				}
			}), toError).map((server) => ({
				client: createOpencodeClient({ baseUrl: server.url }),
				server
			})).mapErr((error) => {
				this.cachedResult = null;
				this.refCount = 0;
				return error;
			});
		}
		return this.cachedResult;
	}
	release() {
		this.refCount = Math.max(0, this.refCount - 1);
		if (this.refCount === 0 && this.cachedResult) {
			const ref = this.cachedResult;
			this.idleTimer = setTimeout(() => {
				if (this.refCount === 0 && this.cachedResult === ref) {
					this.log.info("idle timeout, closing server");
					this.cachedResult = null;
					ref.match((instance) => instance.server.close(), () => {});
				}
				this.idleTimer = null;
			}, IDLE_CLOSE_DELAY_MS);
		}
	}
	async shutdown() {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		if (this.cachedResult) {
			const ref = this.cachedResult;
			this.cachedResult = null;
			this.refCount = 0;
			await ref.match((instance) => instance.server.close(), () => {});
		}
	}
};
OpenCodeServerManager = _decorate([injectable()], OpenCodeServerManager);

//#endregion
export { OpenCodeServerManager };