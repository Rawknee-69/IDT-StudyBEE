import { UTApi } from "uploadthing/server";



export const utapi = process.env.UPLOADTHING_TOKEN
  ? new UTApi({
      token: process.env.UPLOADTHING_TOKEN,
    })
  : null;

