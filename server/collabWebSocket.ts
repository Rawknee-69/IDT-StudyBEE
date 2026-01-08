import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { storage } from "./storage";
import { clerkClient, verifyToken } from "@clerk/clerk-sdk-node";


export interface WSMessage {
  type: string;
  sessionId: string;
  data?: any;
}


const sessionClients = new Map<string, Set<WebSocket>>();


const clientSessions = new Map<WebSocket, string>();


const authenticatedClients = new Map<WebSocket, string>();

export function setupCollabWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: "/collab-ws",
    verifyClient: async (info, callback) => {
      try {
        
        const url = new URL(info.req.url || "", `http://${info.req.headers.host}`);
        const tokenFromQuery = url.searchParams.get("token");
        const authHeader = info.req.headers.authorization;
        
        const token = tokenFromQuery || (authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null);
        
        if (!token) {
          callback(false, 401, "Unauthorized");
          return;
        }
        
        
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY!,
        });
        
        if (!payload || !payload.sub) {
          callback(false, 401, "Unauthorized");
          return;
        }
        
        
        (info.req as any).userId = payload.sub;
        
        
        callback(true);
      } catch (error) {
        console.error("WebSocket auth error:", error);
        callback(false, 500, "Internal Server Error");
      }
    }
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    console.log("New WebSocket connection established");

    
    const authenticatedUserId = (req as any).userId;
    
    if (!authenticatedUserId) {
      ws.close(1008, "Unauthorized");
      return;
    }

    
    authenticatedClients.set(ws, authenticatedUserId);

    ws.on("message", async (message: string) => {
      try {
        const msg: WSMessage = JSON.parse(message.toString());
        const userId = authenticatedClients.get(ws);
        
        if (!userId) {
          ws.close(1008, "Unauthorized");
          return;
        }
        
        switch (msg.type) {
          case "join":
            await handleJoin(ws, msg, userId);
            break;
          case "leave":
            await handleLeave(ws, msg, userId);
            break;
          case "tab_switch":
            await handleTabSwitch(ws, msg, userId);
            break;
          case "pause":
            await handlePause(ws, msg, userId);
            break;
          case "unpause":
            await handleUnpause(ws, msg, userId);
            break;
          case "break_start":
            await handleBreakStart(ws, msg, userId);
            break;
          case "break_end":
            await handleBreakEnd(ws, msg, userId);
            break;
          case "whiteboard_update":
            await handleWhiteboardUpdate(ws, msg, userId);
            break;
          case "mute_participant":
            await handleMuteParticipant(ws, msg, userId);
            break;
          case "kick_participant":
            await handleKickParticipant(ws, msg, userId);
            break;
          case "mute_all":
          case "unmute_all":
            await handleMuteAll(ws, msg, userId);
            break;
          case "concentration_toggle":
            await handleConcentrationToggle(ws, msg, userId);
            break;
          case "chat_message":
            await handleChatMessage(ws, msg, userId);
            break;
          case "reaction_add":
            await handleReactionAdd(ws, msg, userId);
            break;
          case "presentation_upload":
            await handlePresentationUpload(ws, msg, userId);
            break;
          case "presentation_control":
            await handlePresentationControl(ws, msg, userId);
            break;
          case "drawing_state":
            await handleDrawingState(ws, msg, userId);
            break;
          default:
            console.log("Unknown message type:", msg.type);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    });

    ws.on("close", async () => {
      const userId = authenticatedClients.get(ws);
      const sessionId = clientSessions.get(ws);
      
      if (sessionId && userId) {
        
        const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
        if (participant) {
          await storage.removeCollabParticipant(participant.id);
        }
        
        
        const clients = sessionClients.get(sessionId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            sessionClients.delete(sessionId);
          }
        }
        clientSessions.delete(ws);
        authenticatedClients.delete(ws);
        
        
        broadcast(sessionId, {
          type: "participant_left",
          sessionId,
          data: { userId },
        });
      }
      console.log("WebSocket connection closed");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  console.log("Collaboration WebSocket server initialized");
  return wss;
}


function broadcast(sessionId: string, message: WSMessage, sender?: WebSocket) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;

  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}


function broadcastToAll(sessionId: string, message: WSMessage) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;

  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}


export function notifySessionEnded(sessionId: string) {
  broadcastToAll(sessionId, {
    type: "session_ended",
    sessionId,
    data: { message: "The session has been ended by the host" },
  });
  
  
  const clients = sessionClients.get(sessionId);
  if (clients) {
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, "Session ended");
      }
    });
    sessionClients.delete(sessionId);
  }
}


