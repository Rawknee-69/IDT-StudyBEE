import type { Express, RequestHandler } from "express";
import { clerkClient, verifyToken } from "@clerk/clerk-sdk-node";

// Extend Express Request to include Clerk user
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
  // Clerk middleware will be handled by the isAuthenticated middleware
  // No additional setup needed as Clerk handles auth via headers
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    // Get the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Verify the JWT token with Clerk
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    
    if (!payload || !payload.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user details from Clerk
    const clerkUser = await clerkClient.users.getUser(payload.sub);
    
    // Attach auth info to request
    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid || "",
    };

    // Attach user info to request
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

