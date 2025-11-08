import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { storage } from "./storage";

// WebSocket message types
export interface WSMessage {
  type: string;
  sessionId: string;
  userId: string;
  data?: any;
}

// Connected clients map: sessionId -> Set of WebSockets
const sessionClients = new Map<string, Set<WebSocket>>();

// Client to session map for cleanup
const clientSessions = new Map<WebSocket, string>();

export function setupCollabWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: "/collab-ws"
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("New WebSocket connection established");

    ws.on("message", async (message: string) => {
      try {
        const msg: WSMessage = JSON.parse(message.toString());
        
        switch (msg.type) {
          case "join":
            await handleJoin(ws, msg);
            break;
          case "leave":
            await handleLeave(ws, msg);
            break;
          case "tab_switch":
            await handleTabSwitch(ws, msg);
            break;
          case "pause":
            await handlePause(ws, msg);
            break;
          case "unpause":
            await handleUnpause(ws, msg);
            break;
          case "break_start":
            await handleBreakStart(ws, msg);
            break;
          case "break_end":
            await handleBreakEnd(ws, msg);
            break;
          case "whiteboard_update":
            await handleWhiteboardUpdate(ws, msg);
            break;
          case "mute_participant":
            await handleMuteParticipant(ws, msg);
            break;
          case "kick_participant":
            await handleKickParticipant(ws, msg);
            break;
          case "mute_all":
            await handleMuteAll(ws, msg);
            break;
          case "concentration_toggle":
            await handleConcentrationToggle(ws, msg);
            break;
          default:
            console.log("Unknown message type:", msg.type);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      const sessionId = clientSessions.get(ws);
      if (sessionId) {
        const clients = sessionClients.get(sessionId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            sessionClients.delete(sessionId);
          }
        }
        clientSessions.delete(ws);
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

// Broadcast message to all clients in a session except sender
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

// Send message to specific client
function sendToClient(ws: WebSocket, message: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function handleJoin(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId } = msg;
  
  // Add client to session
  if (!sessionClients.has(sessionId)) {
    sessionClients.set(sessionId, new Set());
  }
  sessionClients.get(sessionId)!.add(ws);
  clientSessions.set(ws, sessionId);

  // Get participant info
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  const user = await storage.getUser(userId);
  
  // Log join activity
  await storage.createCollabActivity({
    sessionId,
    userId,
    activityType: "join",
    metadata: { userName: user ? `${user.firstName} ${user.lastName}` : "Unknown" },
  });

  // Get all active participants
  const participants = await storage.getActiveCollabParticipantsBySession(sessionId);
  
  // Notify all other clients
  broadcast(sessionId, {
    type: "participant_joined",
    sessionId,
    userId,
    data: { participant, allParticipants: participants },
  }, ws);

  // Send current state to new participant
  sendToClient(ws, {
    type: "session_state",
    sessionId,
    userId,
    data: { participants },
  });
}

async function handleLeave(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId } = msg;
  
  // Update participant
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (participant) {
    await storage.removeCollabParticipant(participant.id);
  }

  // Log leave activity
  await storage.createCollabActivity({
    sessionId,
    userId,
    activityType: "leave",
  });

  // Remove client from session
  const clients = sessionClients.get(sessionId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      sessionClients.delete(sessionId);
    }
  }
  clientSessions.delete(ws);

  // Notify others
  broadcast(sessionId, {
    type: "participant_left",
    sessionId,
    userId,
    data: { userId },
  });
}

async function handleTabSwitch(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId } = msg;
  
  // Update participant tab switch count
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
  if (participant) {
    await storage.updateCollabParticipant(participant.id, {
      tabSwitches: participant.tabSwitches + 1,
    });

    // Log activity
    await storage.createCollabActivity({
      sessionId,
      userId,
      activityType: "tab_switch",
      metadata: { count: participant.tabSwitches + 1 },
    });

    // Broadcast to all participants
    broadcast(sessionId, {
      type: "tab_switch",
      sessionId,
      userId,
      data: { userId, count: participant.tabSwitches + 1 },
    });
  }
}

async function handlePause(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId } = msg;
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
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
      userId,
      data: { userId },
    });
  }
}

async function handleUnpause(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId } = msg;
  
  await storage.createCollabActivity({
    sessionId,
    userId,
    activityType: "unpause",
  });

  broadcast(sessionId, {
    type: "participant_unpaused",
    sessionId,
    userId,
    data: { userId },
  });
}

async function handleBreakStart(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId, data } = msg;
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
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

    // Broadcast break timer to all participants
    broadcast(sessionId, {
      type: "break_started",
      sessionId,
      userId,
      data: { userId, duration: data?.duration },
    });
  }
}

async function handleBreakEnd(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId, data } = msg;
  
  const participant = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
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

    // Notify all participants break is over
    broadcast(sessionId, {
      type: "break_ended",
      sessionId,
      userId,
      data: { userId },
    });
  }
}

async function handleWhiteboardUpdate(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId, data } = msg;
  
  // Broadcast whiteboard changes to all other participants
  broadcast(sessionId, {
    type: "whiteboard_update",
    sessionId,
    userId,
    data: data,
  }, ws);
}

async function handleMuteParticipant(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId, data } = msg;
  const targetUserId = data?.targetUserId;
  
  if (!targetUserId) return;

  const participant = await storage.getCollabParticipantByUserAndSession(targetUserId, sessionId);
  if (participant) {
    await storage.updateCollabParticipant(participant.id, {
      isMuted: !participant.isMuted,
    });

    broadcast(sessionId, {
      type: "participant_muted",
      sessionId,
      userId,
      data: { targetUserId, isMuted: !participant.isMuted },
    });
  }
}

async function handleKickParticipant(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId, data } = msg;
  const targetUserId = data?.targetUserId;
  
  if (!targetUserId) return;

  // Verify sender is host
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
        userId,
        data: { targetUserId },
      });
    }
  }
}

async function handleMuteAll(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId } = msg;
  
  // Verify sender is host
  const session = await storage.getCollabSession(sessionId);
  if (session && session.hostUserId === userId) {
    const participants = await storage.getActiveCollabParticipantsBySession(sessionId);
    
    for (const participant of participants) {
      if (participant.userId !== userId) {
        await storage.updateCollabParticipant(participant.id, {
          isMuted: true,
        });
      }
    }

    broadcast(sessionId, {
      type: "all_muted",
      sessionId,
      userId,
      data: {},
    });
  }
}

async function handleConcentrationToggle(ws: WebSocket, msg: WSMessage) {
  const { sessionId, userId, data } = msg;
  
  // Verify sender is host
  const session = await storage.getCollabSession(sessionId);
  if (session && session.hostUserId === userId) {
    const newMode = data?.enabled ?? !session.concentrationMode;
    await storage.updateCollabSession(sessionId, {
      concentrationMode: newMode,
    });

    broadcast(sessionId, {
      type: "concentration_toggled",
      sessionId,
      userId,
      data: { enabled: newMode },
    });
  }
}
