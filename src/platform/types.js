/**
 * @typedef {Object} ChunkSurferPlatform
 * @property {'browser'|'tauri'|'steam'} kind
 * @property {boolean} nativeAchievements
 * @property {() => Promise<{ready:boolean, achievements?:unknown[], stats?:Record<string, unknown>}>} initialize
 * @property {(id:string) => Promise<boolean>} unlockAchievement
 * @property {(id:string, value:number) => Promise<boolean>} setStat
 * @property {() => Promise<boolean>} flush
 */
export {};