function sendToClient(ws: WebSocket, message: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function handleJoin(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId } = msg;
  
  
  const session = await storage.getCollabSession(sessionId);
  if (!session || !session.isActive) {
    ws.close(1008, "Session not found or inactive");
    return;
  }
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Not authorized to join this session");
    return;
  }
  
  
  if (!sessionClients.has(sessionId)) {
    sessionClients.set(sessionId, new Set());
  }
  sessionClients.get(sessionId)!.add(ws);
  clientSessions.set(ws, sessionId);

  
  const user = await storage.getUser(userId);
  
  
  await storage.createCollabActivity({
    sessionId,
    userId,
    activityType: "join",
    metadata: { userName: user ? `${user.firstName} ${user.lastName}` : "Unknown" },
  });

  
  const participants = await storage.getActiveCollabParticipantsBySession(sessionId);
  
  
  broadcast(sessionId, {
    type: "participant_joined",
    sessionId,
    data: { participant, allParticipants: participants, userId },
  }, ws);

  
  sendToClient(ws, {
    type: "session_state",
    sessionId,
    data: { participants },
  });
}

async function handleLeave(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  const session = participant ? await storage.getCollabSession(sessionId) : null;
  
  
  if (participant && session && session.concentrationMode) {
    try {
      
      const joinTime = participant.joinedAt ? new Date(participant.joinedAt).getTime() : Date.now();
      const leaveTime = Date.now();
      const totalMinutes = Math.floor((leaveTime - joinTime) / (1000 * 60));
      
      
      
      
      const breakTimeMinutes = Math.floor(participant.breakDuration / 60);
      const tabSwitchPenalty = participant.tabSwitches * 1; 
      const effectiveStudyTime = Math.max(0, totalMinutes - breakTimeMinutes - tabSwitchPenalty);
      
      if (effectiveStudyTime > 0) {
        const user = await storage.getUser(userId);
        if (user) {
          const totalStudyTime = user.totalStudyTime + effectiveStudyTime;
          
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
          if (lastStudy) lastStudy.setHours(0, 0, 0, 0);
          
          let currentStreak = user.currentStreak;
          let shouldUpdateStreak = false;
          
          if (effectiveStudyTime >= 1) {
            shouldUpdateStreak = true;
            if (!lastStudy) {
              currentStreak = 1;
            } else if (lastStudy.getTime() === today.getTime()) {
              if (currentStreak === 0) currentStreak = 1;
            } else if (today.getTime() - lastStudy.getTime() === 86400000) {
              currentStreak++;
            } else {
              currentStreak = 1;
            }
          }

          const statsUpdate: any = {
            totalStudyTime,
          };

          if (shouldUpdateStreak) {
            statsUpdate.currentStreak = currentStreak;
            statsUpdate.longestStreak = Math.max(currentStreak, user.longestStreak);
            statsUpdate.lastStudyDate = today;
          }

          await storage.updateUserStats(userId, statsUpdate);
        }
      }
    } catch (error) {
      console.error(`Error updating study time for user ${userId} leaving collab session:`, error);
    }
  }
  
  if (participant) {
    await storage.removeCollabParticipant(participant.id);
  }

  
  await storage.createCollabActivity({
    sessionId,
    userId,
    activityType: "leave",
  });

  
  const clients = sessionClients.get(sessionId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      sessionClients.delete(sessionId);
    }
  }
  clientSessions.delete(ws);

  
  broadcast(sessionId, {
    type: "participant_left",
    sessionId,
    data: { userId },
  });
}

async function handleTabSwitch(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  if (participant) {
    await storage.updateCollabParticipant(participant.id, {
      tabSwitches: participant.tabSwitches + 1,
    });

    
    await storage.createCollabActivity({
      sessionId,
      userId,
      activityType: "tab_switch",
      metadata: { count: participant.tabSwitches + 1 },
    });

    
    broadcast(sessionId, {
      type: "tab_switch",
      sessionId,
      data: { userId, count: participant.tabSwitches + 1 },
    });
  }
}

async function handlePause(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  if (participant) {
    await storage.updateCollabParticipant(participant.id, {
      pauseCount: participant.pauseCount + 1,
    });

    await storage.createCollabActivity({
      sessionId,
      userId,
      activityType: "pause",
    });

    broadcast(sessionId, {
      type: "participant_paused",
      sessionId,
      data: { userId },
    });
  }
}

