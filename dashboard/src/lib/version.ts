/** The release a server runs: the deployed commit on Vercel, `dev` locally. */
export const releaseVersion = () => (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 12)
