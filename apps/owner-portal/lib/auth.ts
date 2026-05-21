// Re-export from web app auth config
// In production each app would have its own auth config pointing to the same DB
export { auth, handlers, signIn, signOut } from "../../web/lib/auth";
