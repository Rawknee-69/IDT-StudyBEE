import { UTApi } from "uploadthing/server";

// Export UTApi for server-side operations
// UTApi requires the token from environment variable
export const utapi = process.env.UPLOADTHING_TOKEN
  ? new UTApi({
      token: process.env.UPLOADTHING_TOKEN,
    })
  : null;