async function handleUnpause(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  await storage.createCollabActivity({
    sessionId,
    userId,
    activityType: "unpause",
  });

  broadcast(sessionId, {
    type: "participant_unpaused",
    sessionId,
    data: { userId },
  });
}

async function handleBreakStart(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  if (participant) {
    await storage.updateCollabParticipant(participant.id, {
      isOnBreak: true,
      breakStartTime: new Date(),
    });

    await storage.createCollabActivity({
      sessionId,
      userId,
      activityType: "break_start",
      metadata: { duration: data?.duration || 0 },
    });

    
    broadcast(sessionId, {
      type: "break_started",
      sessionId,
      data: { userId, duration: data?.duration },
    });
  }
}

async function handleBreakEnd(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  if (participant) {
    const breakDuration = data?.actualDuration || 0;
    await storage.updateCollabParticipant(participant.id, {
      isOnBreak: false,
      breakStartTime: null,
      breakDuration: participant.breakDuration + breakDuration,
    });

    await storage.createCollabActivity({
      sessionId,
      userId,
      activityType: "break_end",
      metadata: { duration: breakDuration },
    });

    
    broadcast(sessionId, {
      type: "break_ended",
      sessionId,
      data: { userId },
    });
  }
}

async function handleWhiteboardUpdate(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  
  broadcast(sessionId, {
    type: "whiteboard_update",
    sessionId,
    data: data,
  }, ws);
}

async function handleMuteParticipant(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  const targetUserId = data?.targetUserId;
  
  if (!targetUserId) return;
  
  
  const senderParticipant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!senderParticipant) {
    ws.close(1008, "Unauthorized");
    return;
  }

  const participant = await storage.getCollabParticipantByUserAndSession(targetUserId, sessionId);
  if (participant) {
    await storage.updateCollabParticipant(participant.id, {
      isMuted: !participant.isMuted,
    });

    broadcast(sessionId, {
      type: "participant_muted",
      sessionId,
      data: { targetUserId, isMuted: !participant.isMuted },
    });
  }
}

async function handleKickParticipant(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  const targetUserId = data?.targetUserId;
  
  if (!targetUserId) return;
  
  
  const senderParticipant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!senderParticipant) {
    ws.close(1008, "Unauthorized");
    return;
  }

  
  const session = await storage.getCollabSession(sessionId);
  if (session && session.hostUserId === userId) {
    const participant = await storage.getCollabParticipantByUserAndSession(targetUserId, sessionId);
    if (participant) {
      await storage.updateCollabParticipant(participant.id, {
        isBanned: true,
      });
      await storage.removeCollabParticipant(participant.id);

      broadcast(sessionId, {
        type: "participant_kicked",
        sessionId,
        data: { targetUserId },
      });
    }
  }
}

async function handleMuteAll(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId } = msg;
  
  
  const senderParticipant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!senderParticipant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  
  const session = await storage.getCollabSession(sessionId);
  if (session && session.hostUserId === userId) {
    const participants = await storage.getActiveCollabParticipantsBySession(sessionId);
    const shouldMute = msg.type === "mute_all";
    
    for (const participant of participants) {
      if (participant.userId !== userId) {
        await storage.updateCollabParticipant(participant.id, {
          isMuted: shouldMute,
        });
      }
    }

    broadcast(sessionId, {
      type: shouldMute ? "all_muted" : "all_unmuted",
      sessionId,
      data: {},
    });
  }
}

async function handleConcentrationToggle(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  console.log("[ConcentrationToggle] Received from userId:", userId, "sessionId:", sessionId, "data:", data);
  
  
  const senderParticipant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!senderParticipant) {
    console.log("[ConcentrationToggle] User not a participant, closing connection");
    ws.close(1008, "Unauthorized");
    return;
  }
  
  
  const session = await storage.getCollabSession(sessionId);
  console.log("[ConcentrationToggle] Session:", session?.id, "hostUserId:", session?.hostUserId, "isHost:", session?.hostUserId === userId);
  
  if (session && session.hostUserId === userId) {
    const newMode = data?.enabled ?? !session.concentrationMode;
    console.log("[ConcentrationToggle] Updating concentration mode to:", newMode);
    
    await storage.updateCollabSession(sessionId, {
      concentrationMode: newMode,
    });

    console.log("[ConcentrationToggle] Broadcasting concentration_toggled with enabled:", newMode);
    
    broadcast(sessionId, {
      type: "concentration_toggled",
      sessionId,
      data: { enabled: newMode },
    });
  } else {
    console.log("[ConcentrationToggle] User is not host, ignoring request");
  }
}

