import type { Express, RequestHandler } from "express";
import { clerkClient, verifyToken } from "@clerk/clerk-sdk-node";


declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
      };
      user?: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        profileImageUrl: string | null;
      };
    }
  }
}

export async function setupAuth(app: Express) {
  
  
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");
    
    
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    
    if (!payload || !payload.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    
    const clerkUser = await clerkClient.users.getUser(payload.sub);
    
    
    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid || "",
    };

    
    req.user = {
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || "",
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      profileImageUrl: clerkUser.imageUrl,
    };

    next();
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