async function handleChatMessage(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  
  if (participant.isMuted) {
    sendToClient(ws, {
      type: "chat_error",
      sessionId,
      data: { message: "You are muted and cannot send messages" },
    });
    return;
  }
  
  
  const chatMessage = await storage.createCollabChatMessage({
    sessionId,
    userId,
    content: data.content,
  });
  
  
  const user = await storage.getUser(userId);
  
  
  broadcast(sessionId, {
    type: "chat_message",
    sessionId,
    data: {
      id: chatMessage.id,
      userId,
      userName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
      content: data.content,
      createdAt: chatMessage.createdAt,
    },
  });
}

async function handleReactionAdd(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  
  if (participant.isMuted) {
    sendToClient(ws, {
      type: "action_blocked",
      sessionId,
      data: { reason: "You are currently muted" },
    });
    return;
  }
  
  
  const user = await storage.getUser(userId);
  
  
  broadcast(sessionId, {
    type: "reaction_added",
    sessionId,
    data: {
      userId,
      userName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
      emoji: data.emoji,
      x: data.x,
      y: data.y,
      timestamp: new Date().toISOString(),
    },
  });
}

async function handlePresentationUpload(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  
  const presentation = await storage.createCollabPresentation({
    sessionId,
    uploadedBy: userId,
    fileName: data.fileName,
    fileUrl: data.fileUrl,
    fileType: data.fileType,
    currentPage: 1,
    isActive: false,
  });
  
  
  if (data.canEdit && Array.isArray(data.canEdit)) {
    for (const editorUserId of data.canEdit) {
      await storage.grantCollabPresentationEdit({
        presentationId: presentation.id,
        userId: editorUserId,
      });
    }
  }
  
  
  const user = await storage.getUser(userId);
  
  
  const editors = await storage.getCollabPresentationEditors(presentation.id);
  const editorUserIds = editors.map(e => e.userId);
  
  
  broadcast(sessionId, {
    type: "presentation_uploaded",
    sessionId,
    data: {
      id: presentation.id,
      uploadedBy: userId,
      uploaderName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileType: data.fileType,
      canEdit: editorUserIds,
      uploadedAt: presentation.uploadedAt,
    },
  });
}

async function handlePresentationControl(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  const { presentationId, action, value } = data;
  
  
  const presentation = await storage.getCollabPresentation(presentationId);
  if (!presentation || presentation.sessionId !== sessionId) {
    return;
  }
  
  
  const isUploader = presentation.uploadedBy === userId;
  const hasEditPermission = isUploader || await storage.hasCollabPresentationEditPermission(presentationId, userId);
  
  
  const session = await storage.getCollabSession(sessionId);
  const isHost = session?.hostUserId === userId;
  
  
  if (action === "setPage" && !isHost && !hasEditPermission) {
    sendToClient(ws, {
      type: "presentation_error",
      sessionId,
      data: { message: "You don't have permission to control this presentation" },
    });
    return;
  }
  
  
  if (action === "setPage") {
    await storage.updateCollabPresentation(presentationId, {
      currentPage: value,
    });
  } else if (action === "setActive") {
    await storage.updateCollabPresentation(presentationId, {
      isActive: value,
    });
  } else if (action === "grantEdit") {
    
    await storage.grantCollabPresentationEdit({
      presentationId,
      userId: value,
    });
  } else if (action === "revokeEdit") {
    
    await storage.revokeCollabPresentationEdit(presentationId, value);
  }
  
  
  broadcast(sessionId, {
    type: "presentation_control",
    sessionId,
    data: {
      presentationId,
      action,
      value,
      controlledBy: userId,
    },
  });
}

async function handleDrawingState(ws: WebSocket, msg: WSMessage, userId: string) {
  const { sessionId, data } = msg;
  
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (!participant) {
    ws.close(1008, "Unauthorized");
    return;
  }
  
  
  if (participant.isMuted) {
    return; 
  }
  
  
  const user = await storage.getUser(userId);
  
  
  broadcast(sessionId, {
    type: "drawing_state",
    sessionId,
    data: {
      userId,
      userName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
      isDrawing: data.isDrawing,
      tool: data.tool, 
      color: data.color,
      size: data.size,
    },
  }, ws);
}
